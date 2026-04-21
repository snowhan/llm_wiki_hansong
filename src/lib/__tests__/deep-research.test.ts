/**
 * TDD tests for the refactored deep-research.ts.
 *
 * After the server-side migration, queueResearch() must:
 *  1. Call POST /api/research/start (server API) instead of running locally
 *  2. Add task to research-store immediately (optimistic UI)
 *  3. Open the research panel
 *  4. Return a taskId
 *
 * Local web-search / streamChat / writeFile should NOT be called.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { queueResearch } from "../deep-research"
import { useResearchStore } from "@/stores/research-store"
import { useWikiStore } from "@/stores/wiki-store"
import type { LlmConfig, SearchApiConfig } from "@/stores/wiki-store"

// ── Mock server API call ──────────────────────────────────────────────────
vi.mock("@/commands/research", () => ({
  startServerResearch: vi.fn().mockResolvedValue("server-task-001"),
}))

// ── These should NOT be called in the new architecture ───────────────────
vi.mock("../web-search", () => ({
  webSearch: vi.fn().mockRejectedValue(new Error("webSearch should not be called")),
}))

vi.mock("../llm-client", () => ({
  streamChat: vi.fn().mockRejectedValue(new Error("streamChat should not be called")),
}))

vi.mock("@/commands/fs", () => ({
  writeFile: vi.fn().mockRejectedValue(new Error("writeFile should not be called")),
  readFile: vi.fn().mockRejectedValue(new Error("readFile should not be called")),
  listDirectory: vi.fn().mockRejectedValue(new Error("listDirectory should not be called")),
}))

vi.mock("@/commands/ingest", () => ({
  startServerIngest: vi.fn().mockRejectedValue(new Error("startServerIngest should not be called")),
}))

const llmConfig: LlmConfig = {
  provider: "openai",
  apiKey: "key",
  model: "gpt-4",
  ollamaUrl: "http://localhost:11434",
  customEndpoint: "",
  maxContextSize: 4096,
}
const searchConfig: SearchApiConfig = { provider: "tavily", apiKey: "tavily-key" }

describe("queueResearch (server-side mode)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useResearchStore.setState({
      tasks: [],
      maxConcurrent: 3,
      panelOpen: false,
    })
    useWikiStore.setState({
      project: { id: "proj-001", name: "test" },
    } as any)
  })

  afterEach(() => { vi.useRealTimers() })

  it("returns a taskId", async () => {
    const id = queueResearch("proj-001", "AI Safety", llmConfig, searchConfig)
    expect(id).toBeTruthy()
    expect(typeof id).toBe("string")
  })

  it("opens the research panel immediately", () => {
    queueResearch("proj-001", "AI Safety", llmConfig, searchConfig)
    expect(useResearchStore.getState().panelOpen).toBe(true)
  })

  it("adds an optimistic task to the store immediately", () => {
    queueResearch("proj-001", "AI Safety", llmConfig, searchConfig)
    const tasks = useResearchStore.getState().tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0].topic).toBe("AI Safety")
  })

  it("calls startServerResearch with correct params after timeout", async () => {
    const { startServerResearch } = await import("@/commands/research")
    queueResearch("proj-001", "AI Safety", llmConfig, searchConfig)
    await vi.advanceTimersByTimeAsync(100)
    expect(startServerResearch).toHaveBeenCalledWith({
      projectId: "proj-001",
      topic: "AI Safety",
      searchQueries: undefined,
    })
  })

  it("passes searchQueries to server API", async () => {
    const { startServerResearch } = await import("@/commands/research")
    queueResearch("proj-001", "Topic", llmConfig, searchConfig, ["q1", "q2"])
    await vi.advanceTimersByTimeAsync(100)
    expect(startServerResearch).toHaveBeenCalledWith(
      expect.objectContaining({ searchQueries: ["q1", "q2"] }),
    )
  })

  it("does NOT call webSearch (local execution is disabled)", async () => {
    const { webSearch } = await import("../web-search")
    queueResearch("proj-001", "Topic", llmConfig, searchConfig)
    await vi.advanceTimersByTimeAsync(200)
    expect(webSearch).not.toHaveBeenCalled()
  })

  it("does NOT call streamChat (local execution is disabled)", async () => {
    const { streamChat } = await import("../llm-client")
    queueResearch("proj-001", "Topic", llmConfig, searchConfig)
    await vi.advanceTimersByTimeAsync(200)
    expect(streamChat).not.toHaveBeenCalled()
  })

  it("stores custom search queries on the optimistic task", () => {
    queueResearch("proj-001", "Topic", llmConfig, searchConfig, ["query 1", "query 2"])
    const task = useResearchStore.getState().tasks[0]
    expect(task.searchQueries).toEqual(["query 1", "query 2"])
  })

  it("queues multiple tasks", () => {
    queueResearch("proj-001", "Topic 1", llmConfig, searchConfig)
    queueResearch("proj-001", "Topic 2", llmConfig, searchConfig)
    expect(useResearchStore.getState().tasks).toHaveLength(2)
  })
})
