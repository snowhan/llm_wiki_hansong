/**
 * TDD tests for project-service path validation.
 * fs/promises and state-service are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../services/state-service.js", () => ({
  getState: vi.fn(),
  setState: vi.fn(),
}))

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn(),
    readdir: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock("../../config.js", () => ({
  config: {
    projectsRoot: "/data/projects",
    appStatePath: "/data/state/app-state.json",
  },
}))

import fs from "node:fs/promises"
import * as stateService from "../../services/state-service.js"
import {
  createProject,
  openProject,
} from "../project-service.js"

beforeEach(() => {
  vi.clearAllMocks()
  // Default: registry is empty
  vi.mocked(stateService.getState).mockResolvedValue({})
  vi.mocked(stateService.setState).mockResolvedValue(undefined)
})

// ── createProject path validation ─────────────────────────────────────────────

describe("createProject", () => {
  it("creates a project under projectsRoot when no parentPath given", async () => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined)
    const project = await createProject("wiki")
    expect(project.name).toBe("wiki")
    // stat is not called (no marker check on create), mkdir is called
    expect(fs.mkdir).toHaveBeenCalled()
  })

  it("allows parentPath that is inside projectsRoot", async () => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined)
    const project = await createProject("wiki", "/data/projects/subdir")
    expect(project.name).toBe("wiki")
  })

  it("throws when parentPath is outside projectsRoot", async () => {
    await expect(
      createProject("wiki", "/data/outside"),
    ).rejects.toThrow(/PROJECTS_ROOT/)
  })

  it("throws when parentPath is a path traversal attempt", async () => {
    await expect(
      createProject("wiki", "/data/projects/../outside"),
    ).rejects.toThrow(/PROJECTS_ROOT/)
  })
})

// ── openProject path validation ───────────────────────────────────────────────

describe("openProject", () => {
  it("opens a project inside projectsRoot", async () => {
    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any)
    const project = await openProject("/data/projects/wiki")
    expect(project.name).toBe("wiki")
  })

  it("throws when path is outside projectsRoot", async () => {
    await expect(
      openProject("/data/outside/wiki"),
    ).rejects.toThrow(/PROJECTS_ROOT/)
  })

  it("throws when path is exactly projectsRoot (no project name)", async () => {
    await expect(
      openProject("/data/projects"),
    ).rejects.toThrow(/PROJECTS_ROOT/)
  })

  it("throws when path uses traversal to escape projectsRoot", async () => {
    await expect(
      openProject("/data/projects/../outside"),
    ).rejects.toThrow(/PROJECTS_ROOT/)
  })
})
