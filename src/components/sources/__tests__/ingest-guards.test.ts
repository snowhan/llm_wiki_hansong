/**
 * Integration-style tests for the ingest guard logic in SourcesView.
 *
 * We test the STATE MACHINE rules directly via the Zustand store:
 *   - A file with status "ingesting" must not be re-triggered
 *   - A file with a live serverTaskId must not be re-triggered
 *   - A file with "idle", "done" or "error" CAN be triggered
 *   - setProject resets ingest state (no bleed-across)
 *
 * The `startServerIngest` and `subscribeIngestSSE` commands are mocked so no
 * real network calls are made.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useWikiStore } from "@/stores/wiki-store"

// ── Mock network commands ─────────────────────────────────────────────────

vi.mock("@/commands/ingest", () => ({
  startServerIngest: vi.fn().mockResolvedValue("task-mock-id"),
  subscribeIngestSSE: vi.fn().mockReturnValue(() => { /* noop cleanup */ }),
  getAllServerTasks: vi.fn().mockResolvedValue([]),
  getServerIngestStatus: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/commands/fs", () => ({
  readFile: vi.fn().mockRejectedValue(new Error("not found")),
  writeFile: vi.fn().mockResolvedValue(undefined),
  listDirectory: vi.fn().mockResolvedValue([]),
  createDirectory: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}))

// ── Store setup ───────────────────────────────────────────────────────────

const PROJECT = { id: "test-proj-uuid", name: "Test Project" }
const FILE_A = "/test/project/src/a.pdf"
const FILE_B = "/test/project/src/b.docx"

function resetStore() {
  useWikiStore.setState({
    project: PROJECT,
    openTabs: [],
    activeTabId: null,
    activeTabPath: null,
    ingestingPath: null,
    ingestStatuses: {},
    serverTaskIds: {},
  })
}

beforeEach(resetStore)

// ── Ingest guard rules ────────────────────────────────────────────────────

describe("Ingest state-machine guard rules (via wiki-store)", () => {
  describe("files that MUST NOT be re-ingested", () => {
    it("status 'ingesting' blocks re-trigger", () => {
      useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
      const status = useWikiStore.getState().ingestStatuses[FILE_A]
      expect(status).toBe("ingesting")
      // Simulate the guard check in triggerServerIngest
      expect(status === "ingesting").toBe(true)
    })

    it("live serverTaskId blocks re-trigger", () => {
      useWikiStore.getState().setServerTaskId(FILE_A, "task-abc")
      const hasTask = !!useWikiStore.getState().serverTaskIds[FILE_A]
      expect(hasTask).toBe(true)
    })

    it("status 'ingesting' + live serverTaskId both block", () => {
      useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
      useWikiStore.getState().setServerTaskId(FILE_A, "task-abc")
      const s = useWikiStore.getState()
      const blocked = s.ingestStatuses[FILE_A] === "ingesting" || !!s.serverTaskIds[FILE_A]
      expect(blocked).toBe(true)
    })
  })

  describe("files that CAN be re-ingested", () => {
    it("status 'idle' allows trigger", () => {
      useWikiStore.getState().setIngestStatus(FILE_A, "idle")
      const s = useWikiStore.getState()
      const blocked = s.ingestStatuses[FILE_A] === "ingesting" || !!s.serverTaskIds[FILE_A]
      expect(blocked).toBe(false)
    })

    it("status 'done' allows re-trigger (re-generation)", () => {
      useWikiStore.getState().setIngestStatus(FILE_A, "done")
      const s = useWikiStore.getState()
      const blocked = s.ingestStatuses[FILE_A] === "ingesting" || !!s.serverTaskIds[FILE_A]
      expect(blocked).toBe(false)
    })

    it("status 'error' allows retry", () => {
      useWikiStore.getState().setIngestStatus(FILE_A, "error")
      const s = useWikiStore.getState()
      const blocked = s.ingestStatuses[FILE_A] === "ingesting" || !!s.serverTaskIds[FILE_A]
      expect(blocked).toBe(false)
    })

    it("status 'interrupted' with no serverTaskId allows re-trigger", () => {
      useWikiStore.getState().setIngestStatus(FILE_A, "interrupted")
      useWikiStore.getState().setServerTaskId(FILE_A, null) // cleared
      const s = useWikiStore.getState()
      const blocked = s.ingestStatuses[FILE_A] === "ingesting" || !!s.serverTaskIds[FILE_A]
      expect(blocked).toBe(false)
    })
  })

  describe("state transitions during the lifecycle", () => {
    it("start: idle → ingesting + serverTaskId set", () => {
      useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
      useWikiStore.getState().setIngestingPath(FILE_A)
      useWikiStore.getState().setServerTaskId(FILE_A, "task-1")
      const s = useWikiStore.getState()
      expect(s.ingestStatuses[FILE_A]).toBe("ingesting")
      expect(s.ingestingPath).toBe(FILE_A)
      expect(s.serverTaskIds[FILE_A]).toBe("task-1")
    })

    it("done: ingesting → done + serverTaskId cleared", () => {
      useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
      useWikiStore.getState().setServerTaskId(FILE_A, "task-1")
      // Simulate onDone handler
      useWikiStore.getState().setIngestStatus(FILE_A, "done")
      useWikiStore.getState().setIngestingPath(null)
      useWikiStore.getState().setServerTaskId(FILE_A, null)
      const s = useWikiStore.getState()
      expect(s.ingestStatuses[FILE_A]).toBe("done")
      expect(s.ingestingPath).toBeNull()
      expect(s.serverTaskIds[FILE_A]).toBeUndefined()
    })

    it("error: ingesting → error + serverTaskId cleared", () => {
      useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
      useWikiStore.getState().setServerTaskId(FILE_A, "task-1")
      // Simulate onError handler
      useWikiStore.getState().setIngestStatus(FILE_A, "error")
      useWikiStore.getState().setIngestingPath(null)
      useWikiStore.getState().setServerTaskId(FILE_A, null)
      const s = useWikiStore.getState()
      expect(s.ingestStatuses[FILE_A]).toBe("error")
      expect(s.ingestingPath).toBeNull()
      expect(s.serverTaskIds[FILE_A]).toBeUndefined()
    })

    it("multiple files track independently", () => {
      useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
      useWikiStore.getState().setServerTaskId(FILE_A, "task-a")
      useWikiStore.getState().setIngestStatus(FILE_B, "idle")
      const s = useWikiStore.getState()
      expect(s.ingestStatuses[FILE_A]).toBe("ingesting")
      expect(s.ingestStatuses[FILE_B]).toBe("idle")
      expect(!!s.serverTaskIds[FILE_A]).toBe(true)
      expect(!!s.serverTaskIds[FILE_B]).toBe(false)
    })
  })

  describe("project switch resets all ingest state", () => {
    it("clears ingestStatuses on setProject", () => {
      useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
      useWikiStore.getState().setIngestStatus(FILE_B, "done")
      useWikiStore.getState().setProject({ id: "new-proj-uuid", name: "New" })
      expect(useWikiStore.getState().ingestStatuses).toEqual({})
    })

    it("clears serverTaskIds on setProject", () => {
      useWikiStore.getState().setServerTaskId(FILE_A, "task-1")
      useWikiStore.getState().setProject({ id: "new-proj-uuid", name: "New" })
      expect(useWikiStore.getState().serverTaskIds).toEqual({})
    })

    it("clears ingestingPath on setProject", () => {
      useWikiStore.getState().setIngestingPath(FILE_A)
      useWikiStore.getState().setProject({ id: "new-proj-uuid", name: "New" })
      expect(useWikiStore.getState().ingestingPath).toBeNull()
    })

    it("previous-project's 'ingesting' status does not block new-project's files", () => {
      useWikiStore.getState().setIngestStatus(FILE_A, "ingesting")
      useWikiStore.getState().setProject({ id: "new-proj-uuid", name: "New" })
      // FILE_A belongs to old project; new project starts fresh
      const s = useWikiStore.getState()
      // After project switch the map is empty, so no path from old project blocks anything
      expect(Object.keys(s.ingestStatuses)).toHaveLength(0)
    })
  })
})
