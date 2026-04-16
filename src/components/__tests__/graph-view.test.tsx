import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { GraphView } from "../graph/graph-view"
import { useWikiStore } from "@/stores/wiki-store"
import { useResearchStore } from "@/stores/research-store"
import { buildWikiGraph } from "@/lib/wiki-graph"
import { findSurprisingConnections, detectKnowledgeGaps } from "@/lib/graph-insights"

vi.mock("@/lib/wiki-graph", () => ({
  buildWikiGraph: vi.fn(),
}))

vi.mock("@/lib/graph-insights", () => ({
  findSurprisingConnections: vi.fn().mockReturnValue([]),
  detectKnowledgeGaps: vi.fn().mockReturnValue([]),
}))

const mockLoadGraph = vi.fn()

vi.mock("@react-sigma/core", () => ({
  SigmaContainer: ({ children }: { children?: ReactNode }) => (
    <div data-testid="sigma">{children}</div>
  ),
  useLoadGraph: () => mockLoadGraph,
  useRegisterEvents: () => vi.fn(),
  useSigma: () => ({
    getGraph: () => ({
      forEachNode: vi.fn(),
      forEachEdge: vi.fn(),
      hasNode: vi.fn(() => false),
      hasEdge: vi.fn(() => false),
      neighbors: vi.fn(() => []),
      setNodeAttribute: vi.fn(),
      removeNodeAttribute: vi.fn(),
      setEdgeAttribute: vi.fn(),
      removeEdgeAttribute: vi.fn(),
    }),
    getCamera: () => ({
      animatedZoom: vi.fn(),
      animatedUnzoom: vi.fn(),
      animatedReset: vi.fn(),
    }),
    refresh: vi.fn(),
    getContainer: () => ({ style: {} }),
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadGraph.mockReset()
  useResearchStore.setState({ panelOpen: false } as any)
  useWikiStore.setState({
    project: null,
    fileTree: [],
    selectedFile: null,
    fileContent: "",
    chatExpanded: false,
    activeView: "graph",
    dataVersion: 0,
    llmConfig: {
      provider: "openai",
      apiKey: "",
      model: "",
      ollamaUrl: "http://localhost:11434",
      customEndpoint: "",
      maxContextSize: 204800,
    },
    searchApiConfig: { provider: "none", apiKey: "" },
    embeddingConfig: { enabled: false, endpoint: "", apiKey: "", model: "" },
  } as any)
  vi.mocked(buildWikiGraph).mockResolvedValue({ nodes: [], edges: [], communities: [] })
  vi.mocked(findSurprisingConnections).mockReturnValue([])
  vi.mocked(detectKnowledgeGaps).mockReturnValue([])
})

describe("GraphView", () => {
  it("shows open project message when there is no project", () => {
    render(<GraphView />)
    expect(screen.getByText("graph.openProject")).toBeInTheDocument()
  })

  it("shows import hint when the graph is empty", async () => {
    useWikiStore.setState({
      project: { name: "P", path: "/tmp/wiki-proj" },
      dataVersion: 1,
    } as any)
    vi.mocked(buildWikiGraph).mockResolvedValue({ nodes: [], edges: [], communities: [] })

    render(<GraphView />)

    await waitFor(() => {
      expect(screen.getByText("graph.noPages")).toBeInTheDocument()
    })
    expect(screen.getByText("graph.importHint")).toBeInTheDocument()
  })

  it("renders sigma container when the graph has data", async () => {
    useWikiStore.setState({
      project: { name: "P", path: "/tmp/wiki-proj" },
      dataVersion: 1,
    } as any)
    vi.mocked(buildWikiGraph).mockResolvedValue({
      nodes: [
        {
          id: "a",
          label: "Page A",
          type: "entity",
          path: "/tmp/wiki-proj/wiki/a.md",
          linkCount: 1,
          community: 0,
        },
      ],
      edges: [],
      communities: [],
    })

    render(<GraphView />)

    await waitFor(() => {
      expect(screen.getByTestId("sigma")).toBeInTheDocument()
    })
    expect(screen.getByText("graph.knowledgeGraph")).toBeInTheDocument()
  })
})
