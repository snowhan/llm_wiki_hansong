import { useCallback, useEffect, useRef, useState } from "react"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import { alpha, useTheme } from "@mui/material/styles"
import { useWikiStore } from "@/stores/wiki-store"
import { useResearchStore } from "@/stores/research-store"
import { listDirectory } from "@/commands/fs"
import { IconSidebar } from "./icon-sidebar"
import { SidebarPanel } from "./sidebar-panel"
import { ContentArea } from "./content-area"
import { ActivityPanel } from "./activity-panel"
import { ErrorBoundary } from "@/components/error-boundary"
import { MainToolbar } from "./main-toolbar"
import { TabBar } from "./tab-bar"
import { EditorArea } from "./editor-area"
import { ChatPanel } from "@/components/chat/chat-panel"
import { ResearchPanel } from "./research-panel"

interface AppLayoutProps {
  onSwitchProject: () => void
}

export function AppLayout({ onSwitchProject }: AppLayoutProps) {
  const theme = useTheme()
  const project = useWikiStore((s) => s.project)
  const activeView = useWikiStore((s) => s.activeView)
  const chatExpanded = useWikiStore((s) => s.chatExpanded)
  const setFileTree = useWikiStore((s) => s.setFileTree)
  const researchPanelOpen = useResearchStore((s) => s.panelOpen)
  const [leftWidth, setLeftWidth] = useState(240)
  const [chatWidth, setChatWidth] = useState(380)
  const [researchWidth, setResearchWidth] = useState(320)
  const isDraggingLeft = useRef(false)
  const isDraggingChat = useRef(false)
  const isDraggingResearch = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const loadFileTree = useCallback(async () => {
    if (!project) return
    try {
      const tree = await listDirectory(project.id)
      setFileTree(tree)
    } catch (err) {
      console.error("Failed to load file tree:", err)
    }
  }, [project, setFileTree])

  useEffect(() => {
    loadFileTree()
  }, [loadFileTree])

  const startDrag = useCallback(
    (side: "left" | "chat" | "research") => (e: React.MouseEvent) => {
      e.preventDefault()
      if (side === "left") isDraggingLeft.current = true
      else if (side === "chat") isDraggingChat.current = true
      else isDraggingResearch.current = true
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      document.body.dataset.panelResizing = "true"

      const handleMouseMove = (e: MouseEvent) => {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()

        if (isDraggingLeft.current) {
          const newWidth = e.clientX - rect.left
          setLeftWidth(Math.max(180, Math.min(400, newWidth)))
        }
        if (isDraggingChat.current) {
          const newWidth = rect.right - e.clientX
          setChatWidth(Math.max(300, Math.min(rect.width * 0.5, newWidth)))
        }
        if (isDraggingResearch.current) {
          const newWidth = rect.right - e.clientX
          setResearchWidth(Math.max(280, Math.min(rect.width * 0.45, newWidth)))
        }
      }

      const handleMouseUp = () => {
        isDraggingLeft.current = false
        isDraggingChat.current = false
        isDraggingResearch.current = false
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        delete document.body.dataset.panelResizing
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
        // Also listen on window so that mouseup outside the browser window clears drag state
        window.removeEventListener("blur", handleMouseUp)
      }

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      // Clear drag state if user alt-tabs or releases mouse outside the window
      window.addEventListener("blur", handleMouseUp)
    },
    []
  )

  const resizeHandleSx = {
    width: "5px",
    flexShrink: 0,
    cursor: "col-resize",
    bgcolor: "transparent",
    position: "relative" as const,
    transition: "background-color 0.2s ease",
    "&::after": {
      content: '""',
      position: "absolute",
      top: 0,
      bottom: 0,
      left: "2px",
      width: "1px",
      bgcolor: theme.palette.divider,
      transition: "all 0.2s ease",
    },
    "&:hover::after": {
      width: "3px",
      left: "1px",
      bgcolor: alpha(theme.palette.primary.main, 0.35),
    },
    "&:active::after": {
      width: "3px",
      left: "1px",
      bgcolor: theme.palette.primary.main,
    },
  } as const

  const isWikiView = activeView === "wiki"

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
        {/* Left sidebar column — same background as icon-sidebar for unified chrome */}
        <Stack
          direction="column"
          sx={{
            flexShrink: 0,
            width: leftWidth,
            overflow: "hidden",
            bgcolor: "background.sidebar",
            borderRight: "1px solid",
            borderColor: "divider",
            transition: `width var(--duration-base) var(--ease-smooth)`,
          }}
        >
          <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <SidebarPanel />
          </Box>
          <ActivityPanel />
        </Stack>

        <Box onMouseDown={startDrag("left")} sx={resizeHandleSx} />

        {/* Main column: toolbar + tabbar + content */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            flex: 1,
            overflow: "hidden",
            bgcolor: "background.default",
          }}
        >
          <MainToolbar />

          {isWikiView && <TabBar />}

          <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <ErrorBoundary>
              {isWikiView ? (
                <EditorArea />
              ) : (
                <ContentArea />
              )}
            </ErrorBoundary>
          </Box>
        </Box>

        {/* AI Chat panel – right side, shown when chatExpanded */}
        {chatExpanded && (
          <>
            <Box onMouseDown={startDrag("chat")} sx={resizeHandleSx} />
            <Box
              sx={{
                flexShrink: 0,
                width: chatWidth,
                overflow: "hidden",
                bgcolor: "background.paper",
                borderLeft: "1px solid",
                borderColor: "divider",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <ErrorBoundary>
                <ChatPanel />
              </ErrorBoundary>
            </Box>
          </>
        )}

        {/* Deep Research panel – right side, shown when researchPanelOpen */}
        {researchPanelOpen && (
          <>
            <Box onMouseDown={startDrag("research")} sx={resizeHandleSx} />
            <Box
              sx={{
                flexShrink: 0,
                width: researchWidth,
                overflow: "hidden",
                bgcolor: "background.paper",
                borderLeft: "1px solid",
                borderColor: "divider",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <ErrorBoundary>
                <ResearchPanel />
              </ErrorBoundary>
            </Box>
          </>
        )}
      </Box>
    </Box>
  )
}
