import { describe, it, expect, vi, beforeEach } from "vitest"
import { buildWikiGraph } from "../wiki-graph"
import { readFile, listDirectory } from "@/commands/fs"
import type { FileNode } from "@/types/wiki"

vi.mock("../graph-relevance", () => ({
  buildRetrievalGraph: vi.fn().mockResolvedValue(null),
  calculateRelevance: vi.fn().mockReturnValue(1),
}))

vi.mock("@/stores/wiki-store", async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    useWikiStore: {
      ...actual.useWikiStore,
      getState: () => ({ dataVersion: 1 }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  }
})

function makeTree(files: { name: string; path: string }[]): FileNode[] {
  return files.map((f) => ({ name: f.name, path: f.path, is_dir: false, children: [] }))
}

describe("buildWikiGraph", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns empty graph when wiki directory is unreadable", async () => {
    vi.mocked(listDirectory).mockRejectedValue(new Error("not found"))
    const result = await buildWikiGraph("/proj")
    expect(result).toEqual({ nodes: [], edges: [], communities: [] })
  })

  it("returns empty graph when no md files exist", async () => {
    vi.mocked(listDirectory).mockResolvedValue([])
    const result = await buildWikiGraph("/proj")
    expect(result).toEqual({ nodes: [], edges: [], communities: [] })
  })

  it("builds nodes from wiki files with frontmatter", async () => {
    vi.mocked(listDirectory).mockResolvedValue(makeTree([
      { name: "openai.md", path: "/proj/wiki/entities/openai.md" },
      { name: "transformers.md", path: "/proj/wiki/concepts/transformers.md" },
    ]))
    vi.mocked(readFile)
      .mockResolvedValueOnce("---\ntype: entity\ntitle: OpenAI\n---\nContent about [[transformers]]")
      .mockResolvedValueOnce("---\ntype: concept\ntitle: Transformers\n---\nNeural architecture")

    const result = await buildWikiGraph("/proj")
    expect(result.nodes).toHaveLength(2)
    expect(result.nodes.find((n) => n.id === "openai")?.type).toBe("entity")
    expect(result.nodes.find((n) => n.id === "transformers")?.type).toBe("concept")
  })

  it("creates edges from wikilinks", async () => {
    vi.mocked(listDirectory).mockResolvedValue(makeTree([
      { name: "a.md", path: "/proj/wiki/entities/a.md" },
      { name: "b.md", path: "/proj/wiki/entities/b.md" },
    ]))
    vi.mocked(readFile)
      .mockResolvedValueOnce("---\ntype: entity\ntitle: A\n---\nSee [[b]]")
      .mockResolvedValueOnce("---\ntype: entity\ntitle: B\n---\nSee [[a]]")

    const result = await buildWikiGraph("/proj")
    expect(result.edges.length).toBeGreaterThanOrEqual(1)
    expect(result.edges.some((e) => (e.source === "a" && e.target === "b") || (e.source === "b" && e.target === "a"))).toBe(true)
  })

  it("filters out query type nodes", async () => {
    vi.mocked(listDirectory).mockResolvedValue(makeTree([
      { name: "entity.md", path: "/proj/wiki/entities/entity.md" },
      { name: "research.md", path: "/proj/wiki/queries/research.md" },
    ]))
    vi.mocked(readFile)
      .mockResolvedValueOnce("---\ntype: entity\ntitle: Entity\n---\n")
      .mockResolvedValueOnce("---\ntype: query\ntitle: Research\n---\n")

    const result = await buildWikiGraph("/proj")
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].type).toBe("entity")
  })

  it("deduplicates edges between same nodes", async () => {
    vi.mocked(listDirectory).mockResolvedValue(makeTree([
      { name: "a.md", path: "/proj/wiki/entities/a.md" },
      { name: "b.md", path: "/proj/wiki/entities/b.md" },
    ]))
    vi.mocked(readFile)
      .mockResolvedValueOnce("---\ntype: entity\ntitle: A\n---\n[[b]] and again [[b]]")
      .mockResolvedValueOnce("---\ntype: entity\ntitle: B\n---\n[[a]]")

    const result = await buildWikiGraph("/proj")
    const abEdges = result.edges.filter((e) =>
      (e.source === "a" && e.target === "b") || (e.source === "b" && e.target === "a"),
    )
    expect(abEdges).toHaveLength(1)
  })

  it("computes community assignments", async () => {
    vi.mocked(listDirectory).mockResolvedValue(makeTree([
      { name: "a.md", path: "/proj/wiki/entities/a.md" },
      { name: "b.md", path: "/proj/wiki/entities/b.md" },
      { name: "c.md", path: "/proj/wiki/entities/c.md" },
    ]))
    vi.mocked(readFile)
      .mockResolvedValueOnce("---\ntype: entity\ntitle: A\n---\n[[b]]")
      .mockResolvedValueOnce("---\ntype: entity\ntitle: B\n---\n[[a]] [[c]]")
      .mockResolvedValueOnce("---\ntype: entity\ntitle: C\n---\n[[b]]")

    const result = await buildWikiGraph("/proj")
    expect(result.communities.length).toBeGreaterThanOrEqual(1)
    result.nodes.forEach((n) => {
      expect(typeof n.community).toBe("number")
    })
  })

  it("falls back to filename when no frontmatter title", async () => {
    vi.mocked(listDirectory).mockResolvedValue(makeTree([
      { name: "page.md", path: "/proj/wiki/page.md" },
    ]))
    vi.mocked(readFile).mockResolvedValue("# My Page Title\n\nContent here")

    const result = await buildWikiGraph("/proj")
    expect(result.nodes[0].label).toBe("page")
  })

  it("falls back to filename for title", async () => {
    vi.mocked(listDirectory).mockResolvedValue(makeTree([
      { name: "my-page.md", path: "/proj/wiki/my-page.md" },
    ]))
    vi.mocked(readFile).mockResolvedValue("Just content, no title")

    const result = await buildWikiGraph("/proj")
    expect(result.nodes[0].label).toBe("my page")
  })
})
