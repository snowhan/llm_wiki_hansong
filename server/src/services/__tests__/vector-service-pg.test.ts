/**
 * RED phase tests for pgvector-based vector-service migration.
 *
 * These tests verify the new API that uses PostgreSQL + pgvector extension
 * instead of the current JSON file-based implementation.
 *
 * All tests MUST FAIL initially (RED) because vector-service.ts still
 * uses the file-based implementation. They will pass (GREEN) after
 * the migration to pgvector is complete.
 */
import { vi, describe, it, expect, beforeEach } from "vitest"

// ── DB mock ────────────────────────────────────────────────────────────────

const mockExecute = vi.fn()

vi.mock("../../db/client.js", () => ({
  getDb: () => ({
    execute: mockExecute,
  }),
}))

// ── tests ──────────────────────────────────────────────────────────────────

describe("vector-service pgvector", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // ── E-01: vectorUpsert ──────────────────────────────────────────────────

  describe("E-01: vectorUpsert()", () => {
    it("executes an INSERT ... ON CONFLICT upsert into wiki_embeddings", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] })

      const { vectorUpsert } = await import("../vector-service.js")
      await vectorUpsert("proj-1", "page-1", [0.1, 0.2, 0.3])

      expect(mockExecute).toHaveBeenCalledOnce()
      // Drizzle sql`` objects store query text in queryChunks; JSON.stringify exposes it
      const sqlStr = JSON.stringify(mockExecute.mock.calls[0][0])
      expect(sqlStr).toMatch(/wiki_embeddings/i)
      expect(sqlStr).toMatch(/ON CONFLICT/i)
    })

    it("includes project_id and page_id in the SQL call", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] })

      const { vectorUpsert } = await import("../vector-service.js")
      await vectorUpsert("proj-42", "wiki/hello.md", [0.5, 0.6])

      expect(mockExecute).toHaveBeenCalledOnce()
    })
  })

  // ── E-02: vectorSearch ──────────────────────────────────────────────────

  describe("E-02: vectorSearch()", () => {
    it("returns results ordered by cosine similarity descending", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [
          { page_id: "page-a", score: 0.95 },
          { page_id: "page-b", score: 0.72 },
        ],
      })

      const { vectorSearch } = await import("../vector-service.js")
      const results = await vectorSearch("proj-1", [0.1, 0.2, 0.3], 5)

      expect(results).toHaveLength(2)
      expect(results[0].page_id).toBe("page-a")
      expect(results[0].score).toBeCloseTo(0.95)
      expect(results[1].page_id).toBe("page-b")
    })

    it("passes project_id filter and topK limit to the SQL query", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] })

      const { vectorSearch } = await import("../vector-service.js")
      await vectorSearch("proj-99", [1, 0, 0], 3)

      expect(mockExecute).toHaveBeenCalledOnce()
    })
  })

  // ── E-03: vectorDelete ──────────────────────────────────────────────────

  describe("E-03: vectorDelete()", () => {
    it("executes a DELETE from wiki_embeddings for the given page_id", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] })

      const { vectorDelete } = await import("../vector-service.js")
      await vectorDelete("proj-1", "page-to-delete")

      expect(mockExecute).toHaveBeenCalledOnce()
      const sqlStr = JSON.stringify(mockExecute.mock.calls[0][0])
      expect(sqlStr).toMatch(/DELETE/i)
      expect(sqlStr).toMatch(/wiki_embeddings/i)
    })
  })

  // ── E-04: vectorCount ──────────────────────────────────────────────────

  describe("E-04: vectorCount()", () => {
    it("returns the row count for a given project_id", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [{ count: "42" }] })

      const { vectorCount } = await import("../vector-service.js")
      const count = await vectorCount("proj-1")

      expect(count).toBe(42)
    })

    it("returns 0 when no rows exist", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [{ count: "0" }] })

      const { vectorCount } = await import("../vector-service.js")
      const count = await vectorCount("proj-empty")

      expect(count).toBe(0)
    })
  })
})
