/**
 * TDD RED phase — ingest-task-store.ts
 *
 * Tests for PostgreSQL-backed task persistence.
 * All tests FAIL until ingest-task-store.ts is implemented.
 *
 * Coverage:
 *   A-01: createTask returns a task with uuid id and "pending" status
 *   A-02: getTask returns null for unknown taskId
 *   A-03: getTask returns the created task
 *   A-04: updateTask persists status changes
 *   A-05: findActiveTask returns running/pending task for same (projectId, sourcePath)
 *   A-06: findActiveTask returns null when no active task exists
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the DB client before importing the module under test
vi.mock("../../db/client.js", () => ({
  getDb: vi.fn(),
}))

const mockDb = {
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn(),
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
}

import { getDb } from "../../db/client.js"

const {
  createIngestTask,
  getIngestTask,
  updateIngestTask,
  findActiveIngestTask,
} = await import("../ingest-task-store.js")

describe("ingest-task-store", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDb).mockReturnValue(mockDb as never)
  })

  describe("A-01: createIngestTask", () => {
    it("creates a task with uuid id and pending status", async () => {
      const task = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        projectId: "proj-001",
        sourcePath: "sources/doc.md",
        folderContext: "",
        force: false,
        status: "pending" as const,
        detail: "Queued",
        filesWritten: [],
        error: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockDb.returning.mockResolvedValueOnce([task])

      const result = await createIngestTask("proj-001", "sources/doc.md")
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        "id must be a valid UUIDv4",
      )
      expect(result.status).toBe("pending")
      expect(result.projectId).toBe("proj-001")
      expect(result.sourcePath).toBe("sources/doc.md")
    })
  })

  describe("A-02: getIngestTask — unknown id", () => {
    it("returns null when taskId does not exist", async () => {
      mockDb.where.mockResolvedValueOnce([])
      const result = await getIngestTask("nonexistent-id")
      expect(result).toBeNull()
    })
  })

  describe("A-03: getIngestTask — found", () => {
    it("returns the task when it exists", async () => {
      const taskId = "550e8400-e29b-41d4-a716-446655440001"
      const storedTask = {
        id: taskId,
        projectId: "proj-002",
        sourcePath: "sources/data.csv",
        folderContext: "",
        force: false,
        status: "running" as const,
        detail: "Processing...",
        filesWritten: [],
        error: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockDb.where.mockResolvedValueOnce([storedTask])

      const result = await getIngestTask(taskId)
      expect(result).not.toBeNull()
      expect(result?.id).toBe(taskId)
      expect(result?.status).toBe("running")
    })
  })

  describe("A-04: updateIngestTask", () => {
    it("persists status and detail changes", async () => {
      const taskId = "550e8400-e29b-41d4-a716-446655440002"
      const updatedTask = {
        id: taskId,
        projectId: "proj-003",
        sourcePath: "sources/report.pdf",
        folderContext: "",
        force: false,
        status: "done" as const,
        detail: "3 files written",
        filesWritten: ["wiki/sources/report.md"],
        error: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockDb.returning.mockResolvedValueOnce([updatedTask])

      const result = await updateIngestTask(taskId, {
        status: "done",
        detail: "3 files written",
        filesWritten: ["wiki/sources/report.md"],
      })
      expect(result?.status).toBe("done")
      expect(result?.filesWritten).toContain("wiki/sources/report.md")
    })
  })

  describe("A-05: findActiveIngestTask — found", () => {
    it("returns running task for same projectId+sourcePath", async () => {
      const runningTask = {
        id: "550e8400-e29b-41d4-a716-446655440003",
        projectId: "proj-004",
        sourcePath: "sources/active.md",
        folderContext: "",
        force: false,
        status: "running" as const,
        detail: "Running...",
        filesWritten: [],
        error: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockDb.where.mockResolvedValueOnce([runningTask])

      const result = await findActiveIngestTask("proj-004", "sources/active.md")
      expect(result).not.toBeNull()
      expect(result?.id).toBe(runningTask.id)
    })
  })

  describe("A-06: findActiveIngestTask — not found", () => {
    it("returns null when no active task exists", async () => {
      mockDb.where.mockResolvedValueOnce([])
      const result = await findActiveIngestTask("proj-005", "sources/idle.md")
      expect(result).toBeNull()
    })
  })
})
