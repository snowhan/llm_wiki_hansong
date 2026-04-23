/**
 * TanStack Query hooks for server-side configuration.
 *
 * These hooks replace the manual `loadLlmConfig` / `setLlmConfig` pattern
 * in `wiki-store.ts`. Data is cached, stale-while-revalidate, and
 * automatically refetched on window focus (TanStack Query defaults).
 *
 * Mutation helpers (save* functions) are co-located so callers always
 * invalidate the relevant cache key after saving.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  loadLlmConfig,
  saveLlmConfig,
  loadSearchApiConfig,
  saveSearchApiConfig,
  loadEmbeddingConfig,
  saveEmbeddingConfig,
} from "@/lib/project-store"
import type { LlmConfig, SearchApiConfig, EmbeddingConfig } from "@/stores/wiki-store"

// ── query keys ─────────────────────────────────────────────────────────────

export const SERVER_CONFIG_KEYS = {
  llm: ["serverConfig", "llm"] as const,
  searchApi: ["serverConfig", "searchApi"] as const,
  embedding: ["serverConfig", "embedding"] as const,
}

// ── hooks ──────────────────────────────────────────────────────────────────

export function useLlmConfig() {
  return useQuery({
    queryKey: SERVER_CONFIG_KEYS.llm,
    queryFn: loadLlmConfig,
    staleTime: 30_000,
  })
}

export function useSearchApiConfig() {
  return useQuery({
    queryKey: SERVER_CONFIG_KEYS.searchApi,
    queryFn: loadSearchApiConfig,
    staleTime: 30_000,
  })
}

export function useEmbeddingConfig() {
  return useQuery({
    queryKey: SERVER_CONFIG_KEYS.embedding,
    queryFn: loadEmbeddingConfig,
    staleTime: 30_000,
  })
}

// ── mutation hooks ─────────────────────────────────────────────────────────

export function useSaveLlmConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: LlmConfig) => saveLlmConfig(config),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SERVER_CONFIG_KEYS.llm })
    },
  })
}

export function useSaveSearchApiConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: SearchApiConfig) => saveSearchApiConfig(config),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SERVER_CONFIG_KEYS.searchApi })
    },
  })
}

export function useSaveEmbeddingConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: EmbeddingConfig) => saveEmbeddingConfig(config),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SERVER_CONFIG_KEYS.embedding })
    },
  })
}
