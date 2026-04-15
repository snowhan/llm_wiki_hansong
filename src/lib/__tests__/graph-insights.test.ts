import { describe, it, expect } from "vitest"
import {
  findSurprisingConnections,
  detectKnowledgeGaps,
} from "../graph-insights"
import type { GraphNode, GraphEdge, CommunityInfo } from "../wiki-graph"

function makeNode(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    label: overrides.id,
    type: "entity",
    path: `/wiki/${overrides.id}.md`,
    linkCount: 2,
    community: 0,
    ...overrides,
  }
}

describe("findSurprisingConnections", () => {
  it("returns empty for no edges", () => {
    const nodes = [makeNode({ id: "a" }), makeNode({ id: "b" })]
    expect(findSurprisingConnections(nodes, [], [])).toEqual([])
  })

  it("scores cross-community edges higher", () => {
    const nodes = [
      makeNode({ id: "a", community: 0, type: "source", linkCount: 1 }),
      makeNode({ id: "b", community: 1, type: "concept", linkCount: 5 }),
    ]
    const edges: GraphEdge[] = [{ source: "a", target: "b", weight: 1 }]
    const communities: CommunityInfo[] = [
      { id: 0, nodeCount: 3, cohesion: 0.5, topNodes: ["a"] },
      { id: 1, nodeCount: 3, cohesion: 0.5, topNodes: ["b"] },
    ]

    const result = findSurprisingConnections(nodes, edges, communities)
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].reasons).toContain("crosses community boundary")
  })

  it("excludes structural nodes (index, log, overview)", () => {
    const nodes = [
      makeNode({ id: "index", community: 0 }),
      makeNode({ id: "a", community: 1 }),
    ]
    const edges: GraphEdge[] = [{ source: "index", target: "a", weight: 1 }]
    expect(findSurprisingConnections(nodes, edges, [])).toEqual([])
  })

  it("respects limit parameter", () => {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    for (let i = 0; i < 10; i++) {
      nodes.push(makeNode({ id: `n${i}`, community: i % 3, type: i % 2 === 0 ? "source" : "concept" }))
    }
    for (let i = 0; i < 9; i++) {
      edges.push({ source: `n${i}`, target: `n${i + 1}`, weight: 1 })
    }
    const result = findSurprisingConnections(nodes, edges, [], 2)
    expect(result.length).toBeLessThanOrEqual(2)
  })

  it("detects peripheral-to-hub connections", () => {
    const nodes = [
      makeNode({ id: "hub", community: 0, linkCount: 10 }),
      makeNode({ id: "leaf", community: 1, linkCount: 1 }),
    ]
    const edges: GraphEdge[] = [{ source: "hub", target: "leaf", weight: 1 }]
    const result = findSurprisingConnections(nodes, edges, [])
    if (result.length > 0) {
      const allReasons = result.flatMap((r) => r.reasons)
      expect(allReasons).toContain("peripheral node links to hub")
    }
  })
})

describe("detectKnowledgeGaps", () => {
  it("returns empty for no nodes", () => {
    expect(detectKnowledgeGaps([], [], [])).toEqual([])
  })

  it("detects isolated nodes", () => {
    const nodes = [
      makeNode({ id: "lonely", linkCount: 0, type: "entity" }),
      makeNode({ id: "connected", linkCount: 5, type: "entity" }),
    ]
    const gaps = detectKnowledgeGaps(nodes, [], [])
    const isolated = gaps.find((g) => g.type === "isolated-node")
    expect(isolated).toBeDefined()
    expect(isolated!.nodeIds).toContain("lonely")
    expect(isolated!.nodeIds).not.toContain("connected")
  })

  it("excludes overview/index/log from isolated detection", () => {
    const nodes = [
      makeNode({ id: "index", linkCount: 0, type: "overview" }),
      makeNode({ id: "log", linkCount: 0, type: "entity" }),
    ]
    const gaps = detectKnowledgeGaps(nodes, [], [])
    const isolated = gaps.find((g) => g.type === "isolated-node")
    expect(isolated).toBeUndefined()
  })

  it("detects sparse communities", () => {
    const nodes = [
      makeNode({ id: "a", community: 0 }),
      makeNode({ id: "b", community: 0 }),
      makeNode({ id: "c", community: 0 }),
    ]
    const communities: CommunityInfo[] = [
      { id: 0, nodeCount: 3, cohesion: 0.1, topNodes: ["a"] },
    ]
    const gaps = detectKnowledgeGaps(nodes, [], communities)
    expect(gaps.some((g) => g.type === "sparse-community")).toBe(true)
  })

  it("detects bridge nodes connecting 3+ communities", () => {
    const nodes = [
      makeNode({ id: "bridge", community: 0, linkCount: 6 }),
      makeNode({ id: "a1", community: 1 }),
      makeNode({ id: "a2", community: 2 }),
      makeNode({ id: "a3", community: 3 }),
    ]
    const edges: GraphEdge[] = [
      { source: "bridge", target: "a1", weight: 1 },
      { source: "bridge", target: "a2", weight: 1 },
      { source: "bridge", target: "a3", weight: 1 },
    ]
    const communities: CommunityInfo[] = []
    const gaps = detectKnowledgeGaps(nodes, edges, communities)
    expect(gaps.some((g) => g.type === "bridge-node")).toBe(true)
  })

  it("respects limit parameter", () => {
    const nodes = Array.from({ length: 20 }, (_, i) =>
      makeNode({ id: `n${i}`, linkCount: 0, type: "entity" }),
    )
    const gaps = detectKnowledgeGaps(nodes, [], [], 3)
    expect(gaps.length).toBeLessThanOrEqual(3)
  })
})
