/**
 * UI-preference Zustand store.
 *
 * Holds only ephemeral, client-side UI state that is NOT derived from the
 * server (color theme, active view, sidebar visibility, etc.).
 *
 * Server-derived data (llmConfig, searchApiConfig, embeddingConfig) lives
 * in TanStack Query hooks in `src/hooks/use-server-config.ts`.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ColorScheme = "light" | "dark" | "system"

export type ActiveView =
  | "wiki"
  | "sources"
  | "search"
  | "graph"
  | "lint"
  | "llm-debug"
  | "settings"

interface UiState {
  colorScheme: ColorScheme
  activeView: ActiveView
  chatExpanded: boolean

  setColorScheme: (scheme: ColorScheme) => void
  setActiveView: (view: ActiveView) => void
  setChatExpanded: (expanded: boolean) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      colorScheme: "system",
      activeView: "wiki",
      chatExpanded: false,

      setColorScheme: (colorScheme) => set({ colorScheme }),
      setActiveView: (activeView) => set({ activeView }),
      setChatExpanded: (chatExpanded) => set({ chatExpanded }),
    }),
    {
      name: "llm-wiki-ui",
      partialize: (state) => ({ colorScheme: state.colorScheme }),
    },
  ),
)
