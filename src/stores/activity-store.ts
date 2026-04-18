import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface ActivityItem {
  id: string
  type: "ingest" | "lint" | "query"
  title: string
  status: "running" | "done" | "error"
  detail: string
  filesWritten: string[]
  createdAt: number
}

interface ActivityState {
  items: ActivityItem[]
  addItem: (item: Omit<ActivityItem, "id" | "createdAt">) => string
  updateItem: (id: string, updates: Partial<Pick<ActivityItem, "status" | "detail" | "filesWritten">>) => void
  appendDetail: (id: string, text: string) => void
  clearDone: () => void
  clearErrors: () => void
}

// Derive the next counter from persisted items to avoid id collisions after reload.
function initCounter(items: ActivityItem[]): number {
  let max = 0
  for (const item of items) {
    const m = item.id.match(/^activity-(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max
}

let counter = 0

export const useActivityStore = create<ActivityState>()(
  persist(
    (set, _get) => ({
      items: [],

      addItem: (item) => {
        const id = `activity-${++counter}`
        set((state) => ({
          items: [
            { ...item, id, createdAt: Date.now() },
            ...state.items,
          ],
        }))
        return id
      },

      updateItem: (id, updates) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        })),

      appendDetail: (id, text) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, detail: item.detail + text } : item
          ),
        })),

      // "清除已完成" — only removes successfully finished items.
      // Error items stay so the user knows what failed.
      clearDone: () =>
        set((state) => ({
          items: state.items.filter((i) => i.status === "running" || i.status === "error"),
        })),

      // "清除失败" — removes all error items.
      clearErrors: () =>
        set((state) => ({
          items: state.items.filter((i) => i.status !== "error"),
        })),
    }),
    {
      name: "llm-wiki-activity",
      // Only persist items, not actions
      partialize: (state) => ({ items: state.items }),
      // On rehydration: any "running" item was killed by page refresh; also prune old items
      // and sync the in-memory counter so new IDs don't collide with persisted ones.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const now = Date.now()
        const normalized = state.items
          .map((item) =>
            item.status === "running"
              ? { ...item, status: "error" as const, detail: "任务被页面刷新中断，请重新生成" }
              : item
          )
          // Only keep items from the last 24 hours
          .filter((item) => now - item.createdAt < 24 * 60 * 60 * 1000)

        // Sync counter so new ids don't collide with already-persisted ids.
        counter = initCounter(normalized)

        // Use setState to properly notify subscribers (not direct mutation).
        useActivityStore.setState({ items: normalized })
      },
    }
  )
)
