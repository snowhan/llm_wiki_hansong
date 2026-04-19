import { create } from "zustand"
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client"

export interface MappingCheckItem {
  id: string
  projectId: string
  filePath: string
  pathType: "entity" | "concept" | "other"
  frontmatterType: string
  frontmatterTitle: string
  contentPreview: string
  riskLevel: "high" | "ok"
  riskReason?: string
  status: "pending" | "approved"
  ingestSession: string
  createdAt: number
}

interface MappingCheckState {
  items: MappingCheckItem[]
  loading: boolean
  setItems: (items: MappingCheckItem[]) => void
  loadItems: (projectId: string) => Promise<void>
  saveItems: (projectId: string, items: MappingCheckItem[], session: string) => Promise<void>
  approveItem: (projectId: string, id: string) => Promise<void>
  clearItems: (projectId: string) => Promise<void>
}

export const useMappingCheckStore = create<MappingCheckState>((set, get) => ({
  items: [],
  loading: false,

  setItems: (items) => set({ items }),

  loadItems: async (projectId) => {
    set({ loading: true })
    try {
      const { items } = await apiGet<{ items: MappingCheckItem[] }>(
        `/api/mapping-check/items?projectId=${encodeURIComponent(projectId)}`,
      )
      set({ items })
    } catch (err) {
      console.error("[MappingCheckStore] loadItems failed:", err)
    } finally {
      set({ loading: false })
    }
  },

  saveItems: async (projectId, newItems, session) => {
    try {
      const { items } = await apiPost<{ items: MappingCheckItem[] }>("/api/mapping-check/items", {
        projectId,
        items: newItems,
        replaceSession: session,
      })
      set({ items })
    } catch (err) {
      console.error("[MappingCheckStore] saveItems failed:", err)
    }
  },

  approveItem: async (projectId, id) => {
    // Optimistic update
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, status: "approved" as const } : i)),
    }))
    try {
      await apiPatch(`/api/mapping-check/items/${id}`, { projectId, status: "approved" })
    } catch (err) {
      console.error("[MappingCheckStore] approveItem failed:", err)
      // Revert on failure
      set((state) => ({
        items: state.items.map((i) => (i.id === id ? { ...i, status: "pending" as const } : i)),
      }))
    }
  },

  clearItems: async (projectId) => {
    try {
      await apiDelete(`/api/mapping-check/items?projectId=${encodeURIComponent(projectId)}`)
      set({ items: [] })
    } catch (err) {
      console.error("[MappingCheckStore] clearItems failed:", err)
    }
  },
}))

/** Pending (not yet approved) items count */
export function usePendingMappingCount() {
  return useMappingCheckStore((s) => s.items.filter((i) => i.status === "pending").length)
}

/** High-risk pending items count */
export function useHighRiskMappingCount() {
  return useMappingCheckStore(
    (s) => s.items.filter((i) => i.status === "pending" && i.riskLevel === "high").length,
  )
}
