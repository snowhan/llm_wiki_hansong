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

vi.mock("@/lib/api-client", () => ({
  apiGet: vi.fn((url: string) => {
    const key = url.split("/api/state/")[1]
    return Promise.resolve(storeData.get(key) ?? null)
  }),
  apiPut: vi.fn((_url: string, body: { value: unknown }) => {
    const key = _url.split("/api/state/")[1]
    storeData.set(key, body.value)
    return Promise.resolve()
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
    const projects = [{ id: "uuid-1", name: "P1", path: "/p1" }]
    storeData.set("recentProjects", projects)
    const result = await getRecentProjects()
    expect(result).toEqual(projects)
  })

  it("filters out legacy entries without id", async () => {
    const projects = [{ name: "Legacy", path: "/legacy" }]
    storeData.set("recentProjects", projects)
    const result = await getRecentProjects()
    expect(result).toEqual([])
  })
})

describe("getLastProject", () => {
  it("returns null when no data", async () => {
    const result = await getLastProject()
    expect(result).toBeNull()
  })

  it("returns stored project", async () => {
    const proj = { id: "uuid-1", name: "Test", path: "/test" }
    storeData.set("lastProject", proj)
    const result = await getLastProject()
    expect(result).toEqual(proj)
  })

  it("returns null for legacy project without id", async () => {
    storeData.set("lastProject", { name: "Legacy", path: "/test" })
    const result = await getLastProject()
    expect(result).toBeNull()
  })
})

describe("saveLastProject", () => {
  it("stores the project and adds to recent", async () => {
    await saveLastProject({ id: "uuid-new", name: "New" })
    expect(storeData.get("lastProject")).toEqual({ id: "uuid-new", name: "New" })
    const recent = storeData.get("recentProjects") as Array<{ id: string }>
    expect(recent).toBeDefined()
    expect(recent[0].id).toBe("uuid-new")
  })
})

describe("addToRecentProjects", () => {
  it("adds project to front", async () => {
    storeData.set("recentProjects", [{ id: "uuid-old", name: "Old" }])
    await addToRecentProjects({ id: "uuid-new", name: "New" })
    const recent = storeData.get("recentProjects") as Array<{ id: string }>
    expect(recent[0].id).toBe("uuid-new")
  })

  it("deduplicates by id", async () => {
    storeData.set("recentProjects", [{ id: "uuid-p", name: "P" }])
    await addToRecentProjects({ id: "uuid-p", name: "P-updated" })
    const recent = storeData.get("recentProjects") as Array<{ name: string }>
    expect(recent).toHaveLength(1)
    expect(recent[0].name).toBe("P-updated")
  })

  it("limits to 10 entries", async () => {
    const existing = Array.from({ length: 10 }, (_, i) => ({
      id: `uuid-${i}`,
      name: `P${i}`,
    }))
    storeData.set("recentProjects", existing)
    await addToRecentProjects({ id: "uuid-new", name: "New" })
    const recent = storeData.get("recentProjects") as Array<{ id: string }>
    expect(recent.length).toBeLessThanOrEqual(10)
    expect(recent[0].id).toBe("uuid-new")
  })
})

describe("removeFromRecentProjects", () => {
  it("removes project by id", async () => {
    storeData.set("recentProjects", [
      { id: "uuid-a", name: "A" },
      { id: "uuid-b", name: "B" },
    ])
    await removeFromRecentProjects("uuid-a")
    const recent = storeData.get("recentProjects") as Array<{ id: string }>
    expect(recent).toHaveLength(1)
    expect(recent[0].id).toBe("uuid-b")
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
