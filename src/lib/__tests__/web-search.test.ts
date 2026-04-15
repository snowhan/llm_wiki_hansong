import { describe, it, expect, vi, beforeEach } from "vitest"
import { webSearch } from "../web-search"
import type { SearchApiConfig } from "@/stores/wiki-store"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

describe("webSearch", () => {
  it("throws if provider is none", async () => {
    const config: SearchApiConfig = { provider: "none", apiKey: "" }
    await expect(webSearch("test", config)).rejects.toThrow("Web search not configured")
  })

  it("throws if apiKey is empty", async () => {
    const config: SearchApiConfig = { provider: "tavily", apiKey: "" }
    await expect(webSearch("test", config)).rejects.toThrow("Web search not configured")
  })

  it("calls Tavily API with correct params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            { title: "Result 1", url: "https://example.com/1", content: "Snippet 1" },
          ],
        }),
    })

    const config: SearchApiConfig = { provider: "tavily", apiKey: "test-key" }
    const results = await webSearch("LLM", config, 5)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe("https://api.tavily.com/search")
    const body = JSON.parse(opts.body)
    expect(body.api_key).toBe("test-key")
    expect(body.query).toBe("LLM")
    expect(body.max_results).toBe(5)
  })

  it("returns mapped results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            { title: "T1", url: "https://example.com/page", content: "S1" },
            { title: "T2", url: "https://docs.foo.org/api", content: "S2" },
          ],
        }),
    })

    const config: SearchApiConfig = { provider: "tavily", apiKey: "k" }
    const results = await webSearch("q", config)

    expect(results).toHaveLength(2)
    expect(results[0].title).toBe("T1")
    expect(results[0].url).toBe("https://example.com/page")
    expect(results[0].snippet).toBe("S1")
    expect(results[0].source).toBe("example.com")
  })

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    })

    const config: SearchApiConfig = { provider: "tavily", apiKey: "bad" }
    await expect(webSearch("q", config)).rejects.toThrow("Tavily search failed (401)")
  })

  it("handles empty results array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    })

    const config: SearchApiConfig = { provider: "tavily", apiKey: "k" }
    const results = await webSearch("q", config)
    expect(results).toEqual([])
  })
})
