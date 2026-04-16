import { describe, it, expect, vi, beforeEach } from "vitest"
import { optimizeResearchTopic } from "../optimize-research-topic"
import type { LlmConfig } from "@/stores/wiki-store"

vi.mock("../llm-client", () => ({
  streamChat: vi.fn(),
}))

const { streamChat } = await import("../llm-client")

const config: LlmConfig = {
  provider: "openai",
  apiKey: "key",
  model: "gpt-4",
  ollamaUrl: "http://localhost:11434",
  customEndpoint: "",
  maxContextSize: 4096,
}

function mockStreamResponse(text: string) {
  vi.mocked(streamChat).mockImplementation(async (_cfg, _msgs, cb) => {
    cb.onToken(text)
    cb.onDone()
  })
}

describe("optimizeResearchTopic", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("parses TOPIC and QUERY lines correctly", async () => {
    mockStreamResponse("TOPIC: Deep learning optimization\nQUERY: deep learning gradient methods\nQUERY: optimizer comparison 2024\nQUERY: adam vs sgd benchmarks")
    const result = await optimizeResearchTopic(config, "gap", "desc", "gap-type", "overview", "purpose")
    expect(result.topic).toBe("Deep learning optimization")
    expect(result.searchQueries).toHaveLength(3)
    expect(result.searchQueries[0]).toBe("deep learning gradient methods")
  })

  it("falls back to gapTitle when TOPIC missing", async () => {
    mockStreamResponse("Some random LLM output without expected format")
    const result = await optimizeResearchTopic(config, "my gap title", "desc", "type", "", "")
    expect(result.topic).toBe("my gap title")
  })

  it("uses topic as search query when no QUERY lines", async () => {
    mockStreamResponse("TOPIC: Quantum computing basics")
    const result = await optimizeResearchTopic(config, "gap", "desc", "type", "", "")
    expect(result.searchQueries).toEqual(["Quantum computing basics"])
  })

  it("limits to 3 queries max", async () => {
    mockStreamResponse("TOPIC: T\nQUERY: q1\nQUERY: q2\nQUERY: q3\nQUERY: q4\nQUERY: q5")
    const result = await optimizeResearchTopic(config, "gap", "desc", "type", "", "")
    expect(result.searchQueries).toHaveLength(3)
  })

  it("filters empty query lines", async () => {
    mockStreamResponse("TOPIC: T\nQUERY: valid query\nQUERY: second query")
    const result = await optimizeResearchTopic(config, "gap", "desc", "type", "", "")
    expect(result.searchQueries.length).toBeGreaterThanOrEqual(1)
    expect(result.searchQueries[0]).toBe("valid query")
  })
})
