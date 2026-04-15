import { describe, it, expect, beforeEach } from "vitest"
import {
  calculateRelevance,
  getRelatedNodes,
  clearGraphCache,
  type RetrievalNode,
  type RetrievalGraph,
} from "../graph-relevance"

function makeNode(overrides: Partial<RetrievalNode> & { id: string }): RetrievalNode {
  return {
    title: overrides.id,
    type: "entity",
    path: `/wiki/${overrides.id}.md`,
    sources: [],
    outLinks: new Set(),
    inLinks: new Set(),
    ...overrides,
  }
}

function makeGraph(nodes: RetrievalNode[]): RetrievalGraph {
  const map = new Map(nodes.map((n) => [n.id, n]))
  return { nodes: map, dataVersion: 1 }
}

beforeEach(() => {
  clearGraphCache()
})

describe("calculateRelevance", () => {
  it("returns 0 for same node", () => {
    const node = makeNode({ id: "a" })
    const graph = makeGraph([node])
    expect(calculateRelevance(node, node, graph)).toBe(0)
  })

  it("scores direct links higher", () => {
    const a = makeNode({ id: "a", outLinks: new Set(["b"]) })
    const b = makeNode({ id: "b", inLinks: new Set(["a"]) })
    const graph = makeGraph([a, b])

    const withLink = calculateRelevance(a, b, graph)

    const c = makeNode({ id: "c" })
    const d = makeNode({ id: "d" })
    const graph2 = makeGraph([c, d])
    const noLink = calculateRelevance(c, d, graph2)

    expect(withLink).toBeGreaterThan(noLink)
  })

  it("scores bidirectional links even higher", () => {
    const a = makeNode({ id: "a", outLinks: new Set(["b"]), inLinks: new Set(["b"]) })
    const b = makeNode({ id: "b", outLinks: new Set(["a"]), inLinks: new Set(["a"]) })
    const graph = makeGraph([a, b])

    const bidir = calculateRelevance(a, b, graph)

    const c = makeNode({ id: "c", outLinks: new Set(["d"]) })
    const d = makeNode({ id: "d", inLinks: new Set(["c"]) })
    const graph2 = makeGraph([c, d])
    const unidir = calculateRelevance(c, d, graph2)

    expect(bidir).toBeGreaterThan(unidir)
  })

  it("scores source overlap", () => {
    const a = makeNode({ id: "a", sources: ["paper.pdf", "article.md"] })
    const b = makeNode({ id: "b", sources: ["paper.pdf"] })
    const graph = makeGraph([a, b])

    const withOverlap = calculateRelevance(a, b, graph)

    const c = makeNode({ id: "c", sources: ["other.pdf"] })
    const d = makeNode({ id: "d", sources: ["different.pdf"] })
    const graph2 = makeGraph([c, d])
    const noOverlap = calculateRelevance(c, d, graph2)

    expect(withOverlap).toBeGreaterThan(noOverlap)
  })

  it("scores common neighbors (Adamic-Adar)", () => {
    const shared = makeNode({ id: "shared", outLinks: new Set(["a", "b"]), inLinks: new Set() })
    const a = makeNode({ id: "a", inLinks: new Set(["shared"]), outLinks: new Set(["shared"]) })
    const b = makeNode({ id: "b", inLinks: new Set(["shared"]), outLinks: new Set(["shared"]) })
    const graph = makeGraph([a, b, shared])

    const score = calculateRelevance(a, b, graph)
    expect(score).toBeGreaterThan(0)
  })

  it("includes type affinity score", () => {
    const entity = makeNode({ id: "e", type: "entity" })
    const concept = makeNode({ id: "c", type: "concept" })
    const graph = makeGraph([entity, concept])
    const score = calculateRelevance(entity, concept, graph)
    expect(score).toBeGreaterThan(0)
  })
})

describe("getRelatedNodes", () => {
  it("returns empty for non-existent node", () => {
    const graph = makeGraph([])
    expect(getRelatedNodes("nonexistent", graph)).toEqual([])
  })

  it("returns related nodes sorted by relevance", () => {
    const a = makeNode({ id: "a", outLinks: new Set(["b", "c"]) })
    const b = makeNode({
      id: "b",
      inLinks: new Set(["a"]),
      outLinks: new Set(["a"]),
      sources: ["shared.pdf"],
    })
    const c = makeNode({ id: "c", inLinks: new Set(["a"]) })
    const graph = makeGraph([a, b, c])

    const related = getRelatedNodes("a", graph, 5)
    expect(related.length).toBeGreaterThanOrEqual(1)
    for (let i = 1; i < related.length; i++) {
      expect(related[i - 1].relevance).toBeGreaterThanOrEqual(related[i].relevance)
    }
  })

  it("respects limit", () => {
    const a = makeNode({ id: "a", outLinks: new Set(["b", "c", "d"]) })
    const b = makeNode({ id: "b", inLinks: new Set(["a"]) })
    const c = makeNode({ id: "c", inLinks: new Set(["a"]) })
    const d = makeNode({ id: "d", inLinks: new Set(["a"]) })
    const graph = makeGraph([a, b, c, d])

    const related = getRelatedNodes("a", graph, 2)
    expect(related.length).toBeLessThanOrEqual(2)
  })
})

describe("clearGraphCache", () => {
  it("does not throw", () => {
    expect(() => clearGraphCache()).not.toThrow()
  })
})
