import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { WikiProject, FileNode, LlmConfig, SearchApiConfig, EmbeddingConfig } from "@shared"
import { getFileName } from "@/lib/path-utils"

export type { LlmConfig, SearchApiConfig, EmbeddingConfig }

export interface TabItem {
  id: string         // stable unique identity (never changes after creation)
  path: string       // "__new_tab_<id>" means an empty placeholder tab; otherwise a relativePath
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
  selectedFile: string | null       // relativePath within project, or null
  fileContent: string
  chatExpanded: boolean
  activeView: "wiki" | "sources" | "search" | "graph" | "lint" | "review" | "settings" | "admin"
  llmConfig: LlmConfig
  searchApiConfig: SearchApiConfig
  embeddingConfig: EmbeddingConfig
  dataVersion: number

  // Tab management
  openTabs: TabItem[]
  activeTabId: string | null        // which tab is visually selected (by id)
  activeTabPath: string | null      // derived: the relativePath of the active tab (null for empty/no tab)

  // Ingest progress — stored globally so state survives view switches
  ingestingPath: string | null      // relativePath of currently ingesting file
  ingestStatuses: Record<string, "idle" | "ingesting" | "interrupted" | "done" | "error">  // key: relativePath

  // Server-side task IDs — persisted so we can reconnect after page refresh
  serverTaskIds: Record<string, string>  // key: relativePath → taskId

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
  openTab: (relativePath: string, title?: string) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  /** Open file in current tab. If file is already open in another tab, switch to it. Creates first tab if none exist. */
  navigateInCurrentTab: (relativePath: string, title?: string) => void
  /** Create a blank placeholder tab and make it active. */
  openNewTab: () => void

  // Ingest actions
  setIngestingPath: (path: string | null) => void
  setIngestStatus: (relativePath: string, status: "idle" | "ingesting" | "interrupted" | "done" | "error") => void
  setServerTaskId: (relativePath: string, taskId: string | null) => void
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
  dataVersion: 0,
  openTabs: [],
  activeTabId: null,
  activeTabPath: null,
  ingestingPath: null,
  ingestStatuses: {},
  serverTaskIds: {},

  setProject: (project) => set({
    project,
    // Reset tab and ingest state when switching projects
    openTabs: [],
    activeTabId: null,
    activeTabPath: null,
    fileContent: "",
    selectedFile: null,
    activeView: "wiki",
    // Clear ingest state so previous project's status doesn't bleed into new project
    ingestingPath: null,
    ingestStatuses: {},
    serverTaskIds: {},
  }),
  setFileTree: (fileTree) => set({ fileTree }),
  setSelectedFile: (selectedFile) => set({ selectedFile }),
  setFileContent: (fileContent) => set({ fileContent }),
  setChatExpanded: (chatExpanded) => set({ chatExpanded }),
  setActiveView: (activeView) => set({ activeView }),

  setLlmConfig: (llmConfig) => set({ llmConfig }),
  setSearchApiConfig: (searchApiConfig) => set({ searchApiConfig }),
  setEmbeddingConfig: (embeddingConfig) => set({ embeddingConfig }),
  bumpDataVersion: () => set((state) => ({ dataVersion: state.dataVersion + 1 })),

  openTab: (relativePath, title) => {
    const { openTabs } = get()
    const existing = openTabs.find((t) => t.path === relativePath)
    if (existing) {
      set({
        activeTabId: existing.id,
        activeTabPath: relativePath,
        selectedFile: relativePath,
      })
      return
    }
    const id = newTabId()
    const resolvedTitle = title ?? getFileName(relativePath)
    set({
      openTabs: [...openTabs, { id, path: relativePath, title: resolvedTitle }],
      activeTabId: id,
      activeTabPath: relativePath,
      selectedFile: relativePath,
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

  navigateInCurrentTab: (relativePath, title) => {
    const { openTabs, activeTabId } = get()
    const resolvedTitle = title ?? getFileName(relativePath)

    const existingTab = openTabs.find((t) => t.path === relativePath)
    if (existingTab) {
      set({ activeTabId: existingTab.id, activeTabPath: relativePath, selectedFile: relativePath })
      return
    }

    if (openTabs.length === 0) {
      const id = newTabId()
      set({
        openTabs: [{ id, path: relativePath, title: resolvedTitle }],
        activeTabId: id,
        activeTabPath: relativePath,
        selectedFile: relativePath,
      })
      return
    }

    const idx = openTabs.findIndex((t) => t.id === activeTabId)
    if (idx === -1) {
      const id = newTabId()
      set({
        openTabs: [...openTabs, { id, path: relativePath, title: resolvedTitle }],
        activeTabId: id,
        activeTabPath: relativePath,
        selectedFile: relativePath,
      })
      return
    }
    const newTabs = [...openTabs]
    newTabs[idx] = { ...newTabs[idx], path: relativePath, title: resolvedTitle }
    set({ openTabs: newTabs, activeTabPath: relativePath, selectedFile: relativePath })
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

  setIngestStatus: (relativePath, status) =>
    set((state) => ({ ingestStatuses: { ...state.ingestStatuses, [relativePath]: status } })),

  setServerTaskId: (relativePath, taskId) =>
    set((state) => {
      if (taskId === null) {
        const { [relativePath]: _, ...rest } = state.serverTaskIds
        return { serverTaskIds: rest }
      }
      return { serverTaskIds: { ...state.serverTaskIds, [relativePath]: taskId } }
    }),
  }),
  {
    name: "llm-wiki-store",
    partialize: (state) => ({
      ingestStatuses: state.ingestStatuses,
      serverTaskIds: state.serverTaskIds,
    }),
    onRehydrateStorage: () => (state) => {
      if (!state) return
      // Convert any "ingesting" → "interrupted": page was refreshed mid-ingest
      // Convert "error" → "idle": allow clean retry on next session
      const updated: Record<string, "idle" | "ingesting" | "interrupted" | "done" | "error"> = {}
      for (const [path, status] of Object.entries(state.ingestStatuses)) {
        if (status === "ingesting") updated[path] = "interrupted"
        else if (status === "error") updated[path] = "idle"
        else updated[path] = status
      }
      state.ingestStatuses = updated
      state.ingestingPath = null
    },
  }
))

export type { WikiState }
