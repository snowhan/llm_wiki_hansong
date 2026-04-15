import { describe, it, expect, beforeEach } from "vitest"
import { useResearchStore } from "../research-store"

beforeEach(() => {
  useResearchStore.setState({ tasks: [], panelOpen: false, maxConcurrent: 3 })
})

describe("useResearchStore", () => {
  it("starts with empty tasks and panel closed", () => {
    const s = useResearchStore.getState()
    expect(s.tasks).toEqual([])
    expect(s.panelOpen).toBe(false)
  })

  describe("addTask", () => {
    it("creates task with queued status", () => {
      const id = useResearchStore.getState().addTask("AI safety")
      const task = useResearchStore.getState().tasks.find((t) => t.id === id)
      expect(task).toBeDefined()
      expect(task!.status).toBe("queued")
      expect(task!.topic).toBe("AI safety")
      expect(task!.synthesis).toBe("")
      expect(task!.error).toBeNull()
    })

    it("opens panel on add", () => {
      useResearchStore.getState().addTask("topic")
      expect(useResearchStore.getState().panelOpen).toBe(true)
    })

    it("returns unique ids", () => {
      const id1 = useResearchStore.getState().addTask("a")
      const id2 = useResearchStore.getState().addTask("b")
      expect(id1).not.toBe(id2)
    })
  })

  describe("updateTask", () => {
    it("updates task fields", () => {
      const id = useResearchStore.getState().addTask("topic")
      useResearchStore.getState().updateTask(id, { status: "searching" })
      const task = useResearchStore.getState().tasks.find((t) => t.id === id)
      expect(task!.status).toBe("searching")
    })

    it("supports partial updates", () => {
      const id = useResearchStore.getState().addTask("topic")
      useResearchStore.getState().updateTask(id, { synthesis: "Results..." })
      const task = useResearchStore.getState().tasks.find((t) => t.id === id)
      expect(task!.synthesis).toBe("Results...")
      expect(task!.status).toBe("queued")
    })
  })

  describe("removeTask", () => {
    it("removes task by id", () => {
      const id = useResearchStore.getState().addTask("topic")
      useResearchStore.getState().removeTask(id)
      expect(useResearchStore.getState().tasks).toHaveLength(0)
    })
  })

  describe("getRunningCount", () => {
    it("counts searching + synthesizing + saving", () => {
      const id1 = useResearchStore.getState().addTask("a")
      const id2 = useResearchStore.getState().addTask("b")
      const id3 = useResearchStore.getState().addTask("c")
      useResearchStore.getState().updateTask(id1, { status: "searching" })
      useResearchStore.getState().updateTask(id2, { status: "synthesizing" })
      useResearchStore.getState().updateTask(id3, { status: "done" })
      expect(useResearchStore.getState().getRunningCount()).toBe(2)
    })
  })

  describe("getNextQueued", () => {
    it("returns first queued task", () => {
      const id1 = useResearchStore.getState().addTask("first")
      useResearchStore.getState().addTask("second")
      const next = useResearchStore.getState().getNextQueued()
      expect(next?.id).toBe(id1)
    })

    it("returns undefined when none queued", () => {
      const id = useResearchStore.getState().addTask("task")
      useResearchStore.getState().updateTask(id, { status: "done" })
      expect(useResearchStore.getState().getNextQueued()).toBeUndefined()
    })
  })

  describe("setPanelOpen", () => {
    it("toggles panel", () => {
      useResearchStore.getState().setPanelOpen(true)
      expect(useResearchStore.getState().panelOpen).toBe(true)
      useResearchStore.getState().setPanelOpen(false)
      expect(useResearchStore.getState().panelOpen).toBe(false)
    })
  })
})
