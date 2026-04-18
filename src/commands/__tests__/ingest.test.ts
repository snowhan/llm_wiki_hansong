/**
 * Tests for src/commands/ingest.ts — focused on subscribeIngestSSE behaviour.
 *
 * We replace the global EventSource with a FakeEventSource that exposes
 * helpers to simulate incoming messages and connection errors.
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

  /** Simulate receiving a valid SSE data message. */
  emit(payload: object) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent)
  }

  /** Simulate a raw SSE message with arbitrary string data. */
  emitRaw(data: string) {
    this.onmessage?.({ data } as MessageEvent)
  }

  /** Simulate a network-level error. */
  triggerError() {
    this.onerror?.(new Event("error"))
  }
}

function lastEs(): FakeEventSource {
  return FakeEventSource.instances[FakeEventSource.instances.length - 1]
}

// ── Task fixture ──────────────────────────────────────────────────────────

function makeTask(overrides: Partial<ServerIngestTask> = {}): ServerIngestTask {
  return {
    id: "task-1",
    projectId: "proj-uuid",
    sourcePath: "raw/sources/file.pdf",
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

// ── Tests ─────────────────────────────────────────────────────────────────

describe("subscribeIngestSSE", () => {
  it("opens an EventSource to the correct URL", () => {
    subscribeIngestSSE("task-abc", {})
    expect(lastEs().url).toBe("/api/ingest/stream/task-abc")
  })

  it("returns a cleanup function that closes the EventSource", () => {
    const cleanup = subscribeIngestSSE("task-1", {})
    const es = lastEs()
    expect(es.readyState).toBe(FakeEventSource.OPEN)
    cleanup()
    expect(es.readyState).toBe(FakeEventSource.CLOSED)
  })

  describe("onUpdate callback", () => {
    it("fires for 'state' events", () => {
      const onUpdate = vi.fn()
      subscribeIngestSSE("task-1", { onUpdate })
      const task = makeTask()
      lastEs().emit({ type: "state", task })
      expect(onUpdate).toHaveBeenCalledWith(task)
    })

    it("fires for 'update' events", () => {
      const onUpdate = vi.fn()
      subscribeIngestSSE("task-1", { onUpdate })
      const task = makeTask({ detail: "Step 2" })
      lastEs().emit({ type: "update", task })
      expect(onUpdate).toHaveBeenCalledWith(task)
    })

    it("does not fire onUpdate when task is missing", () => {
      const onUpdate = vi.fn()
      subscribeIngestSSE("task-1", { onUpdate })
      lastEs().emit({ type: "state" }) // no task field
      expect(onUpdate).not.toHaveBeenCalled()
    })
  })

  describe("onToken callback", () => {
    it("fires for 'token' events with step and token", () => {
      const onToken = vi.fn()
      subscribeIngestSSE("task-1", { onToken })
      lastEs().emit({ type: "token", step: "1", token: "Hello" })
      expect(onToken).toHaveBeenCalledWith("1", "Hello")
    })

    it("does not fire if step or token is missing", () => {
      const onToken = vi.fn()
      subscribeIngestSSE("task-1", { onToken })
      lastEs().emit({ type: "token", step: "1" }) // no token
      lastEs().emit({ type: "token", token: "X" }) // no step
      expect(onToken).not.toHaveBeenCalled()
    })
  })

  describe("onDone callback", () => {
    it("fires for 'done' events with task payload", () => {
      const onDone = vi.fn()
      subscribeIngestSSE("task-1", { onDone })
      const task = makeTask({ status: "done", filesWritten: ["wiki/a.md"] })
      lastEs().emit({ type: "done", task })
      expect(onDone).toHaveBeenCalledWith(task)
    })

    it("closes the EventSource after done", () => {
      const onDone = vi.fn()
      subscribeIngestSSE("task-1", { onDone })
      lastEs().emit({ type: "done", task: makeTask({ status: "done" }) })
      expect(lastEs().readyState).toBe(FakeEventSource.CLOSED)
    })

    it("calls onError when 'done' event has no task payload", () => {
      const onDone = vi.fn()
      const onError = vi.fn()
      subscribeIngestSSE("task-1", { onDone, onError })
      lastEs().emit({ type: "done" }) // missing task
      expect(onDone).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("Incomplete done event"))
    })
  })

  describe("onError callback", () => {
    it("fires for 'error' events from the server", () => {
      const onError = vi.fn()
      subscribeIngestSSE("task-1", { onError })
      lastEs().emit({ type: "error", message: "LLM failed" })
      expect(onError).toHaveBeenCalledWith("LLM failed")
    })

    it("fires with fallback message when 'error' event has no message", () => {
      const onError = vi.fn()
      subscribeIngestSSE("task-1", { onError })
      lastEs().emit({ type: "error" })
      expect(onError).toHaveBeenCalledWith("Unknown error")
    })

    it("fires when JSON is malformed", () => {
      const onError = vi.fn()
      subscribeIngestSSE("task-1", { onError })
      lastEs().emitRaw("not valid json {{{")
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("Invalid SSE payload"))
    })

    it("fires when the EventSource connection fails (CLOSED state)", () => {
      const onError = vi.fn()
      subscribeIngestSSE("task-1", { onError })
      const es = lastEs()
      es.readyState = FakeEventSource.CLOSED
      es.triggerError()
      expect(onError).toHaveBeenCalledWith("SSE connection error")
    })

    it("does NOT fire onError if connection was intentionally closed (after done)", () => {
      const onError = vi.fn()
      subscribeIngestSSE("task-1", { onError })
      const es = lastEs()
      // Simulate successful done → intentional close
      es.emit({ type: "done", task: makeTask({ status: "done" }) })
      // Now browser fires a stale onerror after the intentional close
      es.readyState = FakeEventSource.CLOSED
      es.triggerError()
      // Should NOT have been called a second time
      expect(onError).toHaveBeenCalledTimes(0) // done called onDone, not onError
    })

    it("does NOT fire onError when cleanup() closes the connection", () => {
      const onError = vi.fn()
      const cleanup = subscribeIngestSSE("task-1", { onError })
      cleanup()
      // Simulate stale onerror from browser after manual close
      lastEs().triggerError()
      expect(onError).not.toHaveBeenCalled()
    })
  })

  describe("multiple subscriptions", () => {
    it("each call creates an independent EventSource", () => {
      subscribeIngestSSE("task-1", {})
      subscribeIngestSSE("task-2", {})
      expect(FakeEventSource.instances).toHaveLength(2)
      expect(FakeEventSource.instances[0].url).toContain("task-1")
      expect(FakeEventSource.instances[1].url).toContain("task-2")
    })

    it("cleanup of one does not affect others", () => {
      const cleanup1 = subscribeIngestSSE("task-1", {})
      subscribeIngestSSE("task-2", {})
      cleanup1()
      expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED)
      expect(FakeEventSource.instances[1].readyState).toBe(FakeEventSource.OPEN)
    })
  })
})
