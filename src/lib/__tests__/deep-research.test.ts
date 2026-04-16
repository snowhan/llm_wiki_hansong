import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { queueResearch } from "../deep-research"
import { useResearchStore } from "@/stores/research-store"
import { useWikiStore } from "@/stores/wiki-store"
import type { LlmConfig, SearchApiConfig } from "@/stores/wiki-store"

vi.mock("../web-search", () => ({
  webSearch: vi.fn().mockResolvedValue([
    { title: "Result 1", url: "https://example.com/1", snippet: "snippet 1", source: "example.com" },
  ]),
}))

vi.mock("../llm-client", () => ({
  streamChat: vi.fn(async (_cfg: any, _msgs: any, cb: any) => {
    cb.onToken("# Synthesis\n\nResearch content here.")
    cb.onDone()
  }),
}))

vi.mock("../ingest", () => ({
  autoIngest: vi.fn().mockResolvedValue([]),
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

describe("queueResearch", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useResearchStore.setState({
      tasks: [],
      maxConcurrent: 3,
      panelOpen: false,
    })
    useWikiStore.setState({
      project: { name: "test", path: "/test" },
      setFileTree: vi.fn(),
      bumpDataVersion: vi.fn(),
    } as any)
  })

  afterEach(() => { vi.useRealTimers() })

  it("returns a task ID", () => {
    const id = queueResearch("/test", "AI Safety", llmConfig, searchConfig)
    expect(id).toBeTruthy()
    expect(typeof id).toBe("string")
  })

  it("adds task to research store", () => {
    queueResearch("/test", "AI Safety", llmConfig, searchConfig)
    const tasks = useResearchStore.getState().tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0].topic).toBe("AI Safety")
  })

  it("opens the research panel", () => {
    queueResearch("/test", "Topic", llmConfig, searchConfig)
    expect(useResearchStore.getState().panelOpen).toBe(true)
  })

  it("stores custom search queries on task", () => {
    queueResearch("/test", "Topic", llmConfig, searchConfig, ["query 1", "query 2"])
    const task = useResearchStore.getState().tasks[0]
    expect(task.searchQueries).toEqual(["query 1", "query 2"])
  })

  it("starts processing after timeout", async () => {
    const { webSearch } = await import("../web-search")
    queueResearch("/test", "Topic", llmConfig, searchConfig)
    expect(webSearch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(webSearch).toHaveBeenCalled()
  })

  it("queues multiple tasks", () => {
    queueResearch("/test", "Topic 1", llmConfig, searchConfig)
    queueResearch("/test", "Topic 2", llmConfig, searchConfig)
    expect(useResearchStore.getState().tasks).toHaveLength(2)
  })
})
