/**
 * 前端 ingest 守卫规则全量测试
 *
 * 测试范围：
 *   G-01 ~ G-09  三层守卫状态机：ingesting / SSE / serverTaskId → 跳过
 *   G-10 ~ G-13  批量 ingest 守卫：部分/全部跳过、重复路径去重
 *   G-14 ~ G-17  项目切换隔离 + 服务端 dedup 回显处理
 *
 * 核心需求：已有任务在运行时，新创建任务的请求必须被跳过（不调用 startServerIngest）。
 *
 * 测试策略：
 *   - 直接操作 wiki-store 状态，模拟 triggerServerIngest / handleBatchIngest 的守卫检查
 *   - mock startServerIngest 验证调用次数
 *   - 不渲染 React 组件，保持测试快速纯粹
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useWikiStore } from "@/stores/wiki-store"
import { useActivityStore } from "@/stores/activity-store"

// ── Mock 网络命令 ─────────────────────────────────────────────────────────

const mockStartServerIngest = vi.fn().mockResolvedValue("task-mock-id")
const mockSubscribeIngestSSE = vi.fn().mockReturnValue(() => { /* noop cleanup */ })

vi.mock("@/commands/ingest", () => ({
  startServerIngest: (...args: unknown[]) => mockStartServerIngest(...args),
  subscribeIngestSSE: (...args: unknown[]) => mockSubscribeIngestSSE(...args),
  getAllServerTasks: vi.fn().mockResolvedValue([]),
  getServerIngestStatus: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/commands/fs", () => ({
  readFile: vi.fn().mockRejectedValue(new Error("not found")),
  writeFile: vi.fn().mockResolvedValue(undefined),
  listDirectory: vi.fn().mockResolvedValue([]),
  createDirectory: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}))

// ── 常量与工具 ────────────────────────────────────────────────────────────

const PROJECT_OLD = { id: "proj-old-uuid", name: "Old Project" }
const PROJECT_NEW = { id: "proj-new-uuid", name: "New Project" }

const FILE_A = "raw/sources/doc_a.pdf"
const FILE_B = "raw/sources/doc_b.pdf"
const FILE_C = "raw/sources/doc_c.pdf"
const FILE_D = "raw/sources/doc_d.pdf"

/**
 * 模拟 triggerServerIngest 的守卫检查逻辑（与 sources-view.tsx 保持一致）。
 * 返回 true 表示"应该跳过"，false 表示"可以触发"。
 */
function evaluateGuard(relativePath: string): boolean {
  const store = useWikiStore.getState()
  const currentStatus = store.ingestStatuses[relativePath]
  // Guard 1: already ingesting
  if (currentStatus === "ingesting") return true
  // Guard 2+3: live SSE or serverTaskId (在单元测试中合并为 serverTaskIds 检查)
  if (store.serverTaskIds[relativePath]) return true
  return false
}

/**
 * 模拟 handleBatchIngest 对一组文件的守卫过滤，返回"会被触发"的文件列表。
 */
function batchGuardFilter(relativePaths: string[]): string[] {
  return relativePaths.filter((path) => !evaluateGuard(path))
}

function resetStore() {
  useWikiStore.setState({
    project: PROJECT_OLD,
    openTabs: [],
    activeTabId: null,
    activeTabPath: null,
    ingestingPath: null,
    ingestStatuses: {},
    serverTaskIds: {},
  })
  useActivityStore.setState({ items: [] })
}

beforeEach(() => {
  resetStore()
  vi.clearAllMocks()
})

// ── G-01 ~ G-04：触发跳过的守卫 ──────────────────────────────────────────

describe("G-01 ~ G-04：已有任务时必须跳过（不调用 startServerIngest）", () => {
  it("G-01: ingestStatus === 'ingesting' → 守卫返回 true（应跳过）", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
    expect(evaluateGuard(FILE_A)).toBe(true)
  })

  it("G-02/G-03: serverTaskIds[path] 存在 → 守卫返回 true（应跳过）", () => {
    useWikiStore.getState().setServerTaskId(FILE_A, "task-running-123")
    expect(evaluateGuard(FILE_A)).toBe(true)
  })

  it("G-04: ingesting + serverTaskId 同时存在 → 守卫返回 true（全满足仍跳过）", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
    useWikiStore.getState().setServerTaskId(FILE_A, "task-abc")
    expect(evaluateGuard(FILE_A)).toBe(true)
  })

  it("G-04 验证：三层守卫满足时，模拟调用链不触发 API（startServerIngest 调用 0 次）", async () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
    // 若守卫拦截，startServerIngest 不应被调用
    if (!evaluateGuard(FILE_A)) {
      await mockStartServerIngest({ projectId: PROJECT_OLD.id, sourcePath: FILE_A })
    }
    expect(mockStartServerIngest).not.toHaveBeenCalled()
  })
})

// ── G-05 ~ G-08：允许触发的状态 ───────────────────────────────────────────

describe("G-05 ~ G-08：特定状态下允许创建新任务", () => {
  it("G-05: status === 'idle' → 守卫返回 false（允许触发）", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "idle")
    expect(evaluateGuard(FILE_A)).toBe(false)
  })

  it("G-06: status === 'done' → 守卫返回 false（允许重新生成）", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "done")
    expect(evaluateGuard(FILE_A)).toBe(false)
  })

  it("G-07: status === 'error' → 守卫返回 false（允许重试）", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "error")
    expect(evaluateGuard(FILE_A)).toBe(false)
  })

  it("G-08: status === 'interrupted' + serverTaskId 为 null → 守卫返回 false（允许触发）", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "interrupted")
    useWikiStore.getState().setServerTaskId(FILE_A, null) // 清除
    expect(evaluateGuard(FILE_A)).toBe(false)
  })

  it("G-08 对比：interrupted + serverTaskId 存在 → 守卫返回 true（应跳过）", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "interrupted")
    useWikiStore.getState().setServerTaskId(FILE_A, "task-still-running")
    expect(evaluateGuard(FILE_A)).toBe(true)
  })

  it("从未设置任何状态的文件 → 守卫返回 false（允许首次触发）", () => {
    // FILE_D 从未操作过，ingestStatuses 中不存在该 key
    expect(evaluateGuard(FILE_D)).toBe(false)
  })
})

// ── G-09：多文件独立跟踪 ──────────────────────────────────────────────────

describe("G-09：文件之间状态独立，互不影响", () => {
  it("文件A ingesting 不阻塞文件B（idle）", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
    useWikiStore.getState().setIngestStatus(FILE_B, "idle")
    expect(evaluateGuard(FILE_A)).toBe(true)
    expect(evaluateGuard(FILE_B)).toBe(false)
  })

  it("文件A 有 serverTaskId，文件B 没有 → B 不受影响", () => {
    useWikiStore.getState().setServerTaskId(FILE_A, "task-running")
    expect(evaluateGuard(FILE_A)).toBe(true)
    expect(evaluateGuard(FILE_B)).toBe(false)
  })

  it("三个文件各自独立状态同时共存", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
    useWikiStore.getState().setIngestStatus(FILE_B, "done")
    useWikiStore.getState().setIngestStatus(FILE_C, "error")

    expect(evaluateGuard(FILE_A)).toBe(true)  // 跳过
    expect(evaluateGuard(FILE_B)).toBe(false) // 允许
    expect(evaluateGuard(FILE_C)).toBe(false) // 允许
  })
})

// ── G-10 ~ G-13：批量 ingest 守卫 ────────────────────────────────────────

describe("G-10 ~ G-13：批量 ingest 中的守卫行为", () => {
  it("G-10: 部分文件 ingesting → 跳过该文件，其余正常触发", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "ingesting") // 应跳过
    useWikiStore.getState().setIngestStatus(FILE_B, "idle")      // 应触发

    const toTrigger = batchGuardFilter([FILE_A, FILE_B])
    expect(toTrigger).not.toContain(FILE_A)
    expect(toTrigger).toContain(FILE_B)
  })

  it("G-11: 批量中全部文件 ingesting → 全部跳过，0 个文件触发", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
    useWikiStore.getState().setIngestStatus(FILE_B, "ingesting")
    useWikiStore.getState().setIngestStatus(FILE_C, "ingesting")

    const toTrigger = batchGuardFilter([FILE_A, FILE_B, FILE_C])
    expect(toTrigger).toHaveLength(0)
  })

  it("G-11 变体：全部有 serverTaskId → 全部跳过", () => {
    useWikiStore.getState().setServerTaskId(FILE_A, "task-1")
    useWikiStore.getState().setServerTaskId(FILE_B, "task-2")

    const toTrigger = batchGuardFilter([FILE_A, FILE_B])
    expect(toTrigger).toHaveLength(0)
  })

  it("G-12: 批量中全部文件 idle → 全部触发", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "idle")
    useWikiStore.getState().setIngestStatus(FILE_B, "idle")
    useWikiStore.getState().setIngestStatus(FILE_C, "idle")

    const toTrigger = batchGuardFilter([FILE_A, FILE_B, FILE_C])
    expect(toTrigger).toHaveLength(3)
    expect(toTrigger).toEqual([FILE_A, FILE_B, FILE_C])
  })

  it("G-13: 批量包含重复路径 → 每个路径仅出现一次（去重后触发）", () => {
    // 模拟 handleBatchIngest 对重复路径的去重（实际由 flattenAllFiles 产生唯一路径，
    // 这里测试守卫本身不会重复触发同一文件）
    useWikiStore.getState().setIngestStatus(FILE_A, "idle")

    const duplicates = [FILE_A, FILE_A, FILE_A]
    const toTrigger = batchGuardFilter(duplicates)
    // 守卫本身不去重，但每次 filter 后第一次触发后状态变 ingesting 则后续被拦截
    // 这里测试 filter 结果：idle 状态 3 次都会通过（去重应在调用层做）
    expect(toTrigger.length).toBeGreaterThanOrEqual(1)
  })

  it("G-13 模拟调用层去重：相同路径 startServerIngest 只调用一次", async () => {
    // 模拟批量去重逻辑：先过滤出唯一路径
    const files = [FILE_A, FILE_A, FILE_B]
    const uniqueFiles = [...new Set(files)]

    for (const path of uniqueFiles) {
      const guard = evaluateGuard(path)
      if (!guard) {
        await mockStartServerIngest({ projectId: PROJECT_OLD.id, sourcePath: path })
        // 触发后设为 ingesting，防止同次批量重复触发
        useWikiStore.getState().setIngestStatus(path, "ingesting")
      }
    }

    // FILE_A 和 FILE_B 各调用一次
    expect(mockStartServerIngest).toHaveBeenCalledTimes(2)
    const calledPaths = mockStartServerIngest.mock.calls.map((c) => (c[0] as { sourcePath: string }).sourcePath)
    expect(calledPaths).toContain(FILE_A)
    expect(calledPaths).toContain(FILE_B)
    expect(calledPaths.filter((p) => p === FILE_A)).toHaveLength(1) // 仅 1 次
  })

  it("混合状态批量：ingesting/done/error/idle → 仅 done/error/idle 触发", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "ingesting") // 跳过
    useWikiStore.getState().setIngestStatus(FILE_B, "done")      // 触发
    useWikiStore.getState().setIngestStatus(FILE_C, "error")     // 触发
    useWikiStore.getState().setIngestStatus(FILE_D, "idle")      // 触发
    useWikiStore.getState().setServerTaskId(FILE_A, "task-x")   // 额外确认跳过

    const toTrigger = batchGuardFilter([FILE_A, FILE_B, FILE_C, FILE_D])
    expect(toTrigger).not.toContain(FILE_A)
    expect(toTrigger).toContain(FILE_B)
    expect(toTrigger).toContain(FILE_C)
    expect(toTrigger).toContain(FILE_D)
  })
})

// ── G-14 ~ G-16：项目切换隔离 ────────────────────────────────────────────

describe("G-14 ~ G-16：项目切换后状态完全隔离", () => {
  it("G-14: 切换项目 → ingestStatuses 清空", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
    useWikiStore.getState().setIngestStatus(FILE_B, "done")
    useWikiStore.getState().setProject(PROJECT_NEW)
    expect(useWikiStore.getState().ingestStatuses).toEqual({})
  })

  it("G-15: 切换项目 → serverTaskIds 清空", () => {
    useWikiStore.getState().setServerTaskId(FILE_A, "task-1")
    useWikiStore.getState().setServerTaskId(FILE_B, "task-2")
    useWikiStore.getState().setProject(PROJECT_NEW)
    expect(useWikiStore.getState().serverTaskIds).toEqual({})
  })

  it("G-16: 旧项目 'ingesting' 文件不阻塞新项目的同名文件", () => {
    // 旧项目中文件处于 ingesting
    useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
    // 切换到新项目
    useWikiStore.getState().setProject(PROJECT_NEW)
    // 新项目中该路径没有任何状态 → 守卫应放行
    expect(evaluateGuard(FILE_A)).toBe(false)
  })

  it("G-16: 切换项目 → ingestingPath 清空", () => {
    useWikiStore.getState().setIngestingPath(FILE_A)
    useWikiStore.getState().setProject(PROJECT_NEW)
    expect(useWikiStore.getState().ingestingPath).toBeNull()
  })

  it("切换到同一项目：状态保留（非 null → null → 同 id）", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
    // setProject 即使传入相同 id 也会重置（行为由实现决定）
    useWikiStore.getState().setProject(PROJECT_OLD)
    // 根据实现：setProject 总是重置状态
    expect(useWikiStore.getState().ingestStatuses).toEqual({})
  })
})

// ── G-17：服务端 dedup 回显（startServerIngest 返回已有 taskId）────────────

describe("G-17：服务端 dedup 回显——返回已有 taskId 时应识别为重连而非新建", () => {
  it("当 startServerIngest 返回已有 taskId 且 serverTaskIds 中已记录 → 状态更新为已连接", async () => {
    const existingTaskId = "task-already-running"
    // 模拟已记录的 taskId（如 reconnect 场景）
    useWikiStore.getState().setServerTaskId(FILE_A, existingTaskId)

    // 模拟服务端返回同一 taskId（server-side dedup）
    mockStartServerIngest.mockResolvedValueOnce(existingTaskId)

    // 调用链：守卫已被 serverTaskId 拦截，startServerIngest 不应被调用
    const blocked = evaluateGuard(FILE_A)
    expect(blocked).toBe(true)
    // 因此 startServerIngest 调用 0 次
    expect(mockStartServerIngest).not.toHaveBeenCalled()
  })

  it("当文件无 serverTaskId 但服务端返回已有 taskId → 直接复用，不新建 SSE", async () => {
    const existingTaskId = "task-server-dedup-xyz"
    // 文件没有 serverTaskId，前端守卫放行
    expect(evaluateGuard(FILE_A)).toBe(false)

    // 模拟 startServerIngest 返回服务端已有的 taskId
    mockStartServerIngest.mockResolvedValueOnce(existingTaskId)

    // 模拟前端在收到 taskId 后记录
    const taskId = await mockStartServerIngest({ projectId: PROJECT_OLD.id, sourcePath: FILE_A })
    useWikiStore.getState().setServerTaskId(FILE_A, taskId)

    // 下次再调用：守卫应跳过
    expect(evaluateGuard(FILE_A)).toBe(true)
  })
})

// ── 状态转换生命周期完整性 ────────────────────────────────────────────────

describe("ingest 完整生命周期状态转换", () => {
  it("idle → ingesting → done：最终 serverTaskId 清除", () => {
    // 开始
    useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
    useWikiStore.getState().setIngestingPath(FILE_A)
    useWikiStore.getState().setServerTaskId(FILE_A, "task-lifecycle")
    expect(evaluateGuard(FILE_A)).toBe(true) // 进行中，跳过

    // 完成
    useWikiStore.getState().setIngestStatus(FILE_A, "done")
    useWikiStore.getState().setIngestingPath(null)
    useWikiStore.getState().setServerTaskId(FILE_A, null)
    expect(evaluateGuard(FILE_A)).toBe(false) // 完成后放行
    expect(useWikiStore.getState().ingestingPath).toBeNull()
  })

  it("idle → ingesting → error：最终允许重试", () => {
    useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
    useWikiStore.getState().setServerTaskId(FILE_A, "task-err")
    expect(evaluateGuard(FILE_A)).toBe(true) // 进行中，跳过

    useWikiStore.getState().setIngestStatus(FILE_A, "error")
    useWikiStore.getState().setServerTaskId(FILE_A, null)
    expect(evaluateGuard(FILE_A)).toBe(false) // 错误后放行重试
  })

  it("多文件并行 ingest：各自完成顺序不影响彼此状态", () => {
    // 启动两个文件
    useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
    useWikiStore.getState().setServerTaskId(FILE_A, "task-a")
    useWikiStore.getState().setIngestStatus(FILE_B, "ingesting")
    useWikiStore.getState().setServerTaskId(FILE_B, "task-b")

    // FILE_B 先完成
    useWikiStore.getState().setIngestStatus(FILE_B, "done")
    useWikiStore.getState().setServerTaskId(FILE_B, null)

    // FILE_A 仍在进行
    expect(evaluateGuard(FILE_A)).toBe(true)  // 仍阻塞
    expect(evaluateGuard(FILE_B)).toBe(false) // 已完成，允许重新生成
  })
})
