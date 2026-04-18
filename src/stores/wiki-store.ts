import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { WikiProject, FileNode } from "@/types/wiki"
import { getFileName } from "@/lib/path-utils"

interface LlmConfig {
  provider: "openai" | "anthropic" | "google" | "ollama" | "custom" | "minimax" | "wps"
  apiKey: string
  model: string
  ollamaUrl: string
  customEndpoint: string
  maxContextSize: number
}

interface SearchApiConfig {
  provider: "tavily" | "none"
  apiKey: string
}

interface EmbeddingConfig {
  enabled: boolean
  endpoint: string
  apiKey: string
  model: string
}

export interface TabItem {
  id: string         // stable unique identity (never changes after creation)
  path: string       // "__new_tab_<id>" means an empty placeholder tab
  title: string
  isDirty?: boolean
}

export const NEW_TAB_PREFIX = "__new_tab_"
export function isNewTab(path: string) { return path.startsWith(NEW_TAB_PREFIX) }

let _tabSeq = 0
function newTabId() { return `tab_${Date.now()}_${++_tabSeq}` }

interface WikiState {
  project: WikiProject | null
  fileTree: FileNode[]
  selectedFile: string | null
  fileContent: string
  chatExpanded: boolean
  activeView: "wiki" | "sources" | "search" | "graph" | "lint" | "review" | "settings"
  llmConfig: LlmConfig
  searchApiConfig: SearchApiConfig
  embeddingConfig: EmbeddingConfig
  dataVersion: number

  // Tab management
  openTabs: TabItem[]
  activeTabId: string | null   // which tab is visually selected (by id)
  activeTabPath: string | null // derived: the file path of the active tab (null for empty/no tab)

  // Ingest progress — stored globally so state survives view switches
  ingestingPath: string | null
  ingestStatuses: Record<string, "idle" | "ingesting" | "interrupted" | "done" | "error">

  setProject: (project: WikiProject | null) => void
  setFileTree: (tree: FileNode[]) => void
  setSelectedFile: (path: string | null) => void
  setFileContent: (content: string) => void
  setChatExpanded: (expanded: boolean) => void
  setActiveView: (view: WikiState["activeView"]) => void
  setLlmConfig: (config: LlmConfig) => void
  setSearchApiConfig: (config: SearchApiConfig) => void
  setEmbeddingConfig: (config: EmbeddingConfig) => void
  bumpDataVersion: () => void

  // Tab actions
  openTab: (path: string, title?: string) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  /** Open file in current tab. If file is already open in another tab, switch to it. Creates first tab if none exist. */
  navigateInCurrentTab: (path: string, title?: string) => void
  /** Create a blank placeholder tab and make it active. */
  openNewTab: () => void

  // Ingest actions
  setIngestingPath: (path: string | null) => void
  setIngestStatus: (path: string, status: "idle" | "ingesting" | "interrupted" | "done" | "error") => void
}

function deriveTabPath(tabs: TabItem[], activeTabId: string | null): string | null {
  if (!activeTabId) return null
  const tab = tabs.find((t) => t.id === activeTabId)
  if (!tab || isNewTab(tab.path)) return null
  return tab.path
}

export const useWikiStore = create<WikiState>()(
  persist(
    (set, get) => ({
  project: null,
  fileTree: [],
  selectedFile: null,
  fileContent: "",
  chatExpanded: false,
  activeView: "wiki",
  llmConfig: {
    provider: "openai",
    apiKey: "",
    maxContextSize: 204800,
    model: "",
    ollamaUrl: "http://localhost:11434",
    customEndpoint: "",
  },

  dataVersion: 0,
  openTabs: [],
  activeTabId: null,
  activeTabPath: null,
  ingestingPath: null,
  ingestStatuses: {},

  setProject: (project) => set({
    project,
    // Reset tab state when switching projects
    openTabs: [],
    activeTabId: null,
    activeTabPath: null,
    fileContent: "",
    selectedFile: null,
    activeView: "wiki",
  }),
  setFileTree: (fileTree) => set({ fileTree }),
  setSelectedFile: (selectedFile) => set({ selectedFile }),
  setFileContent: (fileContent) => set({ fileContent }),
  setChatExpanded: (chatExpanded) => set({ chatExpanded }),
  setActiveView: (activeView) => set({ activeView }),
  searchApiConfig: {
    provider: "none",
    apiKey: "",
  },

  embeddingConfig: {
    enabled: false,
    endpoint: "",
    apiKey: "",
    model: "",
  },

  setLlmConfig: (llmConfig) => set({ llmConfig }),
  setSearchApiConfig: (searchApiConfig) => set({ searchApiConfig }),
  setEmbeddingConfig: (embeddingConfig) => set({ embeddingConfig }),
  bumpDataVersion: () => set((state) => ({ dataVersion: state.dataVersion + 1 })),

  openTab: (path, title) => {
    const { openTabs } = get()
    // Check if already open
    const existing = openTabs.find((t) => t.path === path)
    if (existing) {
      set({
        activeTabId: existing.id,
        activeTabPath: path,
        selectedFile: path,
      })
      return
    }
    const id = newTabId()
    const resolvedTitle = title ?? getFileName(path)
    set({
      openTabs: [...openTabs, { id, path, title: resolvedTitle }],
      activeTabId: id,
      activeTabPath: path,
      selectedFile: path,
    })
  },

  closeTab: (tabId) => {
    const { openTabs, activeTabId } = get()
    const idx = openTabs.findIndex((t) => t.id === tabId)
    if (idx === -1) return
    const nextTabs = openTabs.filter((t) => t.id !== tabId)
    let nextActiveId: string | null = activeTabId
    if (activeTabId === tabId) {
      const nextTab = nextTabs[idx] ?? nextTabs[idx - 1] ?? null
      nextActiveId = nextTab?.id ?? null
    }
    const nextPath = deriveTabPath(nextTabs, nextActiveId)
    set({ openTabs: nextTabs, activeTabId: nextActiveId, activeTabPath: nextPath, selectedFile: nextPath })
  },

  setActiveTab: (tabId) => {
    const { openTabs } = get()
    const path = deriveTabPath(openTabs, tabId)
    set({ activeTabId: tabId, activeTabPath: path, selectedFile: path })
  },

  navigateInCurrentTab: (path, title) => {
    const { openTabs, activeTabId } = get()
    const resolvedTitle = title ?? getFileName(path)

    // If this file is already open in any tab, switch to that tab
    const existingTab = openTabs.find((t) => t.path === path)
    if (existingTab) {
      set({ activeTabId: existingTab.id, activeTabPath: path, selectedFile: path })
      return
    }

    if (openTabs.length === 0) {
      // No tabs yet — create the first one
      const id = newTabId()
      set({
        openTabs: [{ id, path, title: resolvedTitle }],
        activeTabId: id,
        activeTabPath: path,
        selectedFile: path,
      })
      return
    }

    // Replace the active tab in-place
    const idx = openTabs.findIndex((t) => t.id === activeTabId)
    if (idx === -1) {
      // Active tab not found, append
      const id = newTabId()
      set({
        openTabs: [...openTabs, { id, path, title: resolvedTitle }],
        activeTabId: id,
        activeTabPath: path,
        selectedFile: path,
      })
      return
    }
    const newTabs = [...openTabs]
    newTabs[idx] = { ...newTabs[idx], path, title: resolvedTitle }
    set({ openTabs: newTabs, activeTabPath: path, selectedFile: path })
  },

  openNewTab: () => {
    const { openTabs } = get()
    const id = newTabId()
    const tabPath = `${NEW_TAB_PREFIX}${id}`
    set({
      openTabs: [...openTabs, { id, path: tabPath, title: "新标签页" }],
      activeTabId: id,
      activeTabPath: null,
      selectedFile: null,
    })
  },

  setIngestingPath: (path) => set({ ingestingPath: path }),

  setIngestStatus: (path, status) =>
    set((state) => ({ ingestStatuses: { ...state.ingestStatuses, [path]: status } })),
  }),
  {
    name: "llm-wiki-store",
    // Only persist ingest progress — everything else is derived from disk
    partialize: (state) => ({
      ingestStatuses: state.ingestStatuses,
    }),
    onRehydrateStorage: () => (state) => {
      if (!state) return
      // Convert any "ingesting" → "interrupted": page was refreshed mid-ingest
      const updated: Record<string, "idle" | "ingesting" | "interrupted" | "done" | "error"> = {}
      for (const [path, status] of Object.entries(state.ingestStatuses)) {
        updated[path] = status === "ingesting" ? "interrupted" : status
      }
      state.ingestStatuses = updated
      state.ingestingPath = null
    },
  }
))

export type { WikiState, LlmConfig, SearchApiConfig, EmbeddingConfig }
