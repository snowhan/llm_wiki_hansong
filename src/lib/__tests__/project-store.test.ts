import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  getRecentProjects,
  getLastProject,
  saveLastProject,
  addToRecentProjects,
  removeFromRecentProjects,
  saveLlmConfig,
  loadLlmConfig,
  saveSearchApiConfig,
  loadSearchApiConfig,
  saveLanguage,
  loadLanguage,
} from "../project-store"

const storeData = new Map<string, unknown>()

vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn().mockResolvedValue({
    get: vi.fn((key: string) => Promise.resolve(storeData.get(key))),
    set: vi.fn((key: string, value: unknown) => {
      storeData.set(key, value)
      return Promise.resolve()
    }),
  }),
}))

beforeEach(() => {
  storeData.clear()
})

describe("getRecentProjects", () => {
  it("returns empty array when no data", async () => {
    const result = await getRecentProjects()
    expect(result).toEqual([])
  })

  it("returns stored projects", async () => {
    const projects = [{ name: "P1", path: "/p1" }]
    storeData.set("recentProjects", projects)
    const result = await getRecentProjects()
    expect(result).toEqual(projects)
  })
})

describe("getLastProject", () => {
  it("returns null when no data", async () => {
    const result = await getLastProject()
    expect(result).toBeNull()
  })

  it("returns stored project", async () => {
    const proj = { name: "Test", path: "/test" }
    storeData.set("lastProject", proj)
    const result = await getLastProject()
    expect(result).toEqual(proj)
  })
})

describe("saveLastProject", () => {
  it("stores the project and adds to recent", async () => {
    await saveLastProject({ name: "New", path: "/new" })
    expect(storeData.get("lastProject")).toEqual({ name: "New", path: "/new" })
    const recent = storeData.get("recentProjects") as Array<{ path: string }>
    expect(recent).toBeDefined()
    expect(recent[0].path).toBe("/new")
  })
})

describe("addToRecentProjects", () => {
  it("adds project to front", async () => {
    storeData.set("recentProjects", [{ name: "Old", path: "/old" }])
    await addToRecentProjects({ name: "New", path: "/new" })
    const recent = storeData.get("recentProjects") as Array<{ path: string }>
    expect(recent[0].path).toBe("/new")
  })

  it("deduplicates by path", async () => {
    storeData.set("recentProjects", [{ name: "P", path: "/p" }])
    await addToRecentProjects({ name: "P2", path: "/p" })
    const recent = storeData.get("recentProjects") as Array<{ name: string; path: string }>
    expect(recent).toHaveLength(1)
    expect(recent[0].name).toBe("P2")
  })

  it("limits to 10 entries", async () => {
    const existing = Array.from({ length: 10 }, (_, i) => ({
      name: `P${i}`,
      path: `/p${i}`,
    }))
    storeData.set("recentProjects", existing)
    await addToRecentProjects({ name: "New", path: "/new" })
    const recent = storeData.get("recentProjects") as Array<{ path: string }>
    expect(recent.length).toBeLessThanOrEqual(10)
    expect(recent[0].path).toBe("/new")
  })
})

describe("removeFromRecentProjects", () => {
  it("removes project by path", async () => {
    storeData.set("recentProjects", [
      { name: "A", path: "/a" },
      { name: "B", path: "/b" },
    ])
    await removeFromRecentProjects("/a")
    const recent = storeData.get("recentProjects") as Array<{ path: string }>
    expect(recent).toHaveLength(1)
    expect(recent[0].path).toBe("/b")
  })
})

describe("LLM config persistence", () => {
  it("saves and loads config", async () => {
    const config = {
      provider: "openai" as const,
      apiKey: "key",
      model: "gpt-4",
      ollamaUrl: "",
      customEndpoint: "",
      maxContextSize: 128000,
    }
    await saveLlmConfig(config)
    const loaded = await loadLlmConfig()
    expect(loaded).toEqual(config)
  })

  it("returns null when no config saved", async () => {
    const loaded = await loadLlmConfig()
    expect(loaded).toBeNull()
  })
})

describe("Search API config persistence", () => {
  it("saves and loads", async () => {
    const config = { provider: "tavily" as const, apiKey: "tav-key" }
    await saveSearchApiConfig(config)
    const loaded = await loadSearchApiConfig()
    expect(loaded).toEqual(config)
  })
})

describe("Language persistence", () => {
  it("saves and loads language", async () => {
    await saveLanguage("zh")
    const loaded = await loadLanguage()
    expect(loaded).toBe("zh")
  })

  it("returns null when no language saved", async () => {
    const loaded = await loadLanguage()
    expect(loaded).toBeNull()
  })
})
