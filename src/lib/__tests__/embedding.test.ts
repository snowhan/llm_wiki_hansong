import { describe, it, expect, vi, beforeEach } from "vitest"
import { embedPage, searchByEmbedding, removePageEmbedding, getEmbeddingCount } from "../embedding"
import type { EmbeddingConfig } from "@/stores/wiki-store"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

const mockApiPost = vi.fn()
const mockApiGet = vi.fn()
vi.mock("@/lib/api-client", () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}))

beforeEach(() => {
  mockFetch.mockReset()
  mockApiPost.mockReset()
  mockApiGet.mockReset()
})

const enabledConfig: EmbeddingConfig = {
  enabled: true,
  endpoint: "http://localhost:1234/v1/embeddings",
  apiKey: "key",
  model: "test-model",
}

const disabledConfig: EmbeddingConfig = {
  enabled: false,
  endpoint: "",
  apiKey: "",
  model: "",
}

describe("embedPage", () => {
  it("skips when disabled", async () => {
    await embedPage("/proj", "page1", "Title", "Content", disabledConfig)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it("fetches embedding and upserts", async () => {
    const embedding = [0.1, 0.2, 0.3]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ embedding }] }),
    })
    mockApiPost.mockResolvedValueOnce(undefined)

    await embedPage("/proj", "page1", "Title", "Content", enabledConfig)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockApiPost).toHaveBeenCalledWith("/api/vector/upsert", expect.objectContaining({
      pageId: "page1",
    }))
  })

  it("handles API error gracefully", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" })
    await expect(
      embedPage("/proj", "page1", "Title", "Content", enabledConfig),
    ).resolves.toBeUndefined()
  })
})

describe("searchByEmbedding", () => {
  it("returns empty when disabled", async () => {
    const results = await searchByEmbedding("/proj", "query", disabledConfig)
    expect(results).toEqual([])
  })

  it("returns mapped results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ embedding: [0.1, 0.2] }] }),
    })
    mockApiPost.mockResolvedValueOnce([
      { page_id: "page1", score: 0.95 },
      { page_id: "page2", score: 0.8 },
    ])

    const results = await searchByEmbedding("/proj", "test query", enabledConfig)
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ id: "page1", score: 0.95 })
  })
})

describe("removePageEmbedding", () => {
  it("calls vector delete API", async () => {
    mockApiPost.mockResolvedValueOnce(undefined)
    await removePageEmbedding("/proj", "page1")
    expect(mockApiPost).toHaveBeenCalledWith("/api/vector/delete", expect.objectContaining({
      pageId: "page1",
    }))
  })

  it("handles error gracefully", async () => {
    mockApiPost.mockRejectedValueOnce(new Error("fail"))
    await expect(removePageEmbedding("/proj", "page1")).resolves.toBeUndefined()
  })
})

describe("getEmbeddingCount", () => {
  it("returns count from vector API", async () => {
    mockApiGet.mockResolvedValueOnce(42)
    const count = await getEmbeddingCount("/proj")
    expect(count).toBe(42)
  })

  it("returns 0 on error", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("fail"))
    const count = await getEmbeddingCount("/proj")
    expect(count).toBe(0)
  })
})
