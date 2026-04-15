import { describe, it, expect, vi, beforeEach } from "vitest"
import { enrichWithWikilinks } from "../enrich-wikilinks"
import { readFile, writeFile } from "@/commands/fs"
import { useWikiStore } from "@/stores/wiki-store"
import type { LlmConfig } from "@/stores/wiki-store"

vi.mock("../llm-client", () => ({
  streamChat: vi.fn(),
}))

vi.mock("../ingest", () => ({
  LANGUAGE_RULE: "Respond in the user's language.",
}))

const { streamChat } = await import("../llm-client")
const config: LlmConfig = { provider: "openai", apiKey: "key", model: "gpt-4", contextSize: 4096 }

describe("enrichWithWikilinks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readFile).mockResolvedValue("")
    vi.mocked(writeFile).mockResolvedValue(undefined)
    useWikiStore.setState({ project: { name: "t", path: "/p" } } as any)
  })

  it("does not write if content is empty", async () => {
    vi.mocked(readFile).mockResolvedValue("")
    await enrichWithWikilinks("/proj", "/proj/wiki/entities/foo.md", config)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("does not write if index is empty", async () => {
    vi.mocked(readFile)
      .mockResolvedValueOnce("Some content")
      .mockResolvedValueOnce("")
    await enrichWithWikilinks("/proj", "/proj/wiki/entities/foo.md", config)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("writes enriched content and bumps data version", async () => {
    const original = "This mentions OpenAI and GPT-4 in the text."
    const enriched = "This mentions [[OpenAI]] and [[GPT-4]] in the text."
    vi.mocked(readFile)
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce("- [[openai]] — Company\n- [[gpt-4]] — Model")
    vi.mocked(streamChat).mockImplementation(async (_c, _m, cb) => {
      cb.onToken(enriched)
      cb.onDone()
    })
    const bumpSpy = vi.fn()
    useWikiStore.setState({ bumpDataVersion: bumpSpy } as any)

    await enrichWithWikilinks("/proj", "/proj/wiki/entities/foo.md", config)
    expect(writeFile).toHaveBeenCalledWith("/proj/wiki/entities/foo.md", enriched)
    expect(bumpSpy).toHaveBeenCalled()
  })

  it("does not write if LLM output is too short (< 50% of original)", async () => {
    const original = "A".repeat(100)
    vi.mocked(readFile)
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce("- [[page]] — desc")
    vi.mocked(streamChat).mockImplementation(async (_c, _m, cb) => {
      cb.onToken("short")
      cb.onDone()
    })

    await enrichWithWikilinks("/proj", "/proj/wiki/entities/foo.md", config)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("does not write if LLM returns empty", async () => {
    vi.mocked(readFile)
      .mockResolvedValueOnce("content")
      .mockResolvedValueOnce("index")
    vi.mocked(streamChat).mockImplementation(async (_c, _m, cb) => {
      cb.onDone()
    })

    await enrichWithWikilinks("/proj", "/proj/wiki/entities/foo.md", config)
    expect(writeFile).not.toHaveBeenCalled()
  })
})
