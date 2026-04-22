import { describe, it, expect, vi } from "vitest"
import { buildCommands, filterCommands, fuzzyMatch } from "../commands"

// ── T-011: buildCommands dynamic file commands ────────────────────────────────

describe("buildCommands file group - T-011", () => {
  const baseStore = {
    setActiveView: vi.fn(),
    setColorScheme: vi.fn(),
    navigateInCurrentTab: vi.fn(),
  }

  it("produces no file commands when no tabs are open", () => {
    const cmds = buildCommands({ ...baseStore, openTabs: [] })
    const fileCmds = cmds.filter((c) => c.group === "file")
    expect(fileCmds).toHaveLength(0)
  })

  it("T-011: produces one file command per open tab", () => {
    const cmds = buildCommands({
      ...baseStore,
      openTabs: [
        { id: "tab1", path: "wiki/concepts/foo.md", title: "Foo Concept" },
        { id: "tab2", path: "wiki/entities/bar.md", title: "Bar Entity" },
      ],
    })
    const fileCmds = cmds.filter((c) => c.group === "file")
    expect(fileCmds).toHaveLength(2)
    expect(fileCmds[0].label).toBe("Foo Concept")
    expect(fileCmds[1].label).toBe("Bar Entity")
  })

  it("T-011: clicking a file command calls navigateInCurrentTab", () => {
    const navigate = vi.fn()
    const cmds = buildCommands({
      ...baseStore,
      navigateInCurrentTab: navigate,
      openTabs: [
        { id: "tab1", path: "wiki/concepts/foo.md", title: "Foo Concept" },
      ],
    })
    const fileCmd = cmds.find((c) => c.group === "file")!
    fileCmd.action()
    expect(navigate).toHaveBeenCalledWith("wiki/concepts/foo.md", "Foo Concept")
  })

  it("T-011: file commands appear before navigate/theme in the list", () => {
    const cmds = buildCommands({
      ...baseStore,
      openTabs: [{ id: "tab1", path: "wiki/concepts/foo.md", title: "Foo Concept" }],
    })
    const firstCmd = cmds[0]
    expect(firstCmd.group).toBe("file")
  })

  it("T-011: file command description is the full path", () => {
    const cmds = buildCommands({
      ...baseStore,
      openTabs: [{ id: "t", path: "wiki/sources/doc.md", title: "My Doc" }],
    })
    const fileCmd = cmds.find((c) => c.group === "file")!
    expect(fileCmd.description).toBe("wiki/sources/doc.md")
  })

  it("T-011: tab with no title falls back to filename stem", () => {
    const cmds = buildCommands({
      ...baseStore,
      openTabs: [{ id: "t", path: "wiki/concepts/my-page.md", title: "" }],
    })
    const fileCmd = cmds.find((c) => c.group === "file")!
    expect(fileCmd.label).toBe("my-page")
  })
})

// ── fuzzyMatch ────────────────────────────────────────────────────────────────
describe("fuzzyMatch", () => {
  it("returns true for empty query", () => {
    expect(fuzzyMatch("", "anything")).toBe(true)
  })

  it("matches substring", () => {
    expect(fuzzyMatch("wiki", "打开 Wiki 文档")).toBe(true)
  })

  it("fuzzy matches non-contiguous chars", () => {
    expect(fuzzyMatch("wk", "Wiki")).toBe(true)
  })

  it("returns false for non-matching", () => {
    expect(fuzzyMatch("zzz", "打开搜索")).toBe(false)
  })
})

// ── filterCommands ────────────────────────────────────────────────────────────
describe("filterCommands", () => {
  const cmds = buildCommands({
    setActiveView: vi.fn(),
    setColorScheme: vi.fn(),
    openTabs: [],
    navigateInCurrentTab: vi.fn(),
  })

  it("returns all commands for empty query", () => {
    expect(filterCommands(cmds, "")).toHaveLength(cmds.length)
  })

  it("filters by label", () => {
    const results = filterCommands(cmds, "设置")
    expect(results.length).toBeGreaterThan(0)
    results.forEach((c) => {
      const text = [c.label, c.description ?? "", ...(c.keywords ?? [])].join(" ")
      expect(fuzzyMatch("设置", text)).toBe(true)
    })
  })
})
