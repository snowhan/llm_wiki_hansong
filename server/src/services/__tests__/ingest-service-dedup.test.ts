/**
 * 服务端 ingest 去重与并发测试
 *
 * 核心需求：已有任务在运行（pending/running）时，收到相同 (projectId, sourcePath) 的创建请求，
 * 必须跳过创建，直接复用现有 taskId，不新建任何任务。
 *
 * 覆盖用例（S-01 ~ S-12）：
 *   S-01  pending 状态重复调用 → 返回同一 taskId
 *   S-02  running 状态重复调用 → 返回同一 taskId
 *   S-03  连续 N 次调用（同文件）→ taskStore 仅增 1 条
 *   S-04  竞态：10 次并发调用 → 仅 1 个任务
 *   S-05  done 后重新调用 → 创建新 taskId
 *   S-06  error 后重新调用 → 创建新 taskId
 *   S-07  不同 sourcePath 可并行（独立 taskId）
 *   S-08  不同 projectId 可并行（独立 taskId）
 *   S-09  folderContext 不参与去重键（同路径不同 context → 复用）
 *   S-10  taskId 格式符合 task_${ts}_${rand}
 *   S-11  去重返回的 taskId 对应任务 sourcePath / projectId 正确
 *   S-12  新建任务的 createdAt / updatedAt 时间戳合理
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock fs 防止真实 IO ───────────────────────────────────────────────────
vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn().mockRejectedValue(new Error("mock: file not found")),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock fetch 防止 LLM 真实调用
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: false,
  status: 500,
  text: () => Promise.resolve("mocked"),
  json: () => Promise.resolve({}),
  body: null,
}))

// 在 mock 生效后再引入被测模块
const {
  startIngestTask,
  getTask,
  getAllTasks,
} = await import("../ingest-service.js")

// ── 工具函数 ──────────────────────────────────────────────────────────────

let _seq = 0
/** 生成不重复的源文件路径，防止用例之间状态污染 */
function uniquePath(prefix = "raw/sources/file"): string {
  return `${prefix}_${++_seq}.pdf`
}

const PROJECT_A = "project-uuid-alpha"
const PROJECT_B = "project-uuid-beta"

// ── S-01 / S-02：核心跳过场景 ─────────────────────────────────────────────

describe("S-01 ~ S-02：pending/running 状态下重复创建必须跳过", () => {
  it("S-01: 首次创建后任务处于 pending → 第二次调用返回同一 taskId", () => {
    const src = uniquePath()
    const id1 = startIngestTask(PROJECT_A, src)
    // 任务刚创建时处于 pending（runIngest 异步启动）
    const task = getTask(id1)!
    expect(["pending", "running"]).toContain(task.status)
    const id2 = startIngestTask(PROJECT_A, src)
    expect(id2).toBe(id1)
  })

  it("S-02: 手动将任务状态设为 running → 再次调用仍返回同一 taskId", () => {
    const src = uniquePath()
    const id1 = startIngestTask(PROJECT_A, src)
    Object.assign(getTask(id1)!, { status: "running" })
    const id2 = startIngestTask(PROJECT_A, src)
    expect(id2).toBe(id1)
  })
})

// ── S-03：幂等性 ──────────────────────────────────────────────────────────

describe("S-03：连续 N 次调用幂等性", () => {
  it("同文件连续 5 次调用 → taskStore 仅增 1 条记录", () => {
    const src = uniquePath()
    const before = getAllTasks().length
    for (let i = 0; i < 5; i++) {
      startIngestTask(PROJECT_A, src)
    }
    const after = getAllTasks().length
    expect(after - before).toBe(1)
  })

  it("同文件连续 5 次调用 → 所有调用返回同一 taskId", () => {
    const src = uniquePath()
    const ids = Array.from({ length: 5 }, () => startIngestTask(PROJECT_A, src))
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(1)
  })
})

// ── S-04：竞态高频调用 ────────────────────────────────────────────────────

describe("S-04：高频并发调用竞态安全", () => {
  it("10 次同步并发调用（模拟竞态）→ 仅创建 1 个任务", () => {
    const src = uniquePath()
    const before = getAllTasks().length
    // startIngestTask 是同步函数，所以多次调用在单线程下是有序的
    // 测试确保即使快速连续调用也只建 1 条任务
    const results = Array.from({ length: 10 }, () => startIngestTask(PROJECT_A, src))
    const after = getAllTasks().length
    expect(after - before).toBe(1)
    // 所有 10 次返回值相同
    expect(new Set(results).size).toBe(1)
  })
})

// ── S-05 / S-06：完成/失败后可重新创建 ────────────────────────────────────

describe("S-05 ~ S-06：done/error 状态后允许新建任务", () => {
  it("S-05: 任务 done 后再次调用 → 生成新 taskId", () => {
    const src = uniquePath()
    const id1 = startIngestTask(PROJECT_A, src)
    Object.assign(getTask(id1)!, { status: "done" })
    const id2 = startIngestTask(PROJECT_A, src)
    expect(id2).not.toBe(id1)
  })

  it("S-05: 任务 done 后再次调用 → taskStore 新增 1 条", () => {
    const src = uniquePath()
    const id1 = startIngestTask(PROJECT_A, src)
    Object.assign(getTask(id1)!, { status: "done" })
    const before = getAllTasks().length
    startIngestTask(PROJECT_A, src)
    expect(getAllTasks().length - before).toBe(1)
  })

  it("S-06: 任务 error 后再次调用 → 生成新 taskId", () => {
    const src = uniquePath()
    const id1 = startIngestTask(PROJECT_A, src)
    Object.assign(getTask(id1)!, { status: "error" })
    const id2 = startIngestTask(PROJECT_A, src)
    expect(id2).not.toBe(id1)
  })

  it("S-06: 任务 error 后再次调用 → 新任务初始 detail 为 'Queued'", () => {
    const src = uniquePath()
    const id1 = startIngestTask(PROJECT_A, src)
    Object.assign(getTask(id1)!, { status: "error" })
    const id2 = startIngestTask(PROJECT_A, src)
    expect(getTask(id2)!.detail).toBe("Queued")
  })
})

// ── S-07 / S-08：不同维度可并行 ───────────────────────────────────────────

describe("S-07 ~ S-08：不跨文件/跨项目误判", () => {
  it("S-07: 不同 sourcePath → 各自独立 taskId（不去重）", () => {
    const src1 = uniquePath("docs/a")
    const src2 = uniquePath("docs/b")
    const id1 = startIngestTask(PROJECT_A, src1)
    const id2 = startIngestTask(PROJECT_A, src2)
    expect(id1).not.toBe(id2)
  })

  it("S-07: 10 个不同文件并行创建 → 10 条任务", () => {
    const before = getAllTasks().length
    for (let i = 0; i < 10; i++) {
      startIngestTask(PROJECT_A, uniquePath("parallel/file"))
    }
    expect(getAllTasks().length - before).toBe(10)
  })

  it("S-08: 相同 sourcePath 但不同 projectId → 各自独立 taskId", () => {
    const src = uniquePath()
    const id1 = startIngestTask(PROJECT_A, src)
    const id2 = startIngestTask(PROJECT_B, src)
    expect(id1).not.toBe(id2)
  })

  it("S-08: 不同 projectId 各自处于 pending，互不影响", () => {
    const src = uniquePath()
    const id1 = startIngestTask(PROJECT_A, src)
    const id2 = startIngestTask(PROJECT_B, src)
    expect(getTask(id1)!.projectId).toBe(PROJECT_A)
    expect(getTask(id2)!.projectId).toBe(PROJECT_B)
  })
})

// ── S-09：folderContext 不参与去重键 ──────────────────────────────────────

describe("S-09：folderContext 不参与去重", () => {
  it("同 (projectId, sourcePath) 但不同 folderContext → 仍复用同一任务", () => {
    const src = uniquePath()
    const id1 = startIngestTask(PROJECT_A, src, "context-A")
    const id2 = startIngestTask(PROJECT_A, src, "context-B")
    expect(id2).toBe(id1)
  })

  it("复用时返回的是最初创建时的 folderContext", () => {
    const src = uniquePath()
    const id1 = startIngestTask(PROJECT_A, src, "original-context")
    startIngestTask(PROJECT_A, src, "new-context")
    expect(getTask(id1)!.folderContext).toBe("original-context")
  })
})

// ── S-10：taskId 格式校验 ─────────────────────────────────────────────────

describe("S-10：taskId 格式", () => {
  it("taskId 以 'task_' 开头", () => {
    const id = startIngestTask(PROJECT_A, uniquePath())
    expect(id.startsWith("task_")).toBe(true)
  })

  it("taskId 格式符合 task_<timestamp>_<random>（三段以下划线分隔）", () => {
    const id = startIngestTask(PROJECT_A, uniquePath())
    const parts = id.split("_")
    // "task" + timestamp + random = 3 segments
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe("task")
    expect(Number(parts[1])).toBeGreaterThan(0)
    expect(parts[2].length).toBeGreaterThan(0)
  })

  it("连续生成的多个 taskId 不重复", () => {
    const ids = Array.from({ length: 20 }, () => startIngestTask(PROJECT_A, uniquePath()))
    expect(new Set(ids).size).toBe(20)
  })
})

// ── S-11：去重返回任务的数据完整性 ────────────────────────────────────────

describe("S-11：复用任务的数据完整性", () => {
  it("去重返回的 taskId 对应任务 sourcePath 与入参一致", () => {
    const src = uniquePath()
    const id1 = startIngestTask(PROJECT_A, src)
    Object.assign(getTask(id1)!, { status: "running" })
    const id2 = startIngestTask(PROJECT_A, src)
    expect(getTask(id2)!.sourcePath).toBe(src)
  })

  it("去重返回的 taskId 对应任务 projectId 与入参一致", () => {
    const src = uniquePath()
    const id1 = startIngestTask(PROJECT_A, src)
    Object.assign(getTask(id1)!, { status: "pending" })
    const id2 = startIngestTask(PROJECT_A, src)
    expect(getTask(id2)!.projectId).toBe(PROJECT_A)
  })

  it("新建任务的初始字段完整（id / projectId / sourcePath / status / filesWritten / error）", () => {
    const src = uniquePath()
    const id = startIngestTask(PROJECT_A, src)
    const task = getTask(id)!
    expect(task.id).toBe(id)
    expect(task.projectId).toBe(PROJECT_A)
    expect(task.sourcePath).toBe(src)
    expect(["pending", "running"]).toContain(task.status)
    expect(Array.isArray(task.filesWritten)).toBe(true)
    expect(task.error).toBeNull()
  })
})

// ── S-12：时间戳合理性 ────────────────────────────────────────────────────

describe("S-12：时间戳合理性", () => {
  it("新建任务的 createdAt 在当前时间附近（±5 秒）", () => {
    const before = Date.now()
    const id = startIngestTask(PROJECT_A, uniquePath())
    const after = Date.now()
    const { createdAt } = getTask(id)!
    expect(createdAt).toBeGreaterThanOrEqual(before)
    expect(createdAt).toBeLessThanOrEqual(after + 5000)
  })

  it("新建任务的 updatedAt 与 createdAt 相差不超过 100ms", () => {
    const id = startIngestTask(PROJECT_A, uniquePath())
    const { createdAt, updatedAt } = getTask(id)!
    expect(Math.abs(updatedAt - createdAt)).toBeLessThanOrEqual(100)
  })
})
