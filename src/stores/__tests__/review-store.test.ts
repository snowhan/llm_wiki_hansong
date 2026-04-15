import { describe, it, expect, beforeEach } from "vitest"
import { useReviewStore } from "../review-store"

beforeEach(() => {
  useReviewStore.setState({ items: [] })
})

const sampleItem = {
  type: "suggestion" as const,
  title: "Add more sources",
  description: "The wiki needs more references",
  options: [{ label: "Accept", action: "accept" }],
}

describe("useReviewStore", () => {
  it("starts with empty items", () => {
    expect(useReviewStore.getState().items).toEqual([])
  })

  describe("addItem", () => {
    it("adds item with auto-generated id", () => {
      useReviewStore.getState().addItem(sampleItem)
      const items = useReviewStore.getState().items
      expect(items).toHaveLength(1)
      expect(items[0].id).toMatch(/^review-/)
      expect(items[0].resolved).toBe(false)
      expect(items[0].title).toBe("Add more sources")
    })
  })

  describe("addItems", () => {
    it("adds multiple items at once", () => {
      useReviewStore.getState().addItems([sampleItem, { ...sampleItem, title: "Second" }])
      expect(useReviewStore.getState().items).toHaveLength(2)
    })

    it("each item gets unique id", () => {
      useReviewStore.getState().addItems([sampleItem, sampleItem])
      const ids = useReviewStore.getState().items.map((i) => i.id)
      expect(new Set(ids).size).toBe(2)
    })
  })

  describe("resolveItem", () => {
    it("marks item as resolved with action", () => {
      useReviewStore.getState().addItem(sampleItem)
      const id = useReviewStore.getState().items[0].id
      useReviewStore.getState().resolveItem(id, "accept")
      const item = useReviewStore.getState().items[0]
      expect(item.resolved).toBe(true)
      expect(item.resolvedAction).toBe("accept")
    })
  })

  describe("dismissItem", () => {
    it("removes item from list", () => {
      useReviewStore.getState().addItem(sampleItem)
      const id = useReviewStore.getState().items[0].id
      useReviewStore.getState().dismissItem(id)
      expect(useReviewStore.getState().items).toHaveLength(0)
    })
  })

  describe("clearResolved", () => {
    it("removes only resolved items", () => {
      useReviewStore.getState().addItems([sampleItem, { ...sampleItem, title: "Kept" }])
      const items = useReviewStore.getState().items
      useReviewStore.getState().resolveItem(items[0].id, "done")
      useReviewStore.getState().clearResolved()
      const remaining = useReviewStore.getState().items
      expect(remaining).toHaveLength(1)
      expect(remaining[0].title).toBe("Kept")
    })
  })

  describe("setItems", () => {
    it("replaces all items", () => {
      useReviewStore.getState().addItem(sampleItem)
      useReviewStore.getState().setItems([])
      expect(useReviewStore.getState().items).toEqual([])
    })
  })
})
