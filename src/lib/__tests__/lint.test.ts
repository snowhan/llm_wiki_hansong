import { describe, it, expect, vi, beforeEach } from "vitest"
import { runStructuralLint, runSemanticLint } from "../lint"
import { readFile, listDirectory } from "@/commands/fs"
import { useActivityStore } from "@/stores/activity-store"
import type { FileNode } from "@/types/wiki"

vi.mock("@/lib/llm-client", () => ({
  streamChat: vi.fn(),
}))

const { streamChat } = await import("@/lib/llm-client")

function makeTree(files: { name: string; relativePath: string }[]): FileNode[] {
  return files.map((f) => ({ name: f.name, relativePath: f.relativePath, is_dir: false, children: [] }))
}

describe("runStructuralLint", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns empty for unreadable wiki directory", async () => {
    vi.mocked(listDirectory).mockRejectedValue(new Error("not found"))
    const results = await runStructuralLint("proj-uuid")
    expect(results).toEqual([])
  })

  it("detects orphan pages (no inbound links)", async () => {
    vi.mocked(listDirectory).mockResolvedValue(makeTree([
      { name: "a.md", relativePath: "wiki/entities/a.md" },
      { name: "b.md", relativePath: "wiki/entities/b.md" },
    ]))
    vi.mocked(readFile)
      .mockResolvedValueOnce("---\ntitle: A\n---\nText about [[b]]")
      .mockResolvedValueOnce("---\ntitle: B\n---\nText with no links")

    const results = await runStructuralLint("proj-uuid")
    const orphans = results.filter((r) => r.type === "orphan")
    expect(orphans.some((r) => r.page.includes("a"))).toBe(true)
  })

  it("detects broken links", async () => {
    vi.mocked(listDirectory).mockResolvedValue(makeTree([
      { name: "a.md", relativePath: "wiki/entities/a.md" },
    ]))
    vi.mocked(readFile).mockResolvedValue("---\ntitle: A\n---\nSee [[nonexistent-page]]")

    const results = await runStructuralLint("proj-uuid")
    expect(results.some((r) => r.type === "broken-link")).toBe(true)
  })

  it("detects pages with no outbound links", async () => {
    vi.mocked(listDirectory).mockResolvedValue(makeTree([
      { name: "lonely.md", relativePath: "wiki/entities/lonely.md" },
    ]))
    vi.mocked(readFile).mockResolvedValue("---\ntitle: Lonely\n---\nJust text, no links.")

    const results = await runStructuralLint("proj-uuid")
    expect(results.some((r) => r.type === "no-outlinks")).toBe(true)
  })

  it("excludes index.md and log.md from orphan checks", async () => {
    vi.mocked(listDirectory).mockResolvedValue(makeTree([
      { name: "index.md", relativePath: "wiki/index.md" },
      { name: "log.md", relativePath: "wiki/log.md" },
    ]))

    const results = await runStructuralLint("proj-uuid")
    expect(results).toEqual([])
  })

  it("handles valid cross-linked pages with no issues", async () => {
    vi.mocked(listDirectory).mockResolvedValue(makeTree([
      { name: "a.md", relativePath: "wiki/entities/a.md" },
      { name: "b.md", relativePath: "wiki/entities/b.md" },
    ]))
    vi.mocked(readFile)
      .mockResolvedValueOnce("---\ntitle: A\n---\nSee [[b]]")
      .mockResolvedValueOnce("---\ntitle: B\n---\nSee [[a]]")

    const results = await runStructuralLint("proj-uuid")
    expect(results.filter((r) => r.type === "orphan")).toHaveLength(0)
    expect(results.filter((r) => r.type === "broken-link")).toHaveLength(0)
  })
})

describe("runSemanticLint", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useActivityStore.getState().items = []
  })

  it("returns empty when wiki is unreadable", async () => {
    vi.mocked(listDirectory).mockRejectedValue(new Error("nope"))
    const results = await runSemanticLint("proj-uuid")
    expect(results).toEqual([])
  })

  it("parses LINT blocks from LLM output", async () => {
    vi.mocked(listDirectory).mockResolvedValue(makeTree([
      { name: "a.md", relativePath: "wiki/entities/a.md" },
    ]))
    vi.mocked(readFile).mockResolvedValue("---\ntitle: A\n---\nSome content")

    vi.mocked(streamChat).mockImplementation(async (_m, cb) => {
      cb.onToken("---LINT: contradiction | warning | Data conflict---\nPages disagree on dates.\nPAGES: a.md, b.md\n---END LINT---")
      cb.onDone()
    })

    const results = await runSemanticLint("proj-uuid")
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe("semantic")
    expect(results[0].severity).toBe("warning")
    expect(results[0].affectedPages).toEqual(["a.md", "b.md"])
  })

  it("returns empty on LLM error", async () => {
    vi.mocked(listDirectory).mockResolvedValue(makeTree([
      { name: "a.md", relativePath: "wiki/entities/a.md" },
    ]))
    vi.mocked(readFile).mockResolvedValue("content")

    vi.mocked(streamChat).mockImplementation(async (_m, cb) => {
      cb.onError(new Error("API error"))
    })

    const results = await runSemanticLint("proj-uuid")
    expect(results).toEqual([])
  })

  it("returns empty when no wiki pages exist", async () => {
    vi.mocked(listDirectory).mockResolvedValue([])
    const results = await runSemanticLint("proj-uuid")
    expect(results).toEqual([])
  })
})
