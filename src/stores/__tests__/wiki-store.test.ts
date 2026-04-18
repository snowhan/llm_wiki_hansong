import { describe, it, expect, beforeEach } from "vitest"
import { useWikiStore, isNewTab, NEW_TAB_PREFIX } from "../wiki-store"

const RESET_STATE = {
  project: null,
  fileTree: [],
  selectedFile: null,
  fileContent: "",
  chatExpanded: false,
  activeView: "wiki" as const,
  dataVersion: 0,
  openTabs: [],
  activeTabId: null,
  activeTabPath: null,
  ingestingPath: null,
  ingestStatuses: {} as Record<string, "idle" | "ingesting" | "interrupted" | "done" | "error">,
  serverTaskIds: {} as Record<string, string>,
  llmConfig: {
    provider: "openai" as const,
    apiKey: "",
    model: "",
    ollamaUrl: "http://localhost:11434",
    customEndpoint: "",
    maxContextSize: 204800,
  },
  searchApiConfig: { provider: "none" as const, apiKey: "" },
  embeddingConfig: { enabled: false, endpoint: "", apiKey: "", model: "" },
}

beforeEach(() => {
  useWikiStore.setState(RESET_STATE)
})

// ── helpers ──────────────────────────────────────────────────────────────

function openTestTab(path = "/proj/wiki/page.md", title = "page.md") {
  useWikiStore.getState().openTab(path, title)
  return useWikiStore.getState().openTabs.find((t) => t.path === path)!
}

// ── core setters ─────────────────────────────────────────────────────────

describe("useWikiStore — core setters", () => {
  it("has correct initial state", () => {
    const s = useWikiStore.getState()
    expect(s.project).toBeNull()
    expect(s.fileTree).toEqual([])
    expect(s.activeView).toBe("wiki")
    expect(s.dataVersion).toBe(0)
    expect(s.openTabs).toEqual([])
    expect(s.ingestStatuses).toEqual({})
    expect(s.serverTaskIds).toEqual({})
  })

  it("setProject updates project", () => {
    useWikiStore.getState().setProject({ id: "test-uuid", name: "Test" })
    expect(useWikiStore.getState().project).toEqual({ id: "test-uuid", name: "Test" })
  })

  it("setProject can clear to null", () => {
    useWikiStore.getState().setProject({ id: "t-uuid", name: "T" })
    useWikiStore.getState().setProject(null)
    expect(useWikiStore.getState().project).toBeNull()
  })

  it("setProject resets all tab state", () => {
    openTestTab("/proj/a.md")
    openTestTab("/proj/b.md")
    expect(useWikiStore.getState().openTabs).toHaveLength(2)
    useWikiStore.getState().setProject({ id: "new-uuid", name: "New" })
    const s = useWikiStore.getState()
    expect(s.openTabs).toEqual([])
    expect(s.activeTabId).toBeNull()
    expect(s.activeTabPath).toBeNull()
  })

  it("setProject resets ingest state", () => {
    useWikiStore.getState().setIngestStatus("/proj/src/a.pdf", "ingesting")
    useWikiStore.getState().setIngestingPath("/proj/src/a.pdf")
    useWikiStore.getState().setServerTaskId("/proj/src/a.pdf", "task-123")
    useWikiStore.getState().setProject({ id: "new-uuid", name: "New" })
    const s = useWikiStore.getState()
    expect(s.ingestingPath).toBeNull()
    expect(s.ingestStatuses).toEqual({})
    expect(s.serverTaskIds).toEqual({})
  })

  it("bumpDataVersion increments by 1", () => {
    expect(useWikiStore.getState().dataVersion).toBe(0)
    useWikiStore.getState().bumpDataVersion()
    useWikiStore.getState().bumpDataVersion()
    expect(useWikiStore.getState().dataVersion).toBe(2)
  })
})

// ── isNewTab helper ───────────────────────────────────────────────────────

describe("isNewTab", () => {
  it("returns true for paths with NEW_TAB_PREFIX", () => {
    expect(isNewTab(`${NEW_TAB_PREFIX}abc`)).toBe(true)
  })

  it("returns false for real file paths", () => {
    expect(isNewTab("/wiki/page.md")).toBe(false)
    expect(isNewTab("page.md")).toBe(false)
    expect(isNewTab("")).toBe(false)
  })
})

// ── tab management ───────────────────────────────────────────────────────

describe("Tab management", () => {
  describe("openTab", () => {
    it("creates a tab and sets it active", () => {
      useWikiStore.getState().openTab("/wiki/a.md", "a.md")
      const s = useWikiStore.getState()
      expect(s.openTabs).toHaveLength(1)
      expect(s.openTabs[0].path).toBe("/wiki/a.md")
      expect(s.activeTabId).toBe(s.openTabs[0].id)
      expect(s.activeTabPath).toBe("/wiki/a.md")
    })

    it("opening same path twice does not duplicate tabs", () => {
      useWikiStore.getState().openTab("/wiki/a.md", "a.md")
      useWikiStore.getState().openTab("/wiki/a.md", "a.md")
      expect(useWikiStore.getState().openTabs).toHaveLength(1)
    })

    it("can open multiple different paths", () => {
      useWikiStore.getState().openTab("/wiki/a.md")
      useWikiStore.getState().openTab("/wiki/b.md")
      expect(useWikiStore.getState().openTabs).toHaveLength(2)
    })

    it("latest opened tab becomes active", () => {
      useWikiStore.getState().openTab("/wiki/a.md")
      useWikiStore.getState().openTab("/wiki/b.md")
      expect(useWikiStore.getState().activeTabPath).toBe("/wiki/b.md")
    })
  })

  describe("closeTab", () => {
    it("removes the tab from openTabs", () => {
      const tab = openTestTab("/wiki/a.md")
      useWikiStore.getState().closeTab(tab.id)
      expect(useWikiStore.getState().openTabs).toHaveLength(0)
    })

    it("activates the previous tab after closing the active one", () => {
      useWikiStore.getState().openTab("/wiki/a.md")
      useWikiStore.getState().openTab("/wiki/b.md")
      const tabs = useWikiStore.getState().openTabs
      const bTab = tabs.find((t) => t.path === "/wiki/b.md")!
      useWikiStore.getState().closeTab(bTab.id)
      expect(useWikiStore.getState().activeTabPath).toBe("/wiki/a.md")
    })

    it("clears activeTabId when last tab is closed", () => {
      const tab = openTestTab()
      useWikiStore.getState().closeTab(tab.id)
      expect(useWikiStore.getState().activeTabId).toBeNull()
      expect(useWikiStore.getState().activeTabPath).toBeNull()
    })

    it("ignores unknown tabId", () => {
      openTestTab()
      useWikiStore.getState().closeTab("nonexistent-id")
      expect(useWikiStore.getState().openTabs).toHaveLength(1)
    })
  })

  describe("setActiveTab", () => {
    it("switches to an existing tab by id", () => {
      useWikiStore.getState().openTab("/wiki/a.md")
      useWikiStore.getState().openTab("/wiki/b.md")
      const aTab = useWikiStore.getState().openTabs.find((t) => t.path === "/wiki/a.md")!
      useWikiStore.getState().setActiveTab(aTab.id)
      expect(useWikiStore.getState().activeTabPath).toBe("/wiki/a.md")
    })
  })

  describe("openNewTab", () => {
    it("creates a blank placeholder tab", () => {
      useWikiStore.getState().openNewTab()
      const s = useWikiStore.getState()
      expect(s.openTabs).toHaveLength(1)
      expect(isNewTab(s.openTabs[0].path)).toBe(true)
    })

    it("activeTabPath is null for a new blank tab", () => {
      useWikiStore.getState().openNewTab()
      expect(useWikiStore.getState().activeTabPath).toBeNull()
    })

    it("each openNewTab creates a distinct placeholder", () => {
      useWikiStore.getState().openNewTab()
      useWikiStore.getState().openNewTab()
      const paths = useWikiStore.getState().openTabs.map((t) => t.path)
      expect(new Set(paths).size).toBe(2)
    })
  })

  describe("navigateInCurrentTab", () => {
    it("creates the first tab if none exist", () => {
      useWikiStore.getState().navigateInCurrentTab("/wiki/a.md")
      const s = useWikiStore.getState()
      expect(s.openTabs).toHaveLength(1)
      expect(s.activeTabPath).toBe("/wiki/a.md")
    })

    it("updates the current tab's path", () => {
      openTestTab("/wiki/a.md")
      useWikiStore.getState().navigateInCurrentTab("/wiki/b.md")
      const s = useWikiStore.getState()
      expect(s.openTabs).toHaveLength(1)
      expect(s.activeTabPath).toBe("/wiki/b.md")
    })

    it("switches to existing tab if file is already open", () => {
      useWikiStore.getState().openTab("/wiki/a.md")
      useWikiStore.getState().openTab("/wiki/b.md")
      // Navigate to a.md while b.md is active → should switch to existing a tab, not create duplicate
      useWikiStore.getState().navigateInCurrentTab("/wiki/a.md")
      const s = useWikiStore.getState()
      expect(s.openTabs).toHaveLength(2) // no new tab added
      expect(s.activeTabPath).toBe("/wiki/a.md")
    })
  })
})

// ── ingest state ─────────────────────────────────────────────────────────

describe("Ingest state", () => {
  const FILE = "/proj/src/report.pdf"

  describe("setIngestStatus", () => {
    it("sets and retrieves status", () => {
      useWikiStore.getState().setIngestStatus(FILE, "ingesting")
      expect(useWikiStore.getState().ingestStatuses[FILE]).toBe("ingesting")
    })

    it("transitions through the full lifecycle", () => {
      const statuses = ["idle", "ingesting", "done", "error", "interrupted"] as const
      for (const s of statuses) {
        useWikiStore.getState().setIngestStatus(FILE, s)
        expect(useWikiStore.getState().ingestStatuses[FILE]).toBe(s)
      }
    })

    it("tracks multiple files independently", () => {
      const A = "/proj/src/a.pdf"
      const B = "/proj/src/b.docx"
      useWikiStore.getState().setIngestStatus(A, "ingesting")
      useWikiStore.getState().setIngestStatus(B, "done")
      expect(useWikiStore.getState().ingestStatuses[A]).toBe("ingesting")
      expect(useWikiStore.getState().ingestStatuses[B]).toBe("done")
    })
  })

  describe("setIngestingPath", () => {
    it("sets the currently ingesting path", () => {
      useWikiStore.getState().setIngestingPath(FILE)
      expect(useWikiStore.getState().ingestingPath).toBe(FILE)
    })

    it("can be cleared to null", () => {
      useWikiStore.getState().setIngestingPath(FILE)
      useWikiStore.getState().setIngestingPath(null)
      expect(useWikiStore.getState().ingestingPath).toBeNull()
    })
  })

  describe("setServerTaskId", () => {
    it("stores a task id for a path", () => {
      useWikiStore.getState().setServerTaskId(FILE, "task-abc")
      expect(useWikiStore.getState().serverTaskIds[FILE]).toBe("task-abc")
    })

    it("can be cleared to null (removes the entry)", () => {
      useWikiStore.getState().setServerTaskId(FILE, "task-abc")
      useWikiStore.getState().setServerTaskId(FILE, null)
      expect(useWikiStore.getState().serverTaskIds[FILE]).toBeUndefined()
    })

    it("tracks multiple files independently", () => {
      useWikiStore.getState().setServerTaskId("/a.pdf", "t1")
      useWikiStore.getState().setServerTaskId("/b.docx", "t2")
      expect(useWikiStore.getState().serverTaskIds["/a.pdf"]).toBe("t1")
      expect(useWikiStore.getState().serverTaskIds["/b.docx"]).toBe("t2")
    })
  })
})
