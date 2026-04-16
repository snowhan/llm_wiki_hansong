import { useCallback, useEffect, useRef, useState } from "react"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import { alpha, useTheme } from "@mui/material/styles"
import { useWikiStore } from "@/stores/wiki-store"
import { listDirectory } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"
import { IconSidebar } from "./icon-sidebar"
import { SidebarPanel } from "./sidebar-panel"
import { ContentArea } from "./content-area"
import { PreviewPanel } from "./preview-panel"
import { ResearchPanel } from "./research-panel"
import { ActivityPanel } from "./activity-panel"
import { useResearchStore } from "@/stores/research-store"
import { ErrorBoundary } from "@/components/error-boundary"

interface AppLayoutProps {
  onSwitchProject: () => void
}

export function AppLayout({ onSwitchProject }: AppLayoutProps) {
  const theme = useTheme()
  const project = useWikiStore((s) => s.project)
  const selectedFile = useWikiStore((s) => s.selectedFile)
  const researchPanelOpen = useResearchStore((s) => s.panelOpen)
  const setFileTree = useWikiStore((s) => s.setFileTree)
  const [leftWidth, setLeftWidth] = useState(220)
  const [rightWidth, setRightWidth] = useState(400)
  const isDraggingLeft = useRef(false)
  const isDraggingRight = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const loadFileTree = useCallback(async () => {
    if (!project) return
    try {
      const tree = await listDirectory(normalizePath(project.path))
      setFileTree(tree)
    } catch (err) {
      console.error("Failed to load file tree:", err)
    }
  }, [project, setFileTree])

  useEffect(() => {
    loadFileTree()
  }, [loadFileTree])

  const startDrag = useCallback(
    (side: "left" | "right") => (e: React.MouseEvent) => {
      e.preventDefault()
      if (side === "left") isDraggingLeft.current = true
      else isDraggingRight.current = true
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      document.body.dataset.panelResizing = "true"

      const handleMouseMove = (e: MouseEvent) => {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()

        if (isDraggingLeft.current) {
          const newWidth = e.clientX - rect.left
          setLeftWidth(Math.max(150, Math.min(400, newWidth)))
        }
        if (isDraggingRight.current) {
          const newWidth = rect.right - e.clientX
          setRightWidth(Math.max(250, Math.min(rect.width * 0.5, newWidth)))
        }
      }

      const handleMouseUp = () => {
        isDraggingLeft.current = false
        isDraggingRight.current = false
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        delete document.body.dataset.panelResizing
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    },
    []
  )

  const hasRightPanel = !!(selectedFile || researchPanelOpen)

  const resizeHandleSx = {
    width: 6,
    flexShrink: 0,
    cursor: "col-resize",
    bgcolor: alpha(theme.palette.divider, 0.4),
    transition: theme.transitions.create("background-color", { duration: theme.transitions.duration.shorter }),
    "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.3) },
    "&:active": { bgcolor: alpha(theme.palette.primary.main, 0.4) },
  } as const

  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        bgcolor: "background.default",
        color: "text.primary",
      }}
    >
      <IconSidebar onSwitchProject={onSwitchProject} />
      <Box
        ref={containerRef}
        sx={{ display: "flex", minWidth: 0, flex: 1, overflow: "hidden" }}
      >
        <Stack
          direction="column"
          sx={{
            flexShrink: 0,
            width: leftWidth,
            overflow: "hidden",
            borderRight: 1,
            borderColor: "divider",
          }}
        >
          <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <SidebarPanel />
          </Box>
          <ActivityPanel />
        </Stack>
        <Box onMouseDown={startDrag("left")} sx={resizeHandleSx} />

        <Box sx={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
          <ErrorBoundary>
            <ContentArea />
          </ErrorBoundary>
        </Box>

        {hasRightPanel && (
          <>
            <Box onMouseDown={startDrag("right")} sx={resizeHandleSx} />
            <Stack
              direction="column"
              sx={{
                flexShrink: 0,
                width: rightWidth,
                overflow: "hidden",
                borderLeft: 1,
                borderColor: "divider",
              }}
            >
              <ErrorBoundary>
                {selectedFile && (
                  <Box
                    sx={{
                      flex: 1,
                      minHeight: 0,
                      overflow: "hidden",
                      ...(researchPanelOpen ? { borderBottom: 1, borderColor: "divider" } : {}),
                    }}
                  >
                    <PreviewPanel />
                  </Box>
                )}
                {researchPanelOpen && (
                  <Box
                    sx={
                      selectedFile
                        ? { height: "50%", flexShrink: 0, overflow: "hidden" }
                        : { flex: 1, minHeight: 0, overflow: "hidden" }
                    }
                  >
                    <ResearchPanel />
                  </Box>
                )}
              </ErrorBoundary>
            </Stack>
          </>
        )}
      </Box>
    </Box>
  )
}
