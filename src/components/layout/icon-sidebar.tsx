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
import FactCheck from "@mui/icons-material/FactCheck"
import Explore from "@mui/icons-material/Explore"
import Settings from "@mui/icons-material/Settings"
import SwapHoriz from "@mui/icons-material/SwapHoriz"
import AdminPanelSettings from "@mui/icons-material/AdminPanelSettings"
import type { SvgIconProps } from "@mui/material/SvgIcon"
import { useWikiStore } from "@/stores/wiki-store"
import { useReviewStore } from "@/stores/review-store"
import { useResearchStore } from "@/stores/research-store"
import { useHighRiskMappingCount } from "@/stores/mapping-check-store"
import { useTranslation } from "react-i18next"
import logoImg from "@/assets/logo.png"
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
  { view: "mapping-check", icon: FactCheck, labelKey: "nav.mappingCheck" },
]

interface IconSidebarProps {
  onSwitchProject: () => void
}

export function IconSidebar({ onSwitchProject }: IconSidebarProps) {
  const { t } = useTranslation()
  const activeView = useWikiStore((s) => s.activeView)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const pendingCount = useReviewStore((s) => s.items.filter((i) => !i.resolved).length)
  const highRiskMappingCount = useHighRiskMappingCount()
  const researchPanelOpen = useResearchStore((s) => s.panelOpen)
  const researchActiveCount = useResearchStore((s) => s.tasks.filter((t) => t.status !== "done" && t.status !== "error").length)
  const toggleResearchPanel = useResearchStore((s) => s.setPanelOpen)

  const navButtonSx = (active: boolean) => ({
    position: "relative" as const,
    width: 36,
    height: 36,
    borderRadius: "10px",
    color: active ? "#F5F3EF" : "rgba(245,243,239,0.4)",
    bgcolor: active ? "rgba(194, 65, 12, 0.2)" : "transparent",
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    "&::before": active ? {
      content: '""',
      position: "absolute",
      left: -8,
      top: "50%",
      transform: "translateY(-50%)",
      width: 3,
      height: 20,
      borderRadius: "0 3px 3px 0",
      bgcolor: "#C2410C",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    } : {},
    "&:hover": {
      bgcolor: active ? "rgba(194, 65, 12, 0.25)" : "rgba(245,243,239,0.06)",
      color: "#F5F3EF",
    },
  })

  const badgeSx = (color: string) => ({
    position: "absolute" as const,
    top: 0,
    right: 0,
    minWidth: 15,
    height: 15,
    px: 0.25,
    borderRadius: "999px",
    bgcolor: color,
    color: "#fff",
    fontSize: 9,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    pointerEvents: "none" as const,
    boxShadow: "0 0 0 2px #141218",
  })

  return (
    <Stack
      direction="column"
      sx={{
        alignItems: "center",
        height: "100%",
        width: 56,
        flexShrink: 0,
        bgcolor: "#141218",
        py: 1.5,
        gap: 0,
      }}
    >
      <Box sx={{ mb: 2.5, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Box
          component="img"
          src={logoImg}
          alt="LLM Wiki"
          sx={{
            height: 34,
            width: 34,
            borderRadius: "10px",
            objectFit: "cover",
          }}
        />
      </Box>

      <Stack direction="column" spacing={0.5} sx={{ alignItems: "center", flex: 1, width: "100%" }}>
        {NAV_ITEMS.map(({ view, icon: Icon, labelKey }) => (
          <Tooltip
            key={view}
            title={
              <>
                {t(labelKey)}
                {view === "review" && pendingCount > 0 ? ` (${pendingCount})` : ""}
                {view === "mapping-check" && highRiskMappingCount > 0 ? ` (${highRiskMappingCount})` : ""}
              </>
            }
            placement="right"
            enterDelay={300}
          >
            <Box sx={{ position: "relative" }}>
              <IconButton
                size="small"
                onClick={() => setActiveView(view)}
                sx={navButtonSx(activeView === view)}
              >
                <Icon sx={{ fontSize: 18 }} />
              </IconButton>
              {view === "review" && pendingCount > 0 && (
                <Box component="span" sx={badgeSx("#B91C1C")}>
                  {pendingCount > 99 ? "99+" : pendingCount}
                </Box>
              )}
              {view === "mapping-check" && highRiskMappingCount > 0 && (
                <Box component="span" sx={badgeSx("#D97706")}>
                  {highRiskMappingCount > 99 ? "99+" : highRiskMappingCount}
                </Box>
              )}
            </Box>
          </Tooltip>
        ))}

        <Box sx={{ width: 20, height: 1, bgcolor: "rgba(245,243,239,0.06)", my: 1, borderRadius: 1 }} />

        <Tooltip title={t("iconSidebar.deepResearch")} placement="right" enterDelay={300}>
          <Box sx={{ position: "relative" }}>
            <IconButton
              size="small"
              onClick={() => toggleResearchPanel(!researchPanelOpen)}
              sx={navButtonSx(researchPanelOpen)}
            >
              <Explore sx={{ fontSize: 18 }} />
            </IconButton>
            {researchActiveCount > 0 && (
              <Box component="span" sx={badgeSx("#0369A1")}>
                {researchActiveCount}
              </Box>
            )}
          </Box>
        </Tooltip>
      </Stack>

      <Stack direction="column" spacing={0.5} sx={{ alignItems: "center", pb: 0.5, width: "100%" }}>
        <Tooltip title={t("nav.admin")} placement="right" enterDelay={300}>
          <IconButton
            size="small"
            onClick={() => setActiveView("admin")}
            sx={navButtonSx(activeView === "admin")}
          >
            <AdminPanelSettings sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title={t("nav.settings")} placement="right" enterDelay={300}>
          <IconButton
            size="small"
            onClick={() => setActiveView("settings")}
            sx={navButtonSx(activeView === "settings")}
          >
            <Settings sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title={t("nav.switchProject")} placement="right" enterDelay={300}>
          <IconButton
            size="small"
            onClick={onSwitchProject}
            sx={{
              width: 36,
              height: 36,
              borderRadius: "10px",
              color: "rgba(245,243,239,0.4)",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              "&:hover": { bgcolor: "rgba(245,243,239,0.06)", color: "#F5F3EF" },
            }}
          >
            <SwapHoriz sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  )
}
