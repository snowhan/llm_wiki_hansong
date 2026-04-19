/**
 * Activity Store 重载归一化行为测试（A-01 ~ A-09）
 *
 * 覆盖：
 *   A-01  重载时 running → error（detail 含"页面刷新中断"）
 *   A-02  重载后所有 error items 被丢弃
 *   A-03  24h 内的 done items 保留
 *   A-04  超过 24h 的 done items 被丢弃
 *   A-05  重载时有多个 running → 全部变 error 再被丢弃
 *   A-06  addItem 生成唯一 id
 *   A-07  updateItem 只修改对应 id，不影响其他
 *   A-08  runningCount 正确反映 status === "running" 数量
 *   A-09  混合状态重载后仅保留 24h 内 done
 *
 * 测试策略：
 *   onRehydrateStorage 回调逻辑直接从 store 实现中提取出来做单元测试，
 *   避免依赖真实 IndexedDB/localStorage 的异步加载时机。
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useActivityStore } from "../activity-store"
import type { ActivityItem } from "../activity-store"

// ── 重载归一化函数（与 activity-store.ts 中 onRehydrateStorage 逻辑保持一致）──

/**
 * 模拟 onRehydrateStorage 的归一化逻辑，供单元测试直接调用。
 * @param items  重载前持久化的 items
 * @param now    当前时间戳（方便测试时注入 mock 时间）
 */
function simulateRehydration(items: ActivityItem[], now = Date.now()): ActivityItem[] {
  const normalized = items
    .map((item) =>
      item.status === "running"
        ? { ...item, status: "error" as const, detail: "任务被页面刷新中断，请重新生成" }
        : item
    )
    .filter((item) =>
      // 只保留 24h 内的 done，其余（包括 error）全部丢弃
      item.status === "done"
        ? now - item.createdAt < 24 * 60 * 60 * 1000
        : false
    )

  const seen = new Set<string>()
  return normalized.map((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      return item
    }
    let suffix = 1
    let nextId = `${item.id}-dedup-${suffix}`
    while (seen.has(nextId)) {
      suffix += 1
      nextId = `${item.id}-dedup-${suffix}`
    }
    seen.add(nextId)
    return { ...item, id: nextId }
  })
}

// ── 辅助构建 ActivityItem ────────────────────────────────────────────────

function makeItem(
  overrides: Partial<ActivityItem> = {},
): ActivityItem {
  return {
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "ingest",
    title: "doc.pdf",
    status: "running",
    detail: "Working...",
    filesWritten: [],
    createdAt: Date.now(),
    ...overrides,
  }
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// ── Store reset ──────────────────────────────────────────────────────────

beforeEach(() => {
  useActivityStore.setState({ items: [] })
  vi.clearAllMocks()
})

// ── A-01：running → error ─────────────────────────────────────────────────

describe("A-01：页面重载时 running 变为 error", () => {
  it("A-01: running 状态变为 error", () => {
    const item = makeItem({ status: "running" })
    // 先转为 error，再过滤，最终被丢弃 → 验证 map 步骤
    const mapped = [item].map((i) =>
      i.status === "running"
        ? { ...i, status: "error" as const, detail: "任务被页面刷新中断，请重新生成" }
        : i
    )
    expect(mapped[0].status).toBe("error")
  })

  it("A-01: detail 包含 '任务被页面刷新中断'", () => {
    const item = makeItem({ status: "running" })
    const mapped = [item].map((i) =>
      i.status === "running"
        ? { ...i, status: "error" as const, detail: "任务被页面刷新中断，请重新生成" }
        : i
    )
    expect(mapped[0].detail).toContain("任务被页面刷新中断")
  })

  it("A-01 端到端: 重载后 running 条目被丢弃（变 error 后不保留）", () => {
    const item = makeItem({ status: "running" })
    const result = simulateRehydration([item])
    // running → error → 被 filter 掉
    expect(result).toHaveLength(0)
  })

  it("A-01: lint/query 类型的 running 同样被转为 error", () => {
    const lintItem = makeItem({ status: "running", type: "lint" })
    const queryItem = makeItem({ status: "running", type: "query" })
    const mapped = [lintItem, queryItem].map((i) =>
      i.status === "running"
        ? { ...i, status: "error" as const, detail: "任务被页面刷新中断，请重新生成" }
        : i
    )
    expect(mapped[0].status).toBe("error")
    expect(mapped[1].status).toBe("error")
  })
})

// ── A-02：error items 被丢弃 ──────────────────────────────────────────────

describe("A-02：重载后所有 error items 被丢弃", () => {
  it("A-02: 原本就是 error 的 item 被丢弃", () => {
    const item = makeItem({ status: "error" })
    const result = simulateRehydration([item])
    expect(result).toHaveLength(0)
  })

  it("A-02: 多个 error items 全部被丢弃", () => {
    const items = [
      makeItem({ status: "error", title: "A" }),
      makeItem({ status: "error", title: "B" }),
      makeItem({ status: "error", title: "C" }),
    ]
    const result = simulateRehydration(items)
    expect(result).toHaveLength(0)
  })

  it("A-02: running（→error 后）和原本 error 都被丢弃", () => {
    const items = [
      makeItem({ status: "running" }),  // 变 error 后丢弃
      makeItem({ status: "error" }),    // 直接丢弃
    ]
    const result = simulateRehydration(items)
    expect(result).toHaveLength(0)
  })
})

// ── A-03 ~ A-04：done items 24h 保留策略 ──────────────────────────────────

describe("A-03 ~ A-04：24h 内 done 保留，超过则丢弃", () => {
  it("A-03: 1 小时前的 done item 保留", () => {
    const item = makeItem({ status: "done", createdAt: Date.now() - HOUR_MS })
    const result = simulateRehydration([item])
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("done")
  })

  it("A-03: 刚刚创建的 done item 保留", () => {
    const item = makeItem({ status: "done", createdAt: Date.now() })
    const result = simulateRehydration([item])
    expect(result).toHaveLength(1)
  })

  it("A-03: 23.5 小时前的 done item 保留", () => {
    const item = makeItem({ status: "done", createdAt: Date.now() - 23.5 * HOUR_MS })
    const result = simulateRehydration([item])
    expect(result).toHaveLength(1)
  })

  it("A-04: 超过 24 小时的 done item 被丢弃", () => {
    const item = makeItem({ status: "done", createdAt: Date.now() - (DAY_MS + 1000) })
    const result = simulateRehydration([item])
    expect(result).toHaveLength(0)
  })

  it("A-04: 恰好 24 小时前的 done item 被丢弃（边界：not < 24h）", () => {
    const item = makeItem({ status: "done", createdAt: Date.now() - DAY_MS })
    const result = simulateRehydration([item])
    // now - createdAt == DAY_MS，不满足 < DAY_MS
    expect(result).toHaveLength(0)
  })

  it("A-04: 48 小时前的 done item 被丢弃", () => {
    const item = makeItem({ status: "done", createdAt: Date.now() - 2 * DAY_MS })
    const result = simulateRehydration([item])
    expect(result).toHaveLength(0)
  })
})

// ── A-05：多个 running 全部处理 ───────────────────────────────────────────

describe("A-05：多个 running 条目全部转 error 再被丢弃", () => {
  it("A-05: 5 个 running items → 重载后全部消失", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeItem({ status: "running", title: `file_${i}.pdf` })
    )
    const result = simulateRehydration(items)
    expect(result).toHaveLength(0)
  })

  it("A-05: 混合 running + done(新) → 只保留 done", () => {
    const items = [
      makeItem({ status: "running" }),
      makeItem({ status: "done", createdAt: Date.now() - HOUR_MS }),
      makeItem({ status: "running" }),
    ]
    const result = simulateRehydration(items)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("done")
  })
})

// ── A-06：addItem 唯一 id ─────────────────────────────────────────────────

describe("A-06：addItem 生成唯一 id", () => {
  it("A-06: 单次 addItem 返回以 'activity-' 开头的 id", () => {
    const id = useActivityStore.getState().addItem({
      type: "ingest",
      title: "test.pdf",
      status: "running",
      detail: "",
      filesWritten: [],
    })
    expect(id).toMatch(/^activity-/)
  })

  it("A-06: 连续 10 次 addItem → 10 个唯一 id", () => {
    const ids = Array.from({ length: 10 }, () =>
      useActivityStore.getState().addItem({
        type: "ingest",
        title: "f.pdf",
        status: "running",
        detail: "",
        filesWritten: [],
      })
    )
    expect(new Set(ids).size).toBe(10)
  })

  it("A-06: addItem 返回的 id 与 store 中的 item.id 一致", () => {
    const id = useActivityStore.getState().addItem({
      type: "ingest",
      title: "doc.pdf",
      status: "running",
      detail: "",
      filesWritten: [],
    })
    const item = useActivityStore.getState().items.find((i) => i.id === id)
    expect(item).toBeDefined()
    expect(item!.id).toBe(id)
  })
})

// ── A-07：updateItem 精确更新 ─────────────────────────────────────────────

describe("A-07：updateItem 只修改目标 id，不影响其他 item", () => {
  it("A-07: 更新 item1 的 status → item2 不受影响", () => {
    const id1 = useActivityStore.getState().addItem({
      type: "ingest", title: "a.pdf", status: "running", detail: "", filesWritten: [],
    })
    const id2 = useActivityStore.getState().addItem({
      type: "ingest", title: "b.pdf", status: "running", detail: "", filesWritten: [],
    })
    useActivityStore.getState().updateItem(id1, { status: "done" })
    const item2 = useActivityStore.getState().items.find((i) => i.id === id2)
    expect(item2?.status).toBe("running")
  })

  it("A-07: 更新 item1 的 detail → item2 的 detail 不变", () => {
    const id1 = useActivityStore.getState().addItem({
      type: "ingest", title: "a.pdf", status: "running", detail: "initial", filesWritten: [],
    })
    const id2 = useActivityStore.getState().addItem({
      type: "ingest", title: "b.pdf", status: "running", detail: "other", filesWritten: [],
    })
    useActivityStore.getState().updateItem(id1, { detail: "updated" })
    const item2 = useActivityStore.getState().items.find((i) => i.id === id2)
    expect(item2?.detail).toBe("other")
  })

  it("A-07: 更新不存在的 id → items 不变", () => {
    useActivityStore.getState().addItem({
      type: "ingest", title: "doc.pdf", status: "running", detail: "", filesWritten: [],
    })
    const before = useActivityStore.getState().items.length
    useActivityStore.getState().updateItem("nonexistent-id", { status: "done" })
    expect(useActivityStore.getState().items.length).toBe(before)
  })

  it("A-07: 可同时更新 status + detail + filesWritten", () => {
    const id = useActivityStore.getState().addItem({
      type: "ingest", title: "doc.pdf", status: "running", detail: "start", filesWritten: [],
    })
    useActivityStore.getState().updateItem(id, {
      status: "done",
      detail: "3 files written",
      filesWritten: ["wiki/a.md", "wiki/b.md", "wiki/c.md"],
    })
    const item = useActivityStore.getState().items.find((i) => i.id === id)
    expect(item?.status).toBe("done")
    expect(item?.detail).toBe("3 files written")
    expect(item?.filesWritten).toHaveLength(3)
  })
})

// ── A-08：runningCount ────────────────────────────────────────────────────

describe("A-08：runningCount 正确反映 running items 数量", () => {
  /** 模拟 activity-panel 的 runningCount 计算 */
  function getRunningCount(): number {
    return useActivityStore.getState().items.filter((i) => i.status === "running").length
  }

  it("A-08: 初始为 0", () => {
    expect(getRunningCount()).toBe(0)
  })

  it("A-08: 添加 1 个 running → count = 1", () => {
    useActivityStore.getState().addItem({
      type: "ingest", title: "a.pdf", status: "running", detail: "", filesWritten: [],
    })
    expect(getRunningCount()).toBe(1)
  })

  it("A-08: 添加 3 个 running → count = 3", () => {
    for (let i = 0; i < 3; i++) {
      useActivityStore.getState().addItem({
        type: "ingest", title: `${i}.pdf`, status: "running", detail: "", filesWritten: [],
      })
    }
    expect(getRunningCount()).toBe(3)
  })

  it("A-08: 1 running + 1 done + 1 error → count = 1", () => {
    const idR = useActivityStore.getState().addItem({
      type: "ingest", title: "r.pdf", status: "running", detail: "", filesWritten: [],
    })
    const idD = useActivityStore.getState().addItem({
      type: "ingest", title: "d.pdf", status: "running", detail: "", filesWritten: [],
    })
    const idE = useActivityStore.getState().addItem({
      type: "ingest", title: "e.pdf", status: "running", detail: "", filesWritten: [],
    })
    useActivityStore.getState().updateItem(idD, { status: "done" })
    useActivityStore.getState().updateItem(idE, { status: "error" })
    expect(getRunningCount()).toBe(1) // 只有 idR 还是 running
    void idR // suppress unused warning
  })

  it("A-08: running → done 后 count 减少", () => {
    const id = useActivityStore.getState().addItem({
      type: "ingest", title: "a.pdf", status: "running", detail: "", filesWritten: [],
    })
    expect(getRunningCount()).toBe(1)
    useActivityStore.getState().updateItem(id, { status: "done" })
    expect(getRunningCount()).toBe(0)
  })
})

// ── A-09：混合状态重载后仅保留 24h 内 done ────────────────────────────────

describe("A-09：混合状态重载——综合场景", () => {
  it("A-09: running+done(新)+done(旧)+error → 只保留新 done", () => {
    const items: ActivityItem[] = [
      makeItem({ status: "running", title: "running.pdf" }),
      makeItem({ status: "done", title: "done-new.pdf", createdAt: Date.now() - HOUR_MS }),
      makeItem({ status: "done", title: "done-old.pdf", createdAt: Date.now() - 2 * DAY_MS }),
      makeItem({ status: "error", title: "error.pdf" }),
    ]
    const result = simulateRehydration(items)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe("done-new.pdf")
  })

  it("A-09: 5 running + 3 done(新) + 2 done(旧) → 保留 3 条", () => {
    const items: ActivityItem[] = [
      ...Array.from({ length: 5 }, (_, i) => makeItem({ status: "running", title: `r${i}.pdf` })),
      ...Array.from({ length: 3 }, (_, i) =>
        makeItem({ status: "done", title: `dn${i}.pdf`, createdAt: Date.now() - HOUR_MS * i })
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        makeItem({ status: "done", title: `do${i}.pdf`, createdAt: Date.now() - (DAY_MS + HOUR_MS * i) })
      ),
    ]
    const result = simulateRehydration(items)
    expect(result).toHaveLength(3)
    result.forEach((i) => {
      expect(i.status).toBe("done")
      expect(i.title.startsWith("dn")).toBe(true)
    })
  })

  it("A-09: 全部为旧 done → 重载后 items 为空", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ status: "done", createdAt: Date.now() - (DAY_MS + i * HOUR_MS) })
    )
    const result = simulateRehydration(items)
    expect(result).toHaveLength(0)
  })

  it("A-09: 全部为新 done → 重载后全部保留", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeItem({ status: "done", title: `f${i}.pdf`, createdAt: Date.now() - i * HOUR_MS })
    )
    const result = simulateRehydration(items)
    expect(result).toHaveLength(5)
  })

  it("A-09: useActivityStore.setState 直接应用归一化结果后状态正确", () => {
    const items: ActivityItem[] = [
      makeItem({ status: "running" }),
      makeItem({ status: "done", createdAt: Date.now() - 2 * HOUR_MS }),
    ]
    const normalized = simulateRehydration(items)
    useActivityStore.setState({ items: normalized })
    const storeItems = useActivityStore.getState().items
    expect(storeItems).toHaveLength(1)
    expect(storeItems[0].status).toBe("done")
  })

  it("A-09: 重载后若存在重复 id，会自动去重为唯一 id", () => {
    const duplicatedId = "activity-8"
    const items: ActivityItem[] = [
      makeItem({ id: duplicatedId, status: "done", createdAt: Date.now() - HOUR_MS }),
      makeItem({ id: duplicatedId, status: "done", createdAt: Date.now() - 2 * HOUR_MS }),
    ]
    const normalized = simulateRehydration(items)
    const ids = normalized.map((i) => i.id)
    expect(new Set(ids).size).toBe(2)
  })
})
