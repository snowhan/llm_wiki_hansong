import { useState, useEffect } from "react"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Tooltip from "@mui/material/Tooltip"
import IconButton from "@mui/material/IconButton"
import Description from "@mui/icons-material/Description"
import FolderOpen from "@mui/icons-material/FolderOpen"
import Search from "@mui/icons-material/Search"
import AccountTree from "@mui/icons-material/AccountTree"
import CheckCircleOutlineOutlined from "@mui/icons-material/CheckCircleOutlineOutlined"
import FormatListBulleted from "@mui/icons-material/FormatListBulleted"
import Explore from "@mui/icons-material/Explore"
import Settings from "@mui/icons-material/Settings"
import SwapHoriz from "@mui/icons-material/SwapHoriz"
import type { SvgIconProps } from "@mui/material/SvgIcon"
import { useWikiStore } from "@/stores/wiki-store"
import { useReviewStore } from "@/stores/review-store"
import { useResearchStore } from "@/stores/research-store"
import { useTranslation } from "react-i18next"
import logoImg from "@/assets/logo.jpg"
import type { WikiState } from "@/stores/wiki-store"

type NavIcon = React.ComponentType<SvgIconProps>

type NavView = WikiState["activeView"]

const NAV_ITEMS: { view: NavView; icon: NavIcon; labelKey: string }[] = [
  { view: "wiki", icon: Description, labelKey: "nav.wiki" },
  { view: "sources", icon: FolderOpen, labelKey: "nav.sources" },
  { view: "search", icon: Search, labelKey: "nav.search" },
  { view: "graph", icon: AccountTree, labelKey: "nav.graph" },
  { view: "lint", icon: CheckCircleOutlineOutlined, labelKey: "nav.lint" },
  { view: "review", icon: FormatListBulleted, labelKey: "nav.review" },
]

interface IconSidebarProps {
  onSwitchProject: () => void
}

export function IconSidebar({ onSwitchProject }: IconSidebarProps) {
  const { t } = useTranslation()
  const activeView = useWikiStore((s) => s.activeView)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const pendingCount = useReviewStore((s) => s.items.filter((i) => !i.resolved).length)
  const researchPanelOpen = useResearchStore((s) => s.panelOpen)
  const researchActiveCount = useResearchStore((s) => s.tasks.filter((t) => t.status !== "done" && t.status !== "error").length)
  const toggleResearchPanel = useResearchStore((s) => s.setPanelOpen)

  const [daemonStatus, setDaemonStatus] = useState<string>("starting")
  useEffect(() => {
    const check = async () => {
      try {
        const { clipServerStatus } = await import("@/commands/fs")
        const status = await clipServerStatus()
        setDaemonStatus(status)
      } catch {
        setDaemonStatus("error")
      }
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  const navButtonSx = (active: boolean) => ({
    position: "relative",
    width: 40,
    height: 40,
    borderRadius: 1,
    color: active ? "text.primary" : "text.secondary",
    bgcolor: active ? "action.selected" : "transparent",
    "&:hover": {
      bgcolor: active ? "action.selected" : "action.hover",
      color: "text.primary",
    },
  })

  return (
    <Stack
      direction="column"
      sx={{
        alignItems: "center",
        height: "100%",
        width: 48,
        flexShrink: 0,
        borderRight: 1,
        borderColor: "divider",
        bgcolor: (theme) => theme.palette.action.hover,
        py: 1,
      }}
    >
      <Box sx={{ mb: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Box
          component="img"
          src={logoImg}
          alt="LLM Wiki"
          sx={{ height: 32, width: 32, borderRadius: "22%" }}
        />
      </Box>

      <Stack direction="column" spacing={0.5} sx={{ alignItems: "center", flex: 1, width: "100%" }}>
        {NAV_ITEMS.map(({ view, icon: Icon, labelKey }) => (
          <Tooltip key={view} title={<>{t(labelKey)}{view === "review" && pendingCount > 0 ? ` (${pendingCount})` : ""}</>} placement="right" enterDelay={300}>
            <Box sx={{ position: "relative" }}>
              <IconButton
                size="small"
                onClick={() => setActiveView(view)}
                sx={navButtonSx(activeView === view)}
              >
                <Icon sx={{ fontSize: 20 }} />
              </IconButton>
              {view === "review" && pendingCount > 0 && (
                <Box
                  component="span"
                  sx={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    minWidth: 16,
                    height: 16,
                    px: 0.25,
                    borderRadius: "999px",
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1,
                    pointerEvents: "none",
                  }}
                >
                  {pendingCount > 99 ? "99+" : pendingCount}
                </Box>
              )}
            </Box>
          </Tooltip>
        ))}

        <Tooltip title={t("iconSidebar.deepResearch")} placement="right" enterDelay={300}>
          <Box sx={{ position: "relative" }}>
            <IconButton
              size="small"
              onClick={() => toggleResearchPanel(!researchPanelOpen)}
              sx={navButtonSx(researchPanelOpen)}
            >
              <Explore sx={{ fontSize: 20 }} />
            </IconButton>
            {researchActiveCount > 0 && (
              <Box
                component="span"
                sx={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  minWidth: 16,
                  height: 16,
                  px: 0.25,
                  borderRadius: "999px",
                  bgcolor: "info.main",
                  color: "info.contrastText",
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                  pointerEvents: "none",
                }}
              >
                {researchActiveCount}
              </Box>
            )}
          </Box>
        </Tooltip>
      </Stack>

      <Stack direction="column" spacing={0.5} sx={{ alignItems: "center", pb: 0.5, width: "100%" }}>
        <Tooltip
          title={
            <>
              {daemonStatus === "running" && t("iconSidebar.clipRunning")}
              {daemonStatus === "starting" && t("iconSidebar.clipStarting")}
              {daemonStatus === "port_conflict" && t("iconSidebar.clipPortConflict")}
              {daemonStatus === "error" && t("iconSidebar.clipError")}
            </>
          }
          placement="right"
          enterDelay={300}
        >
          <IconButton size="small" sx={{ width: 24, height: 24, p: 0 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                bgcolor:
                  daemonStatus === "running"
                    ? "success.dark"
                    : daemonStatus === "starting"
                      ? "warning.main"
                      : daemonStatus === "port_conflict"
                        ? "error.main"
                        : "error.main",
                animation:
                  daemonStatus === "starting" || (daemonStatus !== "running" && daemonStatus !== "port_conflict")
                    ? "pulse 1.5s ease-in-out infinite"
                    : "none",
                "@keyframes pulse": {
                  "0%, 100%": { opacity: 1 },
                  "50%": { opacity: 0.45 },
                },
              }}
            />
          </IconButton>
        </Tooltip>

        <Tooltip title={t("nav.settings")} placement="right" enterDelay={300}>
          <IconButton
            size="small"
            onClick={() => setActiveView("settings")}
            sx={navButtonSx(activeView === "settings")}
          >
            <Settings sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title={t("nav.switchProject")} placement="right" enterDelay={300}>
          <IconButton
            size="small"
            onClick={onSwitchProject}
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1,
              color: "text.secondary",
              "&:hover": { bgcolor: "action.hover", color: "text.primary" },
            }}
          >
            <SwapHoriz sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  )
}
