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

    it("generates unique IDs for consecutive adds", () => {
      const ids = Array.from({ length: 5 }, () =>
        useActivityStore.getState().addItem(sampleItem)
      )
      const unique = new Set(ids)
      expect(unique.size).toBe(5)
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

    it("does not affect other items", () => {
      const id1 = useActivityStore.getState().addItem({ ...sampleItem, title: "One" })
      useActivityStore.getState().addItem({ ...sampleItem, title: "Two" })
      useActivityStore.getState().updateItem(id1, { status: "done" })
      const items = useActivityStore.getState().items
      const one = items.find((i) => i.id === id1)!
      const two = items.find((i) => i.title === "Two")!
      expect(one.status).toBe("done")
      expect(two.status).toBe("running")
    })
  })

  describe("appendDetail", () => {
    it("appends text to detail", () => {
      const id = useActivityStore.getState().addItem(sampleItem)
      useActivityStore.getState().appendDetail(id, " Processing...")
      expect(useActivityStore.getState().items[0].detail).toBe("Starting... Processing...")
    })

    it("can append multiple times", () => {
      const id = useActivityStore.getState().addItem({ ...sampleItem, detail: "" })
      useActivityStore.getState().appendDetail(id, "A")
      useActivityStore.getState().appendDetail(id, "B")
      useActivityStore.getState().appendDetail(id, "C")
      expect(useActivityStore.getState().items[0].detail).toBe("ABC")
    })
  })

  describe("clearDone", () => {
    it("removes done items", () => {
      const id1 = useActivityStore.getState().addItem(sampleItem)
      const id2 = useActivityStore.getState().addItem({ ...sampleItem, title: "Done one" })
      useActivityStore.getState().updateItem(id2, { status: "done" })
      useActivityStore.getState().clearDone()
      const items = useActivityStore.getState().items
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe(id1)
    })

    it("KEEPS error items (only done is cleared, errors need user attention)", () => {
      const id = useActivityStore.getState().addItem(sampleItem)
      useActivityStore.getState().updateItem(id, { status: "error" })
      useActivityStore.getState().clearDone()
      // Error items are retained so the user can see what failed
      expect(useActivityStore.getState().items).toHaveLength(1)
      expect(useActivityStore.getState().items[0].status).toBe("error")
    })

    it("keeps running items", () => {
      useActivityStore.getState().addItem(sampleItem) // running
      useActivityStore.getState().clearDone()
      expect(useActivityStore.getState().items).toHaveLength(1)
    })

    it("clears only done while keeping running and error", () => {
      const idRunning = useActivityStore.getState().addItem({ ...sampleItem, title: "Running" })
      const idDone = useActivityStore.getState().addItem({ ...sampleItem, title: "Done" })
      const idError = useActivityStore.getState().addItem({ ...sampleItem, title: "Error" })
      useActivityStore.getState().updateItem(idDone, { status: "done" })
      useActivityStore.getState().updateItem(idError, { status: "error" })
      useActivityStore.getState().clearDone()
      const ids = useActivityStore.getState().items.map((i) => i.id)
      expect(ids).toContain(idRunning)
      expect(ids).toContain(idError)
      expect(ids).not.toContain(idDone)
    })
  })
})
