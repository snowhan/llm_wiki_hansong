/**
 * subscribeIngestSSE 全量测试（E-01 ~ E-16）
 *
 * 覆盖：
 *   E-01 ~ E-04  基础事件处理（state/update/token/done/error）
 *   E-05 ~ E-06  意图关闭后不触发 onError（done 后 / cleanup 后）
 *   E-07 ~ E-10  异常 payload 容错（非法 JSON / 缺字段）
 *   E-11 ~ E-14  断线场景与 onConnectionLost 行为
 *   E-15 ~ E-16  多订阅独立性
 *
 * 测试策略：
 *   用 FakeEventSource 替换全局 EventSource，直接触发消息/错误事件，
 *   验证回调调用情况，不依赖真实网络。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { subscribeIngestSSE } from "../ingest"
import type { ServerIngestTask } from "../ingest"

// ── FakeEventSource ───────────────────────────────────────────────────────

class FakeEventSource {
  url: string
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  readyState: number = FakeEventSource.OPEN

  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  static instances: FakeEventSource[] = []

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  close() {
    this.readyState = FakeEventSource.CLOSED
  }

  emit(payload: object) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent)
  }

  emitRaw(data: string) {
    this.onmessage?.({ data } as MessageEvent)
  }

  triggerError() {
    this.onerror?.(new Event("error"))
  }
}

function lastEs(): FakeEventSource {
  return FakeEventSource.instances[FakeEventSource.instances.length - 1]
}

// ── Task fixture ─────────────────────────────────────────────────────────

function makeTask(overrides: Partial<ServerIngestTask> = {}): ServerIngestTask {
  return {
    id: "task-test",
    projectId: "proj-uuid",
    sourcePath: "raw/sources/doc.pdf",
    folderContext: "",
    status: "running",
    detail: "Working...",
    filesWritten: [],
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal("EventSource", FakeEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── E-01：state / update 基础事件 ─────────────────────────────────────────

describe("E-01：state / update 事件触发 onUpdate", () => {
  it("'state' 类型事件触发 onUpdate(task)", () => {
    const onUpdate = vi.fn()
    subscribeIngestSSE("task-1", { onUpdate })
    const task = makeTask({ detail: "Reading source..." })
    lastEs().emit({ type: "state", task })
    expect(onUpdate).toHaveBeenCalledOnce()
    expect(onUpdate).toHaveBeenCalledWith(task)
  })

  it("'update' 类型事件触发 onUpdate(task)", () => {
    const onUpdate = vi.fn()
    subscribeIngestSSE("task-1", { onUpdate })
    const task = makeTask({ detail: "Step 1/2: Analyzing..." })
    lastEs().emit({ type: "update", task })
    expect(onUpdate).toHaveBeenCalledWith(task)
  })

  it("state 事件缺少 task 字段 → 不触发 onUpdate", () => {
    const onUpdate = vi.fn()
    subscribeIngestSSE("task-1", { onUpdate })
    lastEs().emit({ type: "state" }) // 无 task
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it("update 事件缺少 task 字段 → 不触发 onUpdate", () => {
    const onUpdate = vi.fn()
    subscribeIngestSSE("task-1", { onUpdate })
    lastEs().emit({ type: "update" }) // 无 task
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it("连续多次 update 事件 → onUpdate 按序被调用多次", () => {
    const onUpdate = vi.fn()
    subscribeIngestSSE("task-1", { onUpdate })
    for (let i = 1; i <= 3; i++) {
      lastEs().emit({ type: "update", task: makeTask({ detail: `Step ${i}` }) })
    }
    expect(onUpdate).toHaveBeenCalledTimes(3)
  })
})

// ── E-02：token 事件 ──────────────────────────────────────────────────────

describe("E-02：token 事件触发 onToken(step, token)", () => {
  it("正常 token 事件触发 onToken", () => {
    const onToken = vi.fn()
    subscribeIngestSSE("task-1", { onToken })
    lastEs().emit({ type: "token", step: "1", token: "Hello" })
    expect(onToken).toHaveBeenCalledWith("1", "Hello")
  })

  it("step 为 '2' 时也能正确触发", () => {
    const onToken = vi.fn()
    subscribeIngestSSE("task-1", { onToken })
    lastEs().emit({ type: "token", step: "2", token: " world" })
    expect(onToken).toHaveBeenCalledWith("2", " world")
  })

  it("多次 token 事件 → 按序调用", () => {
    const tokens: string[] = []
    subscribeIngestSSE("task-1", { onToken: (_, t) => tokens.push(t) })
    for (const t of ["one", "two", "three"]) {
      lastEs().emit({ type: "token", step: "1", token: t })
    }
    expect(tokens).toEqual(["one", "two", "three"])
  })
})

// ── E-03：done 事件 ───────────────────────────────────────────────────────

describe("E-03：done 事件 → onDone + 关闭 EventSource", () => {
  it("done 事件触发 onDone(task)", () => {
    const onDone = vi.fn()
    subscribeIngestSSE("task-1", { onDone })
    const task = makeTask({ status: "done", filesWritten: ["wiki/a.md", "wiki/b.md"] })
    lastEs().emit({ type: "done", task })
    expect(onDone).toHaveBeenCalledWith(task)
  })

  it("done 事件后 EventSource 自动关闭", () => {
    subscribeIngestSSE("task-1", {})
    lastEs().emit({ type: "done", task: makeTask({ status: "done" }) })
    expect(lastEs().readyState).toBe(FakeEventSource.CLOSED)
  })

  it("done 事件携带 filesWritten → 传递给 onDone", () => {
    const onDone = vi.fn()
    subscribeIngestSSE("task-1", { onDone })
    const files = ["wiki/entities/foo.md", "wiki/overview.md"]
    lastEs().emit({ type: "done", task: makeTask({ status: "done", filesWritten: files }) })
    expect(onDone.mock.calls[0][0].filesWritten).toEqual(files)
  })
})

// ── E-04：error 事件 ──────────────────────────────────────────────────────

describe("E-04：error 事件 → onError(message)", () => {
  it("server error 事件触发 onError(message)", () => {
    const onError = vi.fn()
    subscribeIngestSSE("task-1", { onError })
    lastEs().emit({ type: "error", message: "LLM API timeout" })
    expect(onError).toHaveBeenCalledWith("LLM API timeout")
  })

  it("error 事件后 EventSource 关闭", () => {
    subscribeIngestSSE("task-1", {})
    lastEs().emit({ type: "error", message: "failed" })
    expect(lastEs().readyState).toBe(FakeEventSource.CLOSED)
  })
})

// ── E-05 ~ E-06：意图关闭后不触发 onError ────────────────────────────────

describe("E-05 ~ E-06：意图关闭后 stale onerror 不触发 onError", () => {
  it("E-05: done 事件关闭后，浏览器再触发 onerror → 不调用 onError", () => {
    const onError = vi.fn()
    subscribeIngestSSE("task-1", { onError })
    const es = lastEs()
    es.emit({ type: "done", task: makeTask({ status: "done" }) })
    // 模拟浏览器在关闭后触发的 stale onerror
    es.readyState = FakeEventSource.CLOSED
    es.triggerError()
    expect(onError).not.toHaveBeenCalled()
  })

  it("E-06: cleanup() 关闭后 onerror → 不调用 onError", () => {
    const onError = vi.fn()
    const cleanup = subscribeIngestSSE("task-1", { onError })
    cleanup()
    lastEs().triggerError()
    expect(onError).not.toHaveBeenCalled()
  })

  it("E-06: cleanup() 关闭后 onConnectionLost → 也不触发", () => {
    const onConnectionLost = vi.fn()
    const cleanup = subscribeIngestSSE("task-1", { onConnectionLost })
    cleanup()
    lastEs().triggerError()
    expect(onConnectionLost).not.toHaveBeenCalled()
  })
})

// ── E-07 ~ E-10：容错（异常 payload）────────────────────────────────────

describe("E-07 ~ E-10：异常 payload 容错", () => {
  it("E-07: 非法 JSON → onError 包含 'Invalid SSE payload'", () => {
    const onError = vi.fn()
    subscribeIngestSSE("task-1", { onError })
    lastEs().emitRaw("{{{not valid json")
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("Invalid SSE payload"))
  })

  it("E-07: 空字符串 payload → onError", () => {
    const onError = vi.fn()
    subscribeIngestSSE("task-1", { onError })
    lastEs().emitRaw("")
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("Invalid SSE payload"))
  })

  it("E-08: done 事件缺少 task → onError 包含 'Incomplete done event'", () => {
    const onDone = vi.fn()
    const onError = vi.fn()
    subscribeIngestSSE("task-1", { onDone, onError })
    lastEs().emit({ type: "done" }) // 无 task
    expect(onDone).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("Incomplete done event"))
  })

  it("E-09: error 事件缺少 message → onError('Unknown error')", () => {
    const onError = vi.fn()
    subscribeIngestSSE("task-1", { onError })
    lastEs().emit({ type: "error" }) // 无 message
    expect(onError).toHaveBeenCalledWith("Unknown error")
  })

  it("E-10: token 事件缺少 step → 不触发 onToken", () => {
    const onToken = vi.fn()
    subscribeIngestSSE("task-1", { onToken })
    lastEs().emit({ type: "token", token: "hello" }) // 无 step
    expect(onToken).not.toHaveBeenCalled()
  })

  it("E-10: token 事件缺少 token → 不触发 onToken", () => {
    const onToken = vi.fn()
    subscribeIngestSSE("task-1", { onToken })
    lastEs().emit({ type: "token", step: "1" }) // 无 token
    expect(onToken).not.toHaveBeenCalled()
  })

  it("E-10: token 事件 step 和 token 都缺少 → 不触发 onToken", () => {
    const onToken = vi.fn()
    subscribeIngestSSE("task-1", { onToken })
    lastEs().emit({ type: "token" }) // 两者均无
    expect(onToken).not.toHaveBeenCalled()
  })

  it("未知类型事件 → 不触发任何回调", () => {
    const onUpdate = vi.fn()
    const onToken = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()
    subscribeIngestSSE("task-1", { onUpdate, onToken, onDone, onError })
    lastEs().emit({ type: "progress", value: 50 }) // 未知类型
    expect(onUpdate).not.toHaveBeenCalled()
    expect(onToken).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})

// ── E-11 ~ E-14：断线与 onConnectionLost ─────────────────────────────────

describe("E-11 ~ E-14：断线场景与 onConnectionLost", () => {
  it("E-11: CLOSED 状态断线 → 触发 onConnectionLost（而非 onError）", () => {
    const onConnectionLost = vi.fn()
    const onError = vi.fn()
    subscribeIngestSSE("task-1", { onConnectionLost, onError })
    const es = lastEs()
    es.readyState = FakeEventSource.CLOSED
    es.triggerError()
    expect(onConnectionLost).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  it("E-11: 无 onConnectionLost 时 CLOSED 断线 → fallback 到 onError('SSE connection error')", () => {
    const onError = vi.fn()
    subscribeIngestSSE("task-1", { onError })
    const es = lastEs()
    es.readyState = FakeEventSource.CLOSED
    es.triggerError()
    expect(onError).toHaveBeenCalledWith("SSE connection error")
  })

  it("E-11: CONNECTING 状态断线（readyState=0）→ 不触发 onConnectionLost（仅 CLOSED 时触发）", () => {
    const onConnectionLost = vi.fn()
    const onError = vi.fn()
    subscribeIngestSSE("task-1", { onConnectionLost, onError })
    const es = lastEs()
    es.readyState = FakeEventSource.CONNECTING // 0
    es.triggerError()
    // CONNECTING 状态，不满足 CLOSED 条件，回调不触发
    expect(onConnectionLost).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it("E-11: OPEN 状态下的 onerror → 不触发 onConnectionLost（浏览器可能自动重连）", () => {
    const onConnectionLost = vi.fn()
    subscribeIngestSSE("task-1", { onConnectionLost })
    const es = lastEs()
    es.readyState = FakeEventSource.OPEN
    es.triggerError()
    expect(onConnectionLost).not.toHaveBeenCalled()
  })

  it("E-14: onConnectionLost 只触发一次（第二次 onerror 被屏蔽）", () => {
    const onConnectionLost = vi.fn()
    subscribeIngestSSE("task-1", { onConnectionLost })
    const es = lastEs()
    es.readyState = FakeEventSource.CLOSED
    es.triggerError()
    // 第二次触发（如果有）应被屏蔽（intentionallyClosed 已设 true）
    es.triggerError()
    expect(onConnectionLost).toHaveBeenCalledTimes(1)
  })
})

// ── E-15 ~ E-16：多订阅独立性 ────────────────────────────────────────────

describe("E-15 ~ E-16：多订阅实例独立", () => {
  it("E-15: 同一任务两次 subscribeIngestSSE → 创建两个独立 EventSource 实例", () => {
    subscribeIngestSSE("task-1", {})
    subscribeIngestSSE("task-1", {})
    expect(FakeEventSource.instances).toHaveLength(2)
  })

  it("E-15: 不同任务两次 subscribe → 各自指向正确 URL", () => {
    subscribeIngestSSE("task-alpha", {})
    subscribeIngestSSE("task-beta", {})
    expect(FakeEventSource.instances[0].url).toContain("task-alpha")
    expect(FakeEventSource.instances[1].url).toContain("task-beta")
  })

  it("E-16: cleanup task-1 → task-2 的 EventSource 仍然开启", () => {
    const cleanup1 = subscribeIngestSSE("task-1", {})
    subscribeIngestSSE("task-2", {})
    cleanup1()
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED)
    expect(FakeEventSource.instances[1].readyState).toBe(FakeEventSource.OPEN)
  })

  it("E-16: 两个订阅各自收到独立的事件", () => {
    const onUpdate1 = vi.fn()
    const onUpdate2 = vi.fn()
    subscribeIngestSSE("task-1", { onUpdate: onUpdate1 })
    subscribeIngestSSE("task-2", { onUpdate: onUpdate2 })

    // 向 task-1 的 EventSource 发事件
    FakeEventSource.instances[0].emit({ type: "update", task: makeTask({ id: "task-1" }) })
    expect(onUpdate1).toHaveBeenCalledOnce()
    expect(onUpdate2).not.toHaveBeenCalled()

    // 向 task-2 的 EventSource 发事件
    FakeEventSource.instances[1].emit({ type: "update", task: makeTask({ id: "task-2" }) })
    expect(onUpdate2).toHaveBeenCalledOnce()
  })

  it("同一回调被传入两个订阅 → 每个订阅各自触发一次", () => {
    const onDone = vi.fn()
    subscribeIngestSSE("task-1", { onDone })
    subscribeIngestSSE("task-2", { onDone })
    FakeEventSource.instances[0].emit({ type: "done", task: makeTask({ status: "done" }) })
    expect(onDone).toHaveBeenCalledTimes(1) // 只有 task-1 完成
    FakeEventSource.instances[1].emit({ type: "done", task: makeTask({ status: "done" }) })
    expect(onDone).toHaveBeenCalledTimes(2) // task-2 也完成
  })
})

// ── 补充：URL 构建 ────────────────────────────────────────────────────────

describe("EventSource URL 构建", () => {
  it("无 token 时 URL 为 /api/ingest/stream/<taskId>", () => {
    subscribeIngestSSE("task-xyz", {})
    expect(lastEs().url).toBe("/api/ingest/stream/task-xyz")
  })

  it("cleanup 函数关闭 EventSource", () => {
    const cleanup = subscribeIngestSSE("task-close", {})
    expect(lastEs().readyState).toBe(FakeEventSource.OPEN)
    cleanup()
    expect(lastEs().readyState).toBe(FakeEventSource.CLOSED)
  })
})
