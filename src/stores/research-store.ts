import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { WebSearchResult } from "@/lib/web-search"

export interface ResearchTask {
  id: string
  topic: string
  searchQueries?: string[]
  status: "queued" | "searching" | "synthesizing" | "saving" | "done" | "error"
  webResults: WebSearchResult[]
  synthesis: string
  savedPath: string | null
  error: string | null
  createdAt: number
}

interface ResearchState {
  tasks: ResearchTask[]
  panelOpen: boolean
  maxConcurrent: number
  /** localId → serverTaskId mapping, persisted so SSE can reconnect after refresh */
  serverTaskIds: Record<string, string>

  addTask: (topic: string) => string
  updateTask: (id: string, updates: Partial<ResearchTask>) => void
  removeTask: (id: string) => void
  setPanelOpen: (open: boolean) => void
  getRunningCount: () => number
  getNextQueued: () => ResearchTask | undefined
  setServerTaskId: (localId: string, serverTaskId: string | null) => void
  getServerTaskId: (localId: string) => string | undefined
}

let counter = 0

export const useResearchStore = create<ResearchState>()(
  persist(
    (set, get) => ({
      tasks: [],
      panelOpen: false,
      maxConcurrent: 3,
      serverTaskIds: {},

      addTask: (topic) => {
        const id = `research-${++counter}`
        set((state) => ({
          tasks: [
            ...state.tasks,
            {
              id,
              topic,
              status: "queued",
              webResults: [],
              synthesis: "",
              savedPath: null,
              error: null,
              createdAt: Date.now(),
            },
          ],
          panelOpen: true,
        }))
        return id
      },

      updateTask: (id, updates) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),

      removeTask: (id) =>
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== id),
        })),

      setPanelOpen: (panelOpen) => set({ panelOpen }),

      getRunningCount: () => {
        const { tasks } = get()
        return tasks.filter((t) =>
          t.status === "searching" || t.status === "synthesizing" || t.status === "saving"
        ).length
      },

      getNextQueued: () => {
        const { tasks } = get()
        return tasks.find((t) => t.status === "queued")
      },

      setServerTaskId: (localId, serverTaskId) =>
        set((state) => {
          if (serverTaskId === null) {
            const { [localId]: _, ...rest } = state.serverTaskIds
            return { serverTaskIds: rest }
          }
          return { serverTaskIds: { ...state.serverTaskIds, [localId]: serverTaskId } }
        }),

      getServerTaskId: (localId) => get().serverTaskIds[localId],
    }),
    {
      name: "llm-wiki-research-store",
      partialize: (state) => ({
        serverTaskIds: state.serverTaskIds,
      }),
    },
  ),
)
