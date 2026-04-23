/**
 * TDD RED phase — llm-client.ts
 *
 * Tests for unified LLM streaming client.
 *   C-01: callLlmStreaming calls the correct provider URL
 *   C-02: callLlmStreaming invokes onToken for each streamed token
 *   C-03: callLlmStreaming throws on HTTP error response
 *   C-04: callLlmStreaming respects AbortSignal cancellation
 *   C-05: callLlmStreaming passes maxOutputTokens to buildBody
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../llm-providers.js", () => ({
  getProviderConfig: vi.fn(() => ({
    url: "https://api.example.com/v1/chat",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-key" },
    buildBody: vi.fn((messages: unknown, maxTokens?: number) => ({ messages, max_tokens: maxTokens ?? 4096, stream: true })),
    parseStream: vi.fn((line: string) => {
      if (!line.startsWith("data:")) return null
      const data = line.slice(5).trim()
      if (data === "[DONE]") return null
      try { return JSON.parse(data).choices?.[0]?.delta?.content ?? null } catch { return null }
    }),
  })),
}))

vi.stubGlobal("fetch", vi.fn())

const { callLlmStreaming } = await import("../llm-client.js")

function makeSseStream(tokens: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const t of tokens) {
        const line = `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`
        controller.enqueue(enc.encode(line))
      }
      controller.enqueue(enc.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
}

describe("llm-client — callLlmStreaming", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockConfig = {
    provider: "openai" as const,
    model: "gpt-4o",
    apiKey: "test-key",
    url: undefined,
    maxOutputTokens: undefined,
  }

  describe("C-01: calls the correct provider URL", () => {
    it("fetches the URL from getProviderConfig", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: makeSseStream(["hello"]),
      } as Response)

      await callLlmStreaming(mockConfig, [{ role: "user", content: "hi" }], vi.fn())

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/v1/chat",
        expect.objectContaining({ method: "POST" }),
      )
    })
  })

  describe("C-02: invokes onToken for each streamed token", () => {
    it("calls onToken with each text chunk from the stream", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: makeSseStream(["Hello", " ", "World"]),
      } as Response)

      const tokens: string[] = []
      await callLlmStreaming(mockConfig, [{ role: "user", content: "hi" }], (t) => tokens.push(t))

      expect(tokens).toEqual(["Hello", " ", "World"])
    })
  })

  describe("C-03: throws on HTTP error response", () => {
    it("throws when response.ok is false", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue("Rate limit exceeded"),
      } as unknown as Response)

      await expect(
        callLlmStreaming(mockConfig, [{ role: "user", content: "hi" }], vi.fn()),
      ).rejects.toThrow("429")
    })
  })

  describe("C-04: respects AbortSignal", () => {
    it("passes signal to fetch", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: makeSseStream([]),
      } as Response)

      const ac = new AbortController()
      await callLlmStreaming(
        mockConfig,
        [{ role: "user", content: "hi" }],
        vi.fn(),
        ac.signal,
      )

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: ac.signal }),
      )
    })
  })

  describe("C-05: passes maxOutputTokens to buildBody", () => {
    it("forwards maxOutputTokens from config to buildBody", async () => {
      const { getProviderConfig } = await import("../llm-providers.js")
      const mockBuildBody = vi.fn(() => ({}))
      vi.mocked(getProviderConfig).mockReturnValueOnce({
        url: "https://api.example.com/v1/chat",
        headers: {},
        buildBody: mockBuildBody,
        parseStream: vi.fn(() => null),
      })

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: makeSseStream([]),
      } as Response)

      const configWithTokens = { ...mockConfig, maxOutputTokens: 8192 }
      await callLlmStreaming(
        configWithTokens,
        [{ role: "user", content: "hi" }],
        vi.fn(),
      )

      expect(mockBuildBody).toHaveBeenCalledWith(
        expect.any(Array),
        8192,
      )
    })
  })
})
