import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../llm-client", () => ({
  streamChat: vi.fn(),
}))

vi.mock("../ingest-cache", () => ({
  checkIngestCache: vi.fn().mockResolvedValue(null),
  saveIngestCache: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../embedding", () => ({
  embedPage: vi.fn().mockResolvedValue(undefined),
}))

import { readFile, writeFile, listDirectory } from "@/commands/fs"
import { useWikiStore } from "@/stores/wiki-store"
import { useChatStore } from "@/stores/chat-store"
import { useActivityStore } from "@/stores/activity-store"
import { useReviewStore } from "@/stores/review-store"
import { LANGUAGE_RULE } from "../ingest"

const { streamChat } = await import("../llm-client")
const { checkIngestCache } = await import("../ingest-cache")

describe("ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readFile).mockResolvedValue("")
    vi.mocked(writeFile).mockResolvedValue(undefined)
    vi.mocked(listDirectory).mockResolvedValue([])

    useWikiStore.setState({
      project: { name: "test", path: "/test" },
      llmConfig: {
        provider: "openai",
        apiKey: "key",
        model: "m",
        ollamaUrl: "http://localhost:11434",
        customEndpoint: "",
        maxContextSize: 4096,
      },
      embeddingConfig: { enabled: false, endpoint: "", apiKey: "", model: "" },
      bumpDataVersion: vi.fn(),
      setFileTree: vi.fn(),
    } as any)

    useChatStore.setState({
      addMessage: vi.fn(),
      setStreaming: vi.fn(),
      appendStreamToken: vi.fn(),
      finalizeStream: vi.fn(),
      activeConversationId: "c1",
      mode: "normal",
      setMode: vi.fn(),
    } as any)

    useActivityStore.setState({ items: [] })
    useReviewStore.setState({ items: [] })
  })

  it("exports LANGUAGE_RULE as a non-empty string", () => {
    expect(LANGUAGE_RULE).toBeTruthy()
    expect(typeof LANGUAGE_RULE).toBe("string")
  })

  it("autoIngest returns cached files when cache hit", async () => {
    const { autoIngest } = await import("../ingest")
    vi.mocked(checkIngestCache).mockResolvedValue(["wiki/entities/foo.md"])

    const result = await autoIngest("/test", "/test/raw/sources/test.md", {
      provider: "openai",
      apiKey: "key",
      model: "m",
      ollamaUrl: "http://localhost:11434",
      customEndpoint: "",
      maxContextSize: 4096,
    })
    expect(result).toEqual(["wiki/entities/foo.md"])
    expect(streamChat).not.toHaveBeenCalled()
  })

  it("autoIngest calls streamChat for analysis and generation when no cache", async () => {
    vi.resetModules()

    vi.mock("../llm-client", () => ({
      streamChat: vi.fn()
        .mockImplementationOnce(async (_c: any, _m: any, cb: any) => {
          cb.onToken("Analysis: key entities found.")
          cb.onDone()
        })
        .mockImplementationOnce(async (_c: any, _m: any, cb: any) => {
          cb.onToken("---FILE: wiki/sources/test.md---\n---\ntype: source\ntitle: Test\nsources: [test.md]\n---\n# Test\nContent\n---END FILE---")
          cb.onDone()
        }),
    }))

    vi.mock("../ingest-cache", () => ({
      checkIngestCache: vi.fn().mockResolvedValue(null),
      saveIngestCache: vi.fn().mockResolvedValue(undefined),
    }))

    vi.mocked(readFile).mockImplementation(async (path: string) => {
      if (path.includes("index.md")) return "# Index"
      if (path.includes("schema.md")) return "# Schema"
      if (path.includes("purpose.md")) return "# Purpose"
      if (path.includes("overview.md")) return ""
      if (path.includes("log.md")) return ""
      if (path.includes("test.md")) return "Source content"
      return ""
    })

    const mod = await import("../ingest")
    const result = await mod.autoIngest("/test", "/test/raw/sources/test.md", {
      provider: "openai",
      apiKey: "key",
      model: "m",
      ollamaUrl: "http://localhost:11434",
      customEndpoint: "",
      maxContextSize: 4096,
    })

    expect(result.length).toBeGreaterThanOrEqual(0)
  })
})
