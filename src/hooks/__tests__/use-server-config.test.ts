/**
 * RED phase tests for use-server-config.ts (TanStack Query hooks).
 *
 * These tests verify that server configuration (llmConfig, searchApiConfig,
 * embeddingConfig) is fetched from the server via TanStack Query instead of
 * being stored manually in wiki-store.
 *
 * All tests FAIL initially (RED) because use-server-config.ts does not exist yet.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useLlmConfig, useSearchApiConfig, useEmbeddingConfig } from "../use-server-config"

// ── mocks ──────────────────────────────────────────────────────────────────

const { mockLoadLlmConfig, mockLoadSearchApiConfig, mockLoadEmbeddingConfig } = vi.hoisted(() => ({
  mockLoadLlmConfig: vi.fn(),
  mockLoadSearchApiConfig: vi.fn(),
  mockLoadEmbeddingConfig: vi.fn(),
}))

vi.mock("@/lib/project-store", () => ({
  loadLlmConfig: mockLoadLlmConfig,
  loadSearchApiConfig: mockLoadSearchApiConfig,
  loadEmbeddingConfig: mockLoadEmbeddingConfig,
}))

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("use-server-config hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("F-05: useLlmConfig()", () => {
    it("calls loadLlmConfig and returns the config", async () => {
      const expected = { provider: "openai", apiKey: "sk-test", model: "gpt-4", maxContextSize: 128000 }
      mockLoadLlmConfig.mockResolvedValueOnce(expected)

      const { result } = renderHook(() => useLlmConfig(), { wrapper: makeWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(expected)
      expect(mockLoadLlmConfig).toHaveBeenCalledOnce()
    })

    it("returns null data when server returns null", async () => {
      mockLoadLlmConfig.mockResolvedValueOnce(null)

      const { result } = renderHook(() => useLlmConfig(), { wrapper: makeWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toBeNull()
    })
  })

  describe("F-06: useSearchApiConfig()", () => {
    it("calls loadSearchApiConfig and returns the config", async () => {
      const expected = { provider: "tavily", apiKey: "tvly-test" }
      mockLoadSearchApiConfig.mockResolvedValueOnce(expected)

      const { result } = renderHook(() => useSearchApiConfig(), { wrapper: makeWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(expected)
    })
  })

  describe("F-07: useEmbeddingConfig()", () => {
    it("calls loadEmbeddingConfig and returns the config", async () => {
      const expected = { enabled: true, endpoint: "http://localhost:11434", apiKey: "", model: "nomic-embed" }
      mockLoadEmbeddingConfig.mockResolvedValueOnce(expected)

      const { result } = renderHook(() => useEmbeddingConfig(), { wrapper: makeWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(expected)
    })
  })
})
