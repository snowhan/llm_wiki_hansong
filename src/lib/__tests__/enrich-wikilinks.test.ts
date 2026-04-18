import { describe, it, expect, vi, beforeEach } from "vitest"
import { enrichWithWikilinks } from "../enrich-wikilinks"
import type { LlmConfig } from "@/stores/wiki-store"

vi.mock("../llm-client", () => ({
  streamChat: vi.fn(),
}))

vi.mock("../ingest", () => ({
  LANGUAGE_RULE: "Respond in the user's language.",
}))

vi.mock("@/commands/fs", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

const { streamChat } = await import("../llm-client")
const { readFile, writeFile } = await import("@/commands/fs")

const config: LlmConfig = {
  provider: "openai",
  apiKey: "key",
  model: "gpt-4",
  ollamaUrl: "http://localhost:11434",
  customEndpoint: "",
  maxContextSize: 4096,
}

describe("enrichWithWikilinks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readFile).mockResolvedValue("")
    vi.mocked(writeFile).mockResolvedValue(undefined)
  })

  it("does not write if content is empty", async () => {
    vi.mocked(readFile).mockResolvedValue("")
    await enrichWithWikilinks("proj-uuid", "wiki/entities/foo.md", config)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("does not write if index is empty", async () => {
    vi.mocked(readFile)
      .mockResolvedValueOnce("Some content")
      .mockResolvedValueOnce("")
    await enrichWithWikilinks("proj-uuid", "wiki/entities/foo.md", config)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("writes enriched content and bumps data version", async () => {
    const original = "This mentions OpenAI and GPT-4 in the text."
    const enriched = "This mentions [[OpenAI]] and [[GPT-4]] in the text."
    vi.mocked(readFile)
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce("- [[openai]] — Company\n- [[gpt-4]] — Model")
    vi.mocked(streamChat as any).mockImplementation(async (_m: unknown, cb: any) => {
      cb.onToken(enriched)
      cb.onDone()
    })

    await enrichWithWikilinks("proj-uuid", "wiki/entities/foo.md", config)
    expect(writeFile).toHaveBeenCalledWith("proj-uuid", "wiki/entities/foo.md", enriched)
  })

  it("does not write if LLM output is too short (< 50% of original)", async () => {
    const original = "A".repeat(100)
    vi.mocked(readFile)
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce("- [[page]] — desc")
    vi.mocked(streamChat as any).mockImplementation(async (_m: unknown, cb: any) => {
      cb.onToken("short")
      cb.onDone()
    })

    await enrichWithWikilinks("proj-uuid", "wiki/entities/foo.md", config)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("does not write if LLM returns empty", async () => {
    vi.mocked(readFile)
      .mockResolvedValueOnce("content")
      .mockResolvedValueOnce("index")
    vi.mocked(streamChat as any).mockImplementation(async (_m: unknown, cb: any) => {
      cb.onDone()
    })

    await enrichWithWikilinks("proj-uuid", "wiki/entities/foo.md", config)
    expect(writeFile).not.toHaveBeenCalled()
  })
})
