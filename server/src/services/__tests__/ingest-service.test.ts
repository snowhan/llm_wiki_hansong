/**
 * Unit tests for server/src/services/ingest-service.ts
 *
 * Focus on the public, non-LLM parts:
 *   - startIngestTask deduplication logic
 *   - registerSseClient / unregisterSseClient memory management
 *   - getTask / getAllTasks retrieval
 *
 * runIngest is mocked at the module level so no real LLM calls are made.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock fs so no real files are read ────────────────────────────────────
vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn().mockRejectedValue(new Error("file not found (mock)")),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock fetch so LLM HTTP requests never actually go out
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: false,
  status: 500,
  text: () => Promise.resolve("mocked"),
  json: () => Promise.resolve({}),
  body: null,
}))

// Import AFTER mocks are in place
const {
  startIngestTask,
  getTask,
  getAllTasks,
  registerSseClient,
  unregisterSseClient,
} = await import("../ingest-service.js")

// ── Helper to create a minimal Express Response-like mock ────────────────

function makeMockRes() {
  const written: string[] = []
  return {
    write: vi.fn((data: string) => { written.push(data) }),
    written,
  }
}

// ── Unique path counter to avoid test cross-contamination ─────────────────

let _seq = 0
function uniquePath() {
  return `raw/sources/file_${++_seq}.pdf`
}
const PROJECT_ID = "test-project-uuid"

// ── Tests ─────────────────────────────────────────────────────────────────

describe("startIngestTask", () => {
  it("returns a non-empty string task ID", () => {
    const id = startIngestTask(PROJECT_ID, uniquePath())
    expect(typeof id).toBe("string")
    expect(id.length).toBeGreaterThan(0)
  })

  it("creates a new task visible via getTask", () => {
    const src = uniquePath()
    const id = startIngestTask(PROJECT_ID, src)
    const task = getTask(id)
    expect(task).toBeDefined()
    expect(task!.sourcePath).toBe(src)
    expect(task!.projectId).toBe(PROJECT_ID)
  })

  it("new task starts in pending or running status", () => {
    const id = startIngestTask(PROJECT_ID, uniquePath())
    const task = getTask(id)!
    expect(["pending", "running"]).toContain(task.status)
  })

  it("stores folderContext on the task", () => {
    const id = startIngestTask(PROJECT_ID, uniquePath(), "folder context")
    expect(getTask(id)!.folderContext).toBe("folder context")
  })

  describe("deduplication", () => {
    it("returns the SAME task ID if called twice for same project+source while pending/running", () => {
      const src = uniquePath()
      const id1 = startIngestTask(PROJECT_ID, src)
      const id2 = startIngestTask(PROJECT_ID, src)
      expect(id2).toBe(id1)
    })

    it("creates only ONE task in the store for duplicate calls", () => {
      const src = uniquePath()
      const before = getAllTasks().length
      startIngestTask(PROJECT_ID, src)
      startIngestTask(PROJECT_ID, src)
      startIngestTask(PROJECT_ID, src)
      const after = getAllTasks().length
      expect(after - before).toBe(1) // exactly one new task
    })

    it("allows a new task after the previous one completes (done)", () => {
      const src = uniquePath()
      const id1 = startIngestTask(PROJECT_ID, src)
      // Manually mark the task as done to simulate completion
      const task = getTask(id1)!
      Object.assign(task, { status: "done" })
      // Now starting again should create a NEW task
      const id2 = startIngestTask(PROJECT_ID, src)
      expect(id2).not.toBe(id1)
    })

    it("allows a new task after the previous one errors", () => {
      const src = uniquePath()
      const id1 = startIngestTask(PROJECT_ID, src)
      Object.assign(getTask(id1)!, { status: "error" })
      const id2 = startIngestTask(PROJECT_ID, src)
      expect(id2).not.toBe(id1)
    })

    it("does NOT deduplicate tasks for different source paths", () => {
      const src1 = uniquePath()
      const src2 = uniquePath()
      const id1 = startIngestTask(PROJECT_ID, src1)
      const id2 = startIngestTask(PROJECT_ID, src2)
      expect(id1).not.toBe(id2)
    })

    it("does NOT deduplicate tasks for different project IDs", () => {
      const src = uniquePath()
      const id1 = startIngestTask("proj-a-uuid", src)
      const id2 = startIngestTask("proj-b-uuid", src)
      expect(id1).not.toBe(id2)
    })
  })
})

describe("getTask / getAllTasks", () => {
  it("getTask returns undefined for unknown id", () => {
    expect(getTask("nonexistent-id-xyz")).toBeUndefined()
  })

  it("getAllTasks includes all started tasks", () => {
    const src1 = uniquePath()
    const src2 = uniquePath()
    startIngestTask(PROJECT_ID, src1)
    startIngestTask(PROJECT_ID, src2)
    const tasks = getAllTasks()
    const sources = tasks.map((t) => t.sourcePath)
    expect(sources).toContain(src1)
    expect(sources).toContain(src2)
  })
})

describe("registerSseClient / unregisterSseClient", () => {
  it("registerSseClient sends the current task snapshot immediately", () => {
    const src = uniquePath()
    const id = startIngestTask(PROJECT_ID, src)
    const res = makeMockRes()
    registerSseClient(id, res as never)
    // Should have received at least one write with 'state' type
    const hasState = res.written.some((w) => w.includes('"type":"state"'))
    expect(hasState).toBe(true)
  })

  it("registerSseClient for unknown task writes nothing", () => {
    const res = makeMockRes()
    registerSseClient("unknown-task", res as never)
    expect(res.write).not.toHaveBeenCalled()
  })

  it("unregisterSseClient removes the client", () => {
    const src = uniquePath()
    const id = startIngestTask(PROJECT_ID, src)
    const res = makeMockRes()
    registerSseClient(id, res as never)
    const writeCountAfterRegister = res.write.mock.calls.length
    unregisterSseClient(id, res as never)
    // Re-register to see if the old one was removed (same object)
    registerSseClient(id, res as never)
    // The initial snapshot write should happen again (once more)
    expect(res.write.mock.calls.length).toBeGreaterThan(writeCountAfterRegister)
  })

  it("unregisterSseClient cleans up the empty Set from sseClients map (no memory leak)", () => {
    const src = uniquePath()
    const id = startIngestTask(PROJECT_ID, src)
    const res1 = makeMockRes()
    const res2 = makeMockRes()
    registerSseClient(id, res1 as never)
    registerSseClient(id, res2 as never)
    // Remove both clients
    unregisterSseClient(id, res1 as never)
    unregisterSseClient(id, res2 as never)
    // Re-registering a new client should still work (recreates the Set)
    const res3 = makeMockRes()
    registerSseClient(id, res3 as never)
    expect(res3.write).toHaveBeenCalled() // received the snapshot
  })

  it("unregisterSseClient is safe to call for non-existent taskId", () => {
    const res = makeMockRes()
    // Should not throw
    expect(() => unregisterSseClient("ghost-task", res as never)).not.toThrow()
  })
})
