/**
 * TDD RED phase — ingest SSE security tests
 *
 * Verifies that the SSE stream endpoint:
 *   B-01: POST /stream/:taskId with Authorization header succeeds (returns SSE headers)
 *   B-02: POST /stream/:taskId without auth returns 401
 *   B-03: GET /stream/:taskId (old endpoint) returns 405 Method Not Allowed
 *   B-04: POST /stream/:taskId with token in URL query param is rejected (401)
 *   B-05: POST /stream/:taskId with invalid JWT returns 401
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"

// Mock auth guards
vi.mock("../../middleware/auth-guards.js", () => ({
  requireMember: vi.fn((req, _res, next) => {
    const auth = req.headers["authorization"] as string | undefined
    if (!auth || !auth.startsWith("Bearer ")) {
      _res.status(401).json({ error: "Unauthorized" })
      return
    }
    if (auth === "Bearer invalid-token") {
      _res.status(401).json({ error: "Invalid token" })
      return
    }
    next()
  }),
  requireAdmin: vi.fn((_req, _res, next) => next()),
}))

// Mock ingest service — registerSseClient immediately writes a done event so SSE closes
vi.mock("../../services/ingest-service.js", () => ({
  getTask: vi.fn(() => ({
    id: "test-task-123",
    status: "done",
    detail: "3 files written",
    filesWritten: ["wiki/sources/doc.md"],
    error: null,
  })),
  getAllTasks: vi.fn(() => []),
  startIngestTask: vi.fn(() => "test-task-123"),
  registerSseClient: vi.fn(),
  unregisterSseClient: vi.fn(),
  rebuildWikiIndex: vi.fn(),
  startRebuildSummaryTask: vi.fn(() => "rebuild-task-1"),
  getRebuildSummaryTask: vi.fn(() => null),
  startDeduplicateTask: vi.fn(() => "dedup-task-1"),
  getDeduplicateTask: vi.fn(() => null),
}))

vi.mock("../../services/project-service.js", () => ({
  getProjectRoot: vi.fn(() => "/tmp/test-project"),
}))

const { default: ingestRouter } = await import("../ingest.js")

function createApp() {
  const app = express()
  app.use(express.json())
  app.use("/api/ingest", ingestRouter)
  return app
}

describe("SSE security — ingest stream endpoint", () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  describe("B-01: POST /stream/:taskId with valid Authorization header", () => {
    it("returns 200 and SSE content-type (task already done → closes immediately)", async () => {
      // task is mocked as "done" so the handler writes the event and calls res.end()
      const res = await request(app)
        .post("/api/ingest/stream/test-task-123")
        .set("Authorization", "Bearer valid-jwt-token")

      expect(res.status).toBe(200)
      expect(res.headers["content-type"]).toContain("text/event-stream")
    })
  })

  describe("B-02: POST /stream/:taskId without auth", () => {
    it("returns 401 Unauthorized", async () => {
      const res = await request(app)
        .post("/api/ingest/stream/test-task-123")

      expect(res.status).toBe(401)
    })
  })

  describe("B-03: GET /stream/:taskId (old method)", () => {
    it("returns 405 Method Not Allowed", async () => {
      const res = await request(app)
        .get("/api/ingest/stream/test-task-123")
        .set("Authorization", "Bearer valid-jwt-token")

      expect(res.status).toBe(405)
    })
  })

  describe("B-04: POST /stream/:taskId with token in URL query", () => {
    it("rejects token in URL (no auth header provided → 401)", async () => {
      const res = await request(app)
        .post("/api/ingest/stream/test-task-123?token=some-jwt-token")
      // No Authorization header → should be rejected even if token is in URL
      expect(res.status).toBe(401)
    })
  })

  describe("B-05: POST /stream/:taskId with invalid JWT", () => {
    it("returns 401 for invalid token", async () => {
      const res = await request(app)
        .post("/api/ingest/stream/test-task-123")
        .set("Authorization", "Bearer invalid-token")

      expect(res.status).toBe(401)
    })
  })
})
