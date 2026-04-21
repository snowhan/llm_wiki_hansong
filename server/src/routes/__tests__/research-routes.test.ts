/**
 * TDD tests for /api/research/* routes using supertest.
 * research-service and auth middleware are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"
import type { Request, Response, NextFunction } from "express"

// ── Mock auth-guards (bypass auth for most tests) ────────────────────────────
vi.mock("../../middleware/auth-guards.js", () => ({
  requireMember: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    req.user = { sub: "user-001", role: "member", username: "alice" }
    next()
  }),
}))

// ── Mock research-service ────────────────────────────────────────────────────
vi.mock("../../services/research-service.js", () => ({
  startResearchTask: vi.fn().mockReturnValue("task-001"),
  getResearchTask: vi.fn(),
  getAllResearchTasks: vi.fn().mockReturnValue([]),
  registerResearchSseClient: vi.fn(),
  unregisterResearchSseClient: vi.fn(),
  cancelResearchTask: vi.fn(),
}))

import * as researchService from "../../services/research-service.js"
import researchRouter from "../research.js"

const MOCK_TASK = {
  id: "task-001",
  projectId: "proj-001",
  topic: "Test Topic",
  searchQueries: [],
  status: "searching" as const,
  webResults: [],
  synthesis: "",
  savedPath: null,
  error: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use("/api/research", researchRouter)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/research/start", () => {
  it("returns 200 with taskId on valid request", async () => {
    vi.mocked(researchService.startResearchTask).mockReturnValue("task-001")

    const res = await request(buildApp())
      .post("/api/research/start")
      .send({ projectId: "proj-001", topic: "AI Safety" })

    expect(res.status).toBe(200)
    expect(res.body.taskId).toBe("task-001")
    expect(researchService.startResearchTask).toHaveBeenCalledWith(
      "proj-001",
      "AI Safety",
      undefined,
    )
  })

  it("passes searchQueries when provided", async () => {
    await request(buildApp())
      .post("/api/research/start")
      .send({ projectId: "proj-001", topic: "AI", searchQueries: ["q1", "q2"] })

    expect(researchService.startResearchTask).toHaveBeenCalledWith(
      "proj-001",
      "AI",
      ["q1", "q2"],
    )
  })

  it("returns 400 when projectId is missing", async () => {
    const res = await request(buildApp())
      .post("/api/research/start")
      .send({ topic: "AI Safety" })

    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it("returns 400 when topic is missing", async () => {
    const res = await request(buildApp())
      .post("/api/research/start")
      .send({ projectId: "proj-001" })

    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/research/status/:taskId", () => {
  it("returns task when found", async () => {
    vi.mocked(researchService.getResearchTask).mockReturnValue(MOCK_TASK)

    const res = await request(buildApp()).get("/api/research/status/task-001")

    expect(res.status).toBe(200)
    expect(res.body.task.id).toBe("task-001")
    expect(res.body.task.topic).toBe("Test Topic")
  })

  it("returns 404 when task not found", async () => {
    vi.mocked(researchService.getResearchTask).mockReturnValue(undefined)

    const res = await request(buildApp()).get("/api/research/status/unknown-id")

    expect(res.status).toBe(404)
    expect(res.body.error).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/research/tasks", () => {
  it("returns all tasks when no projectId filter", async () => {
    vi.mocked(researchService.getAllResearchTasks).mockReturnValue([MOCK_TASK])

    const res = await request(buildApp()).get("/api/research/tasks")

    expect(res.status).toBe(200)
    expect(res.body.tasks).toHaveLength(1)
    expect(researchService.getAllResearchTasks).toHaveBeenCalledWith(undefined)
  })

  it("filters by projectId when provided as query param", async () => {
    vi.mocked(researchService.getAllResearchTasks).mockReturnValue([MOCK_TASK])

    await request(buildApp()).get("/api/research/tasks?projectId=proj-001")

    expect(researchService.getAllResearchTasks).toHaveBeenCalledWith("proj-001")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("DELETE /api/research/tasks/:taskId", () => {
  it("calls cancelResearchTask and returns 200", async () => {
    vi.mocked(researchService.getResearchTask).mockReturnValue(MOCK_TASK)

    const res = await request(buildApp()).delete("/api/research/tasks/task-001")

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(researchService.cancelResearchTask).toHaveBeenCalledWith("task-001")
  })

  it("returns 404 when task not found", async () => {
    vi.mocked(researchService.getResearchTask).mockReturnValue(undefined)

    const res = await request(buildApp()).delete("/api/research/tasks/unknown-id")

    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/research/stream/:taskId — SSE endpoint", () => {
  it("returns 404 for unknown taskId", async () => {
    vi.mocked(researchService.getResearchTask).mockReturnValue(undefined)

    const res = await request(buildApp())
      .get("/api/research/stream/unknown-id")
      .set("Accept", "text/event-stream")

    expect(res.status).toBe(200) // SSE starts with 200
    expect(res.text).toContain('"type":"error"')
  })

  it("sets SSE headers for known task", async () => {
    vi.mocked(researchService.getResearchTask).mockReturnValue({
      ...MOCK_TASK,
      status: "done",
    })

    const res = await request(buildApp())
      .get("/api/research/stream/task-001")
      .set("Accept", "text/event-stream")

    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toContain("text/event-stream")
  })
})
