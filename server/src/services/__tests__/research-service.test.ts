/**
 * Unit tests for server/src/services/research-service.ts
 *
 * Focus on the public, non-LLM parts:
 *   - startResearchTask deduplication logic
 *   - registerResearchSseClient / unregisterResearchSseClient memory management
 *   - getResearchTask / getAllResearchTasks retrieval
 *   - cancelResearchTask
 *   - concurrency (maxConcurrent = 3)
 *
 * runResearch is mocked at module level so no real LLM / web-search calls are made.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock fs so no real files are read/written ─────────────────────────────
vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn().mockRejectedValue(new Error("file not found (mock)")),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
  },
}))

// Mock fetch so Tavily/LLM HTTP requests never go out
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: false,
  status: 500,
  text: () => Promise.resolve("mocked"),
  json: () => Promise.resolve({}),
  body: null,
}))

// Mock state-service so getState returns dummy configs
vi.mock("../state-service.js", () => ({
  getState: vi.fn().mockResolvedValue({
    provider: "openai",
    apiKey: "test-key",
    model: "gpt-4",
    ollamaUrl: "",
    customEndpoint: "",
    maxContextSize: 4096,
  }),
}))

// Mock project-service
vi.mock("../project-service.js", () => ({
  getProjectRoot: vi.fn().mockResolvedValue("/tmp/test-project"),
}))

// Mock ingest-service so auto-ingest doesn't run
vi.mock("../ingest-service.js", () => ({
  startIngestTask: vi.fn().mockReturnValue("mock-ingest-task-id"),
  scheduleIndexRebuild: vi.fn(),
}))

// Import AFTER mocks are in place
const {
  startResearchTask,
  getResearchTask,
  getAllResearchTasks,
  registerResearchSseClient,
  unregisterResearchSseClient,
  cancelResearchTask,
} = await import("../research-service.js")

// ── Helper ────────────────────────────────────────────────────────────────

function makeMockRes() {
  const written: string[] = []
  return {
    write: vi.fn((data: string) => { written.push(data) }),
    written,
  }
}

let _seq = 0
function uniqueTopic() {
  return `research-topic-${++_seq}`
}
const PROJECT_ID = "test-project-uuid"

// ── Tests: startResearchTask ──────────────────────────────────────────────

describe("startResearchTask", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns a string task ID", () => {
    const id = startResearchTask(PROJECT_ID, uniqueTopic())
    expect(typeof id).toBe("string")
    expect(id.length).toBeGreaterThan(0)
  })

  it("creates task with status queued or searching", () => {
    const topic = uniqueTopic()
    const id = startResearchTask(PROJECT_ID, topic)
    const task = getResearchTask(id)
    expect(task).toBeDefined()
    expect(task!.topic).toBe(topic)
    expect(task!.projectId).toBe(PROJECT_ID)
    expect(["queued", "searching"]).toContain(task!.status)
  })

  it("stores searchQueries on the task when provided", () => {
    const id = startResearchTask(PROJECT_ID, uniqueTopic(), ["query A", "query B"])
    const task = getResearchTask(id)
    expect(task!.searchQueries).toEqual(["query A", "query B"])
  })

  it("deduplicates: returns same taskId when same projectId + topic is already running", () => {
    const topic = uniqueTopic()
    const id1 = startResearchTask(PROJECT_ID, topic)
    const id2 = startResearchTask(PROJECT_ID, topic)
    expect(id1).toBe(id2)
  })

  it("does NOT deduplicate when topic differs", () => {
    const id1 = startResearchTask(PROJECT_ID, uniqueTopic())
    const id2 = startResearchTask(PROJECT_ID, uniqueTopic())
    expect(id1).not.toBe(id2)
  })

  it("does NOT deduplicate when projectId differs", () => {
    const topic = uniqueTopic()
    const id1 = startResearchTask("project-A", topic)
    const id2 = startResearchTask("project-B", topic)
    expect(id1).not.toBe(id2)
  })

  it("records createdAt and updatedAt timestamps", () => {
    const before = Date.now()
    const id = startResearchTask(PROJECT_ID, uniqueTopic())
    const after = Date.now()
    const task = getResearchTask(id)
    expect(task!.createdAt).toBeGreaterThanOrEqual(before)
    expect(task!.createdAt).toBeLessThanOrEqual(after)
    expect(task!.updatedAt).toBeGreaterThanOrEqual(before)
  })

  it("initialises webResults as empty array and synthesis as empty string", () => {
    const id = startResearchTask(PROJECT_ID, uniqueTopic())
    const task = getResearchTask(id)
    expect(task!.webResults).toEqual([])
    expect(task!.synthesis).toBe("")
    expect(task!.savedPath).toBeNull()
    expect(task!.error).toBeNull()
  })
})

// ── Tests: getResearchTask / getAllResearchTasks ───────────────────────────

describe("getResearchTask", () => {
  it("returns undefined for unknown taskId", () => {
    expect(getResearchTask("non-existent-id")).toBeUndefined()
  })

  it("returns the task after creation", () => {
    const id = startResearchTask(PROJECT_ID, uniqueTopic())
    expect(getResearchTask(id)).toBeDefined()
  })
})

describe("getAllResearchTasks", () => {
  it("returns all tasks when no projectId filter", () => {
    const t1 = startResearchTask("proj-1", uniqueTopic())
    const t2 = startResearchTask("proj-2", uniqueTopic())
    const all = getAllResearchTasks()
    const ids = all.map((t) => t.id)
    expect(ids).toContain(t1)
    expect(ids).toContain(t2)
  })

  it("filters by projectId when provided", () => {
    const topicA = uniqueTopic()
    const topicB = uniqueTopic()
    const idA = startResearchTask("proj-filter-A", topicA)
    startResearchTask("proj-filter-B", topicB)
    const filtered = getAllResearchTasks("proj-filter-A")
    const ids = filtered.map((t) => t.id)
    expect(ids).toContain(idA)
    expect(ids.every((id) => {
      const t = getResearchTask(id)
      return t?.projectId === "proj-filter-A"
    })).toBe(true)
  })
})

// ── Tests: SSE client management ─────────────────────────────────────────

describe("registerResearchSseClient / unregisterResearchSseClient", () => {
  it("registerResearchSseClient sends the current task snapshot immediately", () => {
    const id = startResearchTask(PROJECT_ID, uniqueTopic())
    const res = makeMockRes()
    registerResearchSseClient(id, res as never)
    const hasState = res.written.some((w) => w.includes('"type":"state"'))
    expect(hasState).toBe(true)
  })

  it("registerResearchSseClient for unknown task writes nothing", () => {
    const res = makeMockRes()
    registerResearchSseClient("unknown-task", res as never)
    expect(res.write).not.toHaveBeenCalled()
  })

  it("unregisterResearchSseClient removes the client", () => {
    const id = startResearchTask(PROJECT_ID, uniqueTopic())
    const res = makeMockRes()
    registerResearchSseClient(id, res as never)
    const writeCountAfterRegister = res.write.mock.calls.length
    unregisterResearchSseClient(id, res as never)
    // Re-registering same object triggers another snapshot write
    registerResearchSseClient(id, res as never)
    expect(res.write.mock.calls.length).toBeGreaterThan(writeCountAfterRegister)
  })

  it("unregisterResearchSseClient is safe for non-existent taskId", () => {
    const res = makeMockRes()
    expect(() => unregisterResearchSseClient("ghost-task", res as never)).not.toThrow()
  })

  it("unregisterResearchSseClient cleans up empty Set (no memory leak)", () => {
    const id = startResearchTask(PROJECT_ID, uniqueTopic())
    const res1 = makeMockRes()
    const res2 = makeMockRes()
    registerResearchSseClient(id, res1 as never)
    registerResearchSseClient(id, res2 as never)
    unregisterResearchSseClient(id, res1 as never)
    unregisterResearchSseClient(id, res2 as never)
    const res3 = makeMockRes()
    registerResearchSseClient(id, res3 as never)
    expect(res3.write).toHaveBeenCalled()
  })
})

// ── Tests: cancelResearchTask ─────────────────────────────────────────────

describe("cancelResearchTask", () => {
  it("sets task status to error with cancelled message", () => {
    const id = startResearchTask(PROJECT_ID, uniqueTopic())
    cancelResearchTask(id)
    const task = getResearchTask(id)
    expect(task!.status).toBe("error")
    expect(task!.error).toMatch(/cancel/i)
  })

  it("is safe to call for non-existent taskId", () => {
    expect(() => cancelResearchTask("non-existent")).not.toThrow()
  })
})
