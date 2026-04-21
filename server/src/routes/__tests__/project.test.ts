/**
 * TDD tests for /api/project route.
 * project-service and config are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../../services/project-service.js", () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  openProject: vi.fn(),
}))

vi.mock("../../services/fs-service.js", () => ({
  browsePath: vi.fn(),
}))

vi.mock("../../config.js", () => ({
  config: {
    projectsRoot: "/data/projects",
    jwtSecret: "test-secret-at-least-32-characters-long!!",
    jwtAccessExpiresIn: "15m",
    jwtRefreshExpiresInDays: 30,
    bcryptRounds: 4,
  },
}))

vi.mock("../../lib/auth-utils.js", () => ({
  verifyAccessToken: vi.fn(),
}))

import * as projectService from "../../services/project-service.js"
import * as fsService from "../../services/fs-service.js"
import projectRouter from "../project.js"

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use("/api/project", projectRouter)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── GET /api/project/root ─────────────────────────────────────────────────────

describe("GET /api/project/root", () => {
  it("returns the configured projectsRoot", async () => {
    const app = buildApp()
    const res = await request(app).get("/api/project/root")

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ projectsRoot: "/data/projects" })
  })
})

// ── GET /api/project/list ─────────────────────────────────────────────────────

describe("GET /api/project/list", () => {
  it("returns the project list from service", async () => {
    vi.mocked(projectService.listProjects).mockResolvedValue([
      { id: "abc", name: "my-wiki" },
    ])
    const app = buildApp()
    const res = await request(app).get("/api/project/list")

    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: "abc", name: "my-wiki" }])
  })
})

// ── POST /api/project/create ──────────────────────────────────────────────────

describe("POST /api/project/create", () => {
  it("creates a project and returns it", async () => {
    vi.mocked(projectService.createProject).mockResolvedValue({ id: "abc", name: "wiki" })
    const app = buildApp()
    const res = await request(app)
      .post("/api/project/create")
      .send({ name: "wiki", parentPath: "/data/projects" })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: "abc", name: "wiki" })
    expect(projectService.createProject).toHaveBeenCalledWith("wiki", "/data/projects")
  })

  it("returns 400 when name is missing", async () => {
    const app = buildApp()
    const res = await request(app)
      .post("/api/project/create")
      .send({ parentPath: "/data/projects" })

    expect(res.status).toBe(400)
  })

  it("propagates service errors as 500", async () => {
    vi.mocked(projectService.createProject).mockRejectedValue(
      new Error("path outside PROJECTS_ROOT"),
    )
    const app = buildApp()
    const res = await request(app)
      .post("/api/project/create")
      .send({ name: "wiki", parentPath: "/data/outside" })

    expect(res.status).toBe(500)
  })
})

// ── POST /api/project/open ────────────────────────────────────────────────────

describe("POST /api/project/open", () => {
  it("opens a project at the given path", async () => {
    vi.mocked(projectService.openProject).mockResolvedValue({ id: "abc", name: "wiki" })
    const app = buildApp()
    const res = await request(app)
      .post("/api/project/open")
      .send({ path: "/data/projects/wiki" })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: "abc", name: "wiki" })
  })

  it("propagates validation errors from service as 500", async () => {
    vi.mocked(projectService.openProject).mockRejectedValue(
      new Error("Project path must be inside PROJECTS_ROOT"),
    )
    const app = buildApp()
    const res = await request(app)
      .post("/api/project/open")
      .send({ path: "/data/outside" })

    expect(res.status).toBe(500)
  })
})
