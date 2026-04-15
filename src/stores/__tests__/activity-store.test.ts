import { describe, it, expect, beforeEach } from "vitest"
import { useActivityStore } from "../activity-store"

beforeEach(() => {
  useActivityStore.setState({ items: [] })
})

const sampleItem = {
  type: "ingest" as const,
  title: "Processing file.pdf",
  status: "running" as const,
  detail: "Starting...",
  filesWritten: [],
}

describe("useActivityStore", () => {
  it("starts with empty items", () => {
    expect(useActivityStore.getState().items).toEqual([])
  })

  describe("addItem", () => {
    it("adds item and returns id", () => {
      const id = useActivityStore.getState().addItem(sampleItem)
      expect(id).toMatch(/^activity-/)
      expect(useActivityStore.getState().items).toHaveLength(1)
    })

    it("prepends new items (most recent first)", () => {
      useActivityStore.getState().addItem({ ...sampleItem, title: "First" })
      useActivityStore.getState().addItem({ ...sampleItem, title: "Second" })
      expect(useActivityStore.getState().items[0].title).toBe("Second")
    })

    it("sets createdAt timestamp", () => {
      useActivityStore.getState().addItem(sampleItem)
      expect(useActivityStore.getState().items[0].createdAt).toBeGreaterThan(0)
    })
  })

  describe("updateItem", () => {
    it("updates status", () => {
      const id = useActivityStore.getState().addItem(sampleItem)
      useActivityStore.getState().updateItem(id, { status: "done" })
      expect(useActivityStore.getState().items[0].status).toBe("done")
    })

    it("updates detail", () => {
      const id = useActivityStore.getState().addItem(sampleItem)
      useActivityStore.getState().updateItem(id, { detail: "50% complete" })
      expect(useActivityStore.getState().items[0].detail).toBe("50% complete")
    })

    it("updates filesWritten", () => {
      const id = useActivityStore.getState().addItem(sampleItem)
      useActivityStore.getState().updateItem(id, { filesWritten: ["a.md", "b.md"] })
      expect(useActivityStore.getState().items[0].filesWritten).toEqual(["a.md", "b.md"])
    })
  })

  describe("appendDetail", () => {
    it("appends text to detail", () => {
      const id = useActivityStore.getState().addItem(sampleItem)
      useActivityStore.getState().appendDetail(id, " Processing...")
      expect(useActivityStore.getState().items[0].detail).toBe("Starting... Processing...")
    })
  })

  describe("clearDone", () => {
    it("removes non-running items", () => {
      const id1 = useActivityStore.getState().addItem(sampleItem)
      const id2 = useActivityStore.getState().addItem({ ...sampleItem, title: "Done one" })
      useActivityStore.getState().updateItem(id2, { status: "done" })
      useActivityStore.getState().clearDone()
      const items = useActivityStore.getState().items
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe(id1)
    })

    it("removes error items too", () => {
      const id = useActivityStore.getState().addItem(sampleItem)
      useActivityStore.getState().updateItem(id, { status: "error" })
      useActivityStore.getState().clearDone()
      expect(useActivityStore.getState().items).toHaveLength(0)
    })
  })
})
