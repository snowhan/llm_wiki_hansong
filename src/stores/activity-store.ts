import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface ActivityItem {
  id: string
  type: "ingest" | "lint" | "query"
  projectId?: string
  sourcePath?: string
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

function genId(): string {
  return `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function dedupeItemIds(items: ActivityItem[]): ActivityItem[] {
  const seen = new Set<string>()
  return items.map((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      return item
    }
    let nextId = genId()
    while (seen.has(nextId)) nextId = genId()
    seen.add(nextId)
    return { ...item, id: nextId }
  })
}

export const useActivityStore = create<ActivityState>()(
  persist(
    (set, _get) => ({
      items: [],

      addItem: (item) => {
        let createdId = ""
        set((state) => ({
          // Guard against rare timestamp/random collisions that can cause duplicate React keys.
          items: (() => {
            let id = genId()
            while (state.items.some((existing) => existing.id === id)) {
              id = genId()
            }
            createdId = id
            return [
              { ...item, id, createdAt: Date.now() },
              ...state.items,
            ]
          })(),
        }))
        return createdId
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
      // Deduplicate + normalize DURING hydration (before the first React render)
      // so React never sees duplicate keys in the activity list.
      merge: (_persisted, current) => {
        const persisted = _persisted as Partial<typeof current>
        const now = Date.now()
        const raw: ActivityItem[] = persisted.items ?? []
        const normalized = raw
          .map((item) =>
            item.status === "running"
              ? { ...item, status: "error" as const, detail: "任务被页面刷新中断，请重新生成" }
              : item
          )
          .filter((item) =>
            item.status === "done"
              ? now - item.createdAt < 24 * 60 * 60 * 1000
              : false
          )
        return { ...current, items: dedupeItemIds(normalized) }
      },
    }
  )
)
