import { useEffect, useCallback, useState, useRef, type ChangeEvent } from "react"
import { useTranslation } from "react-i18next"
import Graph from "graphology"
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from "@react-sigma/core"
import "@react-sigma/core/lib/style.css"
import forceAtlas2 from "graphology-layout-forceatlas2"
import HubIcon from "@mui/icons-material/Hub"
import RefreshIcon from "@mui/icons-material/Refresh"
import ZoomInIcon from "@mui/icons-material/ZoomIn"
import ZoomOutIcon from "@mui/icons-material/ZoomOut"
import FitScreenIcon from "@mui/icons-material/FitScreen"
import LayersIcon from "@mui/icons-material/Layers"
import LocalOfferIcon from "@mui/icons-material/LocalOffer"
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import InsertLinkOutlinedIcon from "@mui/icons-material/InsertLinkOutlined"
import CloseIcon from "@mui/icons-material/Close"
import SearchIcon from "@mui/icons-material/Search"
import Box from "@mui/material/Box"
import CircularProgress from "@mui/material/CircularProgress"
import IconButton from "@mui/material/IconButton"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import { alpha, type Theme } from "@mui/material/styles"
import { ErrorBoundary } from "@/components/error-boundary"
import { useResearchStore } from "@/stores/research-store"
import Button from "@mui/material/Button"
import TextField from "@mui/material/TextField"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile } from "@/commands/fs"
import { buildWikiGraph, type GraphNode, type GraphEdge, type CommunityInfo } from "@/lib/wiki-graph"
import { findSurprisingConnections, detectKnowledgeGaps, type SurprisingConnection, type KnowledgeGap } from "@/lib/graph-insights"
import { queueResearch } from "@/lib/deep-research"
import { optimizeResearchTopic } from "@/lib/optimize-research-topic"

const NODE_TYPE_COLORS: Record<string, string> = {
  entity: "#60a5fa",    // blue-400
  concept: "#c084fc",   // purple-400
  source: "#fb923c",    // orange-400
  query: "#4ade80",     // green-400
  synthesis: "#f87171",  // red-400
  overview: "#facc15",  // yellow-400
  comparison: "#2dd4bf", // teal-400
  other: "#94a3b8",     // slate-400
}

/** Node type keys for legend order; labels come from i18n `graph.<type>`. */
const NODE_TYPES = [
  "entity",
  "concept",
  "source",
  "query",
  "synthesis",
  "overview",
  "comparison",
  "other",
] as const

const COMMUNITY_COLORS = [
  "#60a5fa",  // blue-400
  "#4ade80",  // green-400
  "#fb923c",  // orange-400
  "#c084fc",  // purple-400
  "#f87171",  // red-400
  "#2dd4bf",  // teal-400
  "#facc15",  // yellow-400
  "#f472b6",  // pink-400
  "#a78bfa",  // violet-400
  "#38bdf8",  // sky-400
  "#34d399",  // emerald-400
  "#fbbf24",  // amber-400
]

type ColorMode = "type" | "community"

const BASE_NODE_SIZE = 8
const MAX_NODE_SIZE = 28

function nodeColor(type: string): string {
  return NODE_TYPE_COLORS[type] ?? NODE_TYPE_COLORS.other
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function mixColor(color1: string, color2: string, ratio: number): string {
  const hex = (c: string) => parseInt(c, 16)
  const r1 = hex(color1.slice(1, 3)), g1 = hex(color1.slice(3, 5)), b1 = hex(color1.slice(5, 7))
  const r2 = hex(color2.slice(1, 3)), g2 = hex(color2.slice(3, 5)), b2 = hex(color2.slice(5, 7))
  const r = Math.round(r1 + (r2 - r1) * ratio)
  const g = Math.round(g1 + (g2 - g1) * ratio)
  const b = Math.round(b1 + (b2 - b1) * ratio)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

function nodeSize(linkCount: number, maxLinks: number): number {
  if (maxLinks === 0) return BASE_NODE_SIZE
  const ratio = linkCount / maxLinks
  return BASE_NODE_SIZE + Math.sqrt(ratio) * (MAX_NODE_SIZE - BASE_NODE_SIZE)
}

// --- Inner components ---

// Cache computed node positions so re-renders don't re-layout
const positionCache = new Map<string, { x: number; y: number }>()
let lastLayoutDataKey = ""

function GraphLoader({ nodes, edges, colorMode }: { nodes: GraphNode[]; edges: GraphEdge[]; colorMode: ColorMode }) {
  const loadGraph = useLoadGraph()

  useEffect(() => {
    const dataKey = nodes.map((n) => n.id).sort().join(",") + "|" + edges.length
    const needsLayout = dataKey !== lastLayoutDataKey

    const graph = new Graph()
    const maxLinks = Math.max(...nodes.map((n) => n.linkCount), 1)

    for (const node of nodes) {
      const cached = positionCache.get(node.id)
      const color = colorMode === "community"
        ? COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length]
        : nodeColor(node.type)
      graph.addNode(node.id, {
        x: cached?.x ?? Math.random() * 100,
        y: cached?.y ?? Math.random() * 100,
        size: nodeSize(node.linkCount, maxLinks),
        color,
        label: node.label,
        nodeType: node.type,
        nodePath: node.relativePath,
        community: node.community,
      })
    }

    // Calculate max weight for normalization
    const maxWeight = Math.max(...edges.map((e) => e.weight), 1)

    for (const edge of edges) {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        const edgeKey = `${edge.source}->${edge.target}`
        if (!graph.hasEdge(edgeKey) && !graph.hasEdge(`${edge.target}->${edge.source}`)) {
          const normalizedWeight = edge.weight / maxWeight // 0..1
          const size = 0.5 + normalizedWeight * 3.5 // 0.5..4
          // Stronger relationships → darker color
          const alpha = Math.round(40 + normalizedWeight * 180) // 40..220
          const color = `rgba(100,116,139,${alpha / 255})` // slate-500 with variable opacity
          graph.addEdgeWithKey(edgeKey, edge.source, edge.target, {
            color,
            size,
            weight: edge.weight,
          })
        }
      }
    }

    // Only run expensive ForceAtlas2 layout when data actually changed
    if (needsLayout && nodes.length > 1) {
      const settings = forceAtlas2.inferSettings(graph)
      forceAtlas2.assign(graph, {
        iterations: 150,
        settings: {
          ...settings,
          gravity: 1,
          scalingRatio: 2,
          strongGravityMode: true,
          barnesHutOptimize: nodes.length > 50,
        },
      })
      lastLayoutDataKey = dataKey

      // Cache computed positions
      graph.forEachNode((nodeId, attrs) => {
        positionCache.set(nodeId, { x: attrs.x, y: attrs.y })
      })
    }

    loadGraph(graph)
  }, [loadGraph, nodes, edges, colorMode])

  return null
}

function HighlightManager({ highlightedNodes }: { highlightedNodes: Set<string> }) {
  const sigma = useSigma()

  useEffect(() => {
    const graph = sigma.getGraph()
    if (highlightedNodes.size === 0) {
      graph.forEachNode((n) => {
        graph.removeNodeAttribute(n, "insightHighlight")
        graph.removeNodeAttribute(n, "dimmed")
      })
      graph.forEachEdge((e) => {
        graph.removeEdgeAttribute(e, "dimmed")
        graph.removeEdgeAttribute(e, "highlighted")
      })
    } else {
      graph.forEachNode((n) => {
        if (highlightedNodes.has(n)) {
          graph.setNodeAttribute(n, "insightHighlight", true)
          graph.removeNodeAttribute(n, "dimmed")
        } else {
          graph.setNodeAttribute(n, "dimmed", true)
          graph.removeNodeAttribute(n, "insightHighlight")
        }
      })
      graph.forEachEdge((e, _attrs, source, target) => {
        if (highlightedNodes.has(source) && highlightedNodes.has(target)) {
          graph.setEdgeAttribute(e, "highlighted", true)
          graph.removeEdgeAttribute(e, "dimmed")
        } else {
          graph.setEdgeAttribute(e, "dimmed", true)
          graph.removeEdgeAttribute(e, "highlighted")
        }
      })
    }
    sigma.refresh()
  }, [sigma, highlightedNodes])

  return null
}

function EventHandler({ onNodeClick }: { onNodeClick: (nodeId: string) => void }) {
  const registerEvents = useRegisterEvents()
  const sigma = useSigma()

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => onNodeClick(node),
      enterNode: ({ node }) => {
        const container = sigma.getContainer()
        container.style.cursor = "pointer"
        const graph = sigma.getGraph()
        graph.setNodeAttribute(node, "hovering", true)
        const neighbors = new Set(graph.neighbors(node))
        neighbors.add(node)
        graph.forEachNode((n) => {
          if (!neighbors.has(n)) graph.setNodeAttribute(n, "dimmed", true)
        })
        graph.forEachEdge((e, _attrs, source, target) => {
          if (source !== node && target !== node) {
            graph.setEdgeAttribute(e, "dimmed", true)
          } else {
            graph.setEdgeAttribute(e, "highlighted", true)
          }
        })
        sigma.refresh()
      },
      leaveNode: () => {
        const container = sigma.getContainer()
        container.style.cursor = "default"
        const graph = sigma.getGraph()
        graph.forEachNode((n) => {
          graph.removeNodeAttribute(n, "hovering")
          graph.removeNodeAttribute(n, "dimmed")
        })
        graph.forEachEdge((e) => {
          graph.removeEdgeAttribute(e, "dimmed")
          graph.removeEdgeAttribute(e, "highlighted")
        })
        sigma.refresh()
      },
    })
  }, [registerEvents, sigma, onNodeClick])

  return null
}

function ZoomControls() {
  const sigma = useSigma()

  const zoomBtnSx = {
    width: 28,
    height: 28,
    minWidth: 28,
    bgcolor: (theme: Theme) => alpha(theme.palette.background.paper, 0.85),
    backdropFilter: "blur(8px)",
  }

  return (
    <Box sx={{ position: "absolute", top: 12, right: 12, display: "flex", flexDirection: "column", gap: 0.5 }}>
      <IconButton
        size="small"
        sx={{ ...zoomBtnSx, border: 1, borderColor: "divider" }}
        onClick={() => {
          const camera = sigma.getCamera()
          camera.animatedZoom({ duration: 200 })
        }}
      >
        <ZoomInIcon sx={{ fontSize: 16 }} />
      </IconButton>
      <IconButton
        size="small"
        sx={{ ...zoomBtnSx, border: 1, borderColor: "divider" }}
        onClick={() => {
          const camera = sigma.getCamera()
          camera.animatedUnzoom({ duration: 200 })
        }}
      >
        <ZoomOutIcon sx={{ fontSize: 16 }} />
      </IconButton>
      <IconButton
        size="small"
        sx={{ ...zoomBtnSx, border: 1, borderColor: "divider" }}
        onClick={() => {
          const camera = sigma.getCamera()
          camera.animatedReset({ duration: 300 })
        }}
      >
        <FitScreenIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  )
}

// --- Main component ---

export function GraphView() {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const dataVersion = useWikiStore((s) => s.dataVersion)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setFileContent = useWikiStore((s) => s.setFileContent)

  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [communities, setCommunities] = useState<CommunityInfo[]>([])
  const [surprisingConns, setSurprisingConns] = useState<SurprisingConnection[]>([])
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGap[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredType, setHoveredType] = useState<string | null>(null)
  const [colorMode, setColorMode] = useState<ColorMode>("type")
  const [showInsights, setShowInsights] = useState(false)
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set())
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set())
  const [sigmaKey, setSigmaKey] = useState(0)
  const [isResizing, setIsResizing] = useState(false)
  const graphContainerRef = useRef<HTMLDivElement>(null)
  // Research confirmation dialog
  const [researchDialog, setResearchDialog] = useState<{
    loading: boolean
    topic: string
    queries: string[]
  } | null>(null)
  const lastLoadedVersion = useRef(-1)

  const loadGraph = useCallback(async () => {
    if (!project) return
    setLoading(true)
    setError(null)
    try {
      const result = await buildWikiGraph(project.id)
      setNodes(result.nodes)
      setEdges(result.edges)
      setCommunities(result.communities)
      setSurprisingConns(findSurprisingConnections(result.nodes, result.edges, result.communities))
      setKnowledgeGaps(detectKnowledgeGaps(result.nodes, result.edges, result.communities))
      lastLoadedVersion.current = useWikiStore.getState().dataVersion
    } catch (err) {
      const message = err instanceof Error ? err.message : t("graph.failedToBuild")
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [project, t])

  useEffect(() => {
    if (dataVersion !== lastLoadedVersion.current) {
      loadGraph()
    }
  }, [loadGraph, dataVersion])

  const handleNodeClick = useCallback(
    async (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId)
      if (!node || !project) return
      try {
        const content = await readFile(project.id, node.relativePath)
        setSelectedFile(node.relativePath)
        setFileContent(content)
      } catch (err) {
        console.error("Failed to open wiki page:", err)
      }
    },
    [nodes, project, setSelectedFile, setFileContent],
  )

  const handleResearchClick = useCallback(async (gapTitle: string, gapDescription: string, gapType: string) => {
    const store = useWikiStore.getState()
    if (!store.project) return

    // Show loading state
    setResearchDialog({ loading: true, topic: "", queries: [] })

    try {
      // Read overview and purpose for context
      let overview = ""
      let purpose = ""
      try { overview = await readFile(store.project.id, "wiki/overview.md") } catch {}
      try { purpose = await readFile(store.project.id, "purpose.md") } catch {}

      const result = await optimizeResearchTopic(
        store.llmConfig,
        gapTitle,
        gapDescription,
        gapType,
        overview,
        purpose,
      )
      setResearchDialog({ loading: false, topic: result.topic, queries: result.searchQueries })
    } catch {
      // Fallback: use raw title
      setResearchDialog({ loading: false, topic: gapTitle, queries: [gapTitle] })
    }
  }, [])

  const handleResearchConfirm = useCallback(() => {
    if (!researchDialog) return
    const store = useWikiStore.getState()
    if (!store.project) return
    queueResearch(
      store.project.id,
      researchDialog.topic,
      store.llmConfig,
      store.searchApiConfig,
      researchDialog.queries,
    )
    setResearchDialog(null)
  }, [researchDialog])

  // Unmount sigma when panels resize or toggle to prevent WebGL crash.
  // Sigma crashes with "could not find suitable program for node type circle"
  // when its canvas is resized by external layout changes.

  // 1. Detect panel open/close (selectedFile, researchPanel, insights)
  const selectedFileForLayout = useWikiStore((s) => s.selectedFile)
  const researchPanelForLayout = useResearchStore((s) => s.panelOpen)
  const layoutKey = `${!!selectedFileForLayout}-${researchPanelForLayout}-${showInsights}`
  const prevLayoutKey = useRef(layoutKey)

  useEffect(() => {
    if (prevLayoutKey.current !== layoutKey) {
      prevLayoutKey.current = layoutKey
      setIsResizing(true)
      const timer = setTimeout(() => {
        setSigmaKey((k) => k + 1)
        setIsResizing(false)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [layoutKey])

  // 2. Detect panel drag resize via data-panel-resizing attribute on body
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dragging = document.body.dataset.panelResizing === "true"
      if (dragging && !isResizing) {
        setIsResizing(true)
      }
      if (!dragging && isResizing) {
        // Drag ended — remount sigma after a tick
        setTimeout(() => {
          setSigmaKey((k) => k + 1)
          setIsResizing(false)
        }, 50)
      }
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-panel-resizing"] })
    return () => observer.disconnect()
  }, [isResizing])

  // Count nodes by type for legend
  const typeCounts = nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1
    return acc
  }, {})

  if (!project) {
    return (
      <Stack spacing={1.5} sx={{ height: 1, alignItems: "center", justifyContent: "center", color: "text.secondary" }}>
        <HubIcon sx={{ fontSize: 40, opacity: 0.3 }} />
        <Typography variant="body2">{t("graph.openProject")}</Typography>
      </Stack>
    )
  }

  if (loading) {
    return (
      <Stack spacing={1.5} sx={{ height: 1, alignItems: "center", justifyContent: "center", color: "text.secondary" }}>
        <CircularProgress size={32} sx={{ opacity: 0.6 }} />
        <Typography variant="body2">{t("graph.building")}</Typography>
      </Stack>
    )
  }

  if (error) {
    return (
      <Stack spacing={1.5} sx={{ height: 1, alignItems: "center", justifyContent: "center", color: "text.secondary" }}>
        <HubIcon sx={{ fontSize: 40, opacity: 0.3 }} />
        <Typography variant="body2" color="error">
          {error}
        </Typography>
        <Button variant="outlined" size="small" onClick={loadGraph} sx={{ textTransform: "none" }}>
          {t("graph.retry")}
        </Button>
      </Stack>
    )
  }

  if (!loading && nodes.length === 0 && !error) {
    return (
      <Stack spacing={1.5} sx={{ height: 1, alignItems: "center", justifyContent: "center", color: "text.secondary" }}>
        <HubIcon sx={{ fontSize: 40, opacity: 0.3 }} />
        <Typography variant="body2">{t("graph.noPages")}</Typography>
        <Typography variant="caption">{t("graph.importHint")}</Typography>
      </Stack>
    )
  }

  return (
    <Box sx={{ position: "relative", display: "flex", height: 1, flexDirection: "column" }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          px: 2,
          py: 1,
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <HubIcon sx={{ fontSize: 18, color: "text.secondary" }} />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {t("graph.knowledgeGraph")}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Typography component="span" variant="caption" sx={{ borderRadius: 1, bgcolor: "action.hover", px: 0.75, py: 0.25, color: "text.secondary" }}>
              {nodes.length} {t("graph.pages")}
            </Typography>
            <Typography component="span" variant="caption" sx={{ borderRadius: 1, bgcolor: "action.hover", px: 0.75, py: 0.25, color: "text.secondary" }}>
              {edges.length} {t("graph.links")}
            </Typography>
          </Stack>
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <Button
            color={colorMode === "type" ? "secondary" : "inherit"}
            variant={colorMode === "type" ? "contained" : "text"}
            size="small"
            onClick={() => setColorMode("type")}
            sx={{ fontSize: "0.75rem", gap: 0.5, minHeight: 28, textTransform: "none" }}
            startIcon={<LocalOfferIcon sx={{ fontSize: 14 }} />}
          >
            {t("graph.type")}
          </Button>
          <Button
            color={colorMode === "community" ? "secondary" : "inherit"}
            variant={colorMode === "community" ? "contained" : "text"}
            size="small"
            onClick={() => setColorMode("community")}
            sx={{ fontSize: "0.75rem", gap: 0.5, minHeight: 28, textTransform: "none" }}
            startIcon={<LayersIcon sx={{ fontSize: 14 }} />}
          >
            {t("graph.community")}
          </Button>
          {(surprisingConns.filter((c) => !dismissedInsights.has(c.key)).length > 0 || knowledgeGaps.length > 0) && (
            <Button
              color={showInsights ? "secondary" : "inherit"}
              variant={showInsights ? "contained" : "text"}
              size="small"
              onClick={() => {
                setShowInsights((v) => {
                  if (v) setHighlightedNodes(new Set())
                  return !v
                })
              }}
              sx={{ fontSize: "0.75rem", gap: 0.5, minHeight: 28, textTransform: "none" }}
              startIcon={<LightbulbOutlinedIcon sx={{ fontSize: 14 }} />}
            >
              {t("graph.insights")}
              <Box component="span" sx={{ borderRadius: 1, bgcolor: "action.hover", px: 0.5, fontSize: 10, ml: 0.5 }}>
                {surprisingConns.filter((c) => !dismissedInsights.has(c.key)).length + knowledgeGaps.length}
              </Box>
            </Button>
          )}
          <IconButton size="small" onClick={loadGraph} sx={{ color: "text.secondary" }}>
            <RefreshIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Stack>
      </Stack>

      <Stack direction="row" sx={{ flex: 1, minHeight: 0 }}>
        <Box
          ref={graphContainerRef}
          sx={{
            position: "relative",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            bgcolor: (theme) => (theme.palette.mode === "dark" ? "#020617" : "#f8fafc"),
          }}
        >
          {isResizing ? (
            <Box sx={{ display: "flex", height: 1, alignItems: "center", justifyContent: "center", fontSize: "0.75rem", color: "text.secondary" }}>
              {t("graph.resizing")}
            </Box>
          ) : (
          <ErrorBoundary>
          <SigmaContainer
            key={sigmaKey}
            style={{ width: "100%", height: "100%", background: "transparent" }}
            settings={{
              allowInvalidContainer: true,
              renderEdgeLabels: true,
              defaultEdgeColor: "#cbd5e1",
              defaultNodeColor: "#94a3b8",
              labelSize: 13,
              labelWeight: "bold",
              labelColor: { color: "#1e293b" },
              labelDensity: 0.4,
              labelRenderedSizeThreshold: 6,
              stagePadding: 30,
              nodeReducer: (_node, attrs) => {
                const result = { ...attrs }
                if (attrs.insightHighlight) {
                  result.size = (attrs.size ?? BASE_NODE_SIZE) * 1.5
                  result.zIndex = 10
                  result.forceLabel = true
                }
                if (attrs.hovering) {
                  result.size = (attrs.size ?? BASE_NODE_SIZE) * 1.4
                  result.zIndex = 10
                  result.forceLabel = true
                }
                if (attrs.dimmed) {
                  result.color = mixColor(attrs.color ?? "#94a3b8", "#e2e8f0", 0.75)
                  result.label = ""
                  result.size = (attrs.size ?? BASE_NODE_SIZE) * 0.6
                }
                return result
              },
              edgeReducer: (_edge, attrs) => {
                const result = { ...attrs }
                if (attrs.dimmed) {
                  result.color = "#f1f5f9"
                  result.size = 0.3
                }
                if (attrs.highlighted) {
                  const w = attrs.weight ?? 1
                  result.color = "#1e293b"
                  result.size = Math.max(2, (attrs.size ?? 1) * 1.5)
                  result.label = `${t("graph.relevance")}${w.toFixed(1)}`
                  result.forceLabel = true
                }
                return result
              },
            }}
          >
            <GraphLoader nodes={nodes} edges={edges} colorMode={colorMode} />
            <EventHandler onNodeClick={handleNodeClick} />
            <HighlightManager highlightedNodes={highlightedNodes} />
            <ZoomControls />
          </SigmaContainer>
          </ErrorBoundary>
          )}

          <Box
            sx={{
              position: "absolute",
              bottom: 12,
              left: 12,
              maxWidth: 260,
              borderRadius: 2,
              border: 1,
              borderColor: "divider",
              px: 1.5,
              py: 1,
              fontSize: "0.75rem",
              boxShadow: 1,
              bgcolor: (theme) => alpha(theme.palette.background.paper, 0.92),
              backdropFilter: "blur(8px)",
            }}
          >
            {colorMode === "type" ? (
              <>
                <Typography variant="caption" sx={{ display: "block", mb: 0.75, color: "text.primary", fontWeight: 600 }}>
                  {t("graph.nodeTypes")}
                </Typography>
                <Stack spacing={0.25}>
                  {NODE_TYPES
                    .filter((type) => (typeCounts[type] ?? 0) > 0)
                    .map((type) => (
                      <Stack
                        key={type}
                        direction="row"
                        spacing={1}
                        onMouseEnter={() => setHoveredType(type)}
                        onMouseLeave={() => setHoveredType(null)}
                        sx={{ alignItems: "center", borderRadius: 1, px: 0.5, py: 0.25, "&:hover": { bgcolor: "action.hover" }, cursor: "default" }}
                      >
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            flexShrink: 0,
                            bgcolor: NODE_TYPE_COLORS[type],
                            boxShadow: `0 0 4px ${hexToRgba(NODE_TYPE_COLORS[type] ?? "#94a3b8", 0.4)}`,
                          }}
                        />
                        <Typography variant="caption" sx={{ color: hoveredType === type ? "text.primary" : "text.secondary", fontWeight: hoveredType === type ? 600 : 400 }}>
                          {t(`graph.${type}`)}
                        </Typography>
                        <Typography variant="caption" sx={{ ml: "auto", color: "text.secondary", opacity: 0.7 }}>
                          {typeCounts[type]}
                        </Typography>
                      </Stack>
                    ))}
                </Stack>
              </>
            ) : (
              <>
                <Typography variant="caption" sx={{ display: "block", mb: 0.75, color: "text.primary", fontWeight: 600 }}>
                  {t("graph.communities")}
                </Typography>
                <Stack spacing={0.25}>
                  {communities.map((c) => (
                    <Stack key={c.id} direction="row" spacing={1} sx={{ alignItems: "center", borderRadius: 1, px: 0.5, py: 0.25, "&:hover": { bgcolor: "action.hover" } }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          flexShrink: 0,
                          bgcolor: COMMUNITY_COLORS[c.id % COMMUNITY_COLORS.length],
                          boxShadow: `0 0 4px ${hexToRgba(COMMUNITY_COLORS[c.id % COMMUNITY_COLORS.length], 0.4)}`,
                        }}
                      />
                      <Typography variant="caption" color="text.secondary" noWrap title={c.topNodes.join(", ")} sx={{ flex: 1, minWidth: 0 }}>
                        {c.topNodes[0] ?? t("graph.cluster", { id: c.id })}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.7, flexShrink: 0 }}>
                        {c.nodeCount}
                      </Typography>
                      {c.cohesion < 0.15 && c.nodeCount >= 3 && (
                        <Typography component="span" variant="caption" color="warning.main" sx={{ flexShrink: 0 }} title={t("graph.lowCohesion", { value: c.cohesion.toFixed(2) })}>
                          !
                        </Typography>
                      )}
                    </Stack>
                  ))}
                </Stack>
              </>
            )}
          </Box>
        </Box>

        {showInsights && (
          <Box sx={{ width: 320, flexShrink: 0, borderLeft: 1, borderColor: "divider", bgcolor: "background.paper", overflowY: "auto" }}>
            <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <LightbulbOutlinedIcon sx={{ fontSize: 18, color: "warning.main" }} />
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{t("graph.insights")}</Typography>
                </Stack>
                <IconButton
                  size="small"
                  onClick={() => {
                    setShowInsights(false)
                    setHighlightedNodes(new Set())
                  }}
                  sx={{ color: "text.secondary" }}
                >
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Stack>
            </Box>

            <Stack spacing={2} sx={{ p: 1.5 }}>
              {surprisingConns.filter((c) => !dismissedInsights.has(c.key)).length > 0 && (
                <Box>
                  <Stack direction="row" spacing={0.75} sx={{ mb: 1, alignItems: "center" }}>
                    <InsertLinkOutlinedIcon sx={{ fontSize: 16, color: "primary.main" }} />
                    <Typography variant="caption" sx={{ fontWeight: 600, color: "text.primary" }}>
                      {t("graph.surprisingConnections")}
                    </Typography>
                  </Stack>
                  <Stack spacing={1}>
                    {surprisingConns
                      .filter((conn) => !dismissedInsights.has(conn.key))
                      .map((conn, i) => {
                        const ids = new Set([conn.source.id, conn.target.id])
                        const isActive = highlightedNodes.size === ids.size &&
                          [...ids].every((id) => highlightedNodes.has(id))
                        return (
                          <Box
                            key={i}
                            onClick={() => setHighlightedNodes(isActive ? new Set() : ids)}
                            sx={{
                              borderRadius: 2,
                              border: 1,
                              borderColor: isActive ? "primary.main" : "divider",
                              p: 1.5,
                              fontSize: "0.875rem",
                              cursor: "pointer",
                              bgcolor: isActive ? (theme) => alpha(theme.palette.primary.main, 0.08) : "transparent",
                              "&:hover": { bgcolor: "action.hover" },
                            }}
                          >
                            <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: "flex-start", justifyContent: "space-between" }}>
                              <Typography variant="caption" sx={{ fontWeight: 500, color: "text.primary" }}>
                                {conn.source.label} ↔ {conn.target.label}
                              </Typography>
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDismissedInsights((prev) => new Set([...prev, conn.key]))
                                  if (isActive) setHighlightedNodes(new Set())
                                }}
                                sx={{ color: "text.secondary", "&:hover": { color: "error.main", bgcolor: (theme) => alpha(theme.palette.error.main, 0.12) } }}
                              >
                                <CloseIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                              {conn.reasons.join(", ")}
                            </Typography>
                          </Box>
                        )
                      })}
                  </Stack>
                </Box>
              )}

              {knowledgeGaps.length > 0 && (
                <Box>
                  <Stack direction="row" spacing={0.75} sx={{ mb: 1, alignItems: "center" }}>
                    <WarningAmberIcon sx={{ fontSize: 16, color: "warning.main" }} />
                    <Typography variant="caption" sx={{ fontWeight: 600, color: "text.primary" }}>
                      {t("graph.knowledgeGaps")}
                    </Typography>
                  </Stack>
                  <Stack spacing={1}>
                    {knowledgeGaps.map((gap, i) => {
                      const ids = new Set(gap.nodeIds)
                      const isActive = highlightedNodes.size > 0 &&
                        [...ids].every((id) => highlightedNodes.has(id)) &&
                        [...highlightedNodes].every((id) => ids.has(id))
                      return (
                        <Box
                          key={i}
                          onClick={() => setHighlightedNodes(isActive ? new Set() : ids)}
                          sx={{
                            borderRadius: 2,
                            border: 1,
                            borderColor: isActive ? "warning.main" : "divider",
                            p: 1.5,
                            fontSize: "0.875rem",
                            cursor: "pointer",
                            bgcolor: isActive ? (theme) => alpha(theme.palette.warning.main, 0.08) : "transparent",
                            "&:hover": { bgcolor: "action.hover" },
                          }}
                        >
                          <Typography variant="caption" sx={{ display: "block", mb: 0.5, fontWeight: 500, color: "text.primary" }}>
                            {gap.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                            {gap.description}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1, fontStyle: "italic", opacity: 0.85 }}>
                            {gap.suggestion}
                          </Typography>
                          <Button
                            variant="contained"
                            size="small"
                            sx={{ minHeight: 28, fontSize: "0.75rem", textTransform: "none" }}
                            startIcon={<SearchIcon sx={{ fontSize: 16 }} />}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleResearchClick(gap.title, gap.description, gap.type)
                            }}
                          >
                            {t("graph.deepResearch")}
                          </Button>
                        </Box>
                      )
                    })}
                  </Stack>
                </Box>
              )}
            </Stack>
          </Box>
        )}
      </Stack>

      {researchDialog && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(0,0,0,0.4)",
          }}
        >
          <Box sx={{ width: 480, borderRadius: 2, border: 1, borderColor: "divider", bgcolor: "background.paper", boxShadow: 4 }}>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", borderBottom: 1, borderColor: "divider", px: 2, py: 1.5 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <SearchIcon sx={{ fontSize: 18, color: "primary.main" }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{t("graph.deepResearch")}</Typography>
              </Stack>
              {!researchDialog.loading && (
                <IconButton size="small" onClick={() => setResearchDialog(null)} sx={{ color: "text.secondary" }}>
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              )}
            </Stack>

            {researchDialog.loading ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center", py: 6, color: "text.secondary" }}>
                <CircularProgress size={18} />
                <Typography variant="body2">{t("graph.generatingTopic")}</Typography>
              </Stack>
            ) : (
              <Box sx={{ p: 2 }}>
                <Stack spacing={1} sx={{ mb: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 500 }}>
                    {t("graph.researchTopic")}
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    value={researchDialog.topic}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setResearchDialog((prev) =>
                        prev ? { ...prev, topic: e.target.value } : prev
                      )
                    }
                  />
                </Stack>
                <Stack spacing={1} sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 500 }}>
                    {t("graph.searchQueries")}
                  </Typography>
                  <Stack spacing={0.75}>
                    {researchDialog.queries.map((q, idx) => (
                      <TextField
                        key={idx}
                        size="small"
                        fullWidth
                        value={q}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setResearchDialog((prev) => {
                            if (!prev) return prev
                            const newQueries = [...prev.queries]
                            newQueries[idx] = e.target.value
                            return { ...prev, queries: newQueries }
                          })
                        }
                        sx={{ "& input": { fontSize: "0.75rem" } }}
                      />
                    ))}
                  </Stack>
                </Stack>
                <Stack direction="row" sx={{ justifyContent: "flex-end" }} spacing={1}>
                  <Button variant="outlined" size="small" onClick={() => setResearchDialog(null)} sx={{ textTransform: "none" }}>
                    {t("graph.cancel")}
                  </Button>
                  <Button variant="contained" size="small" onClick={handleResearchConfirm} startIcon={<SearchIcon sx={{ fontSize: 16 }} />} sx={{ textTransform: "none" }}>
                    {t("graph.startResearch")}
                  </Button>
                </Stack>
              </Box>
            )}
          </Box>
        </Box>
      )}

    </Box>
  )
}
