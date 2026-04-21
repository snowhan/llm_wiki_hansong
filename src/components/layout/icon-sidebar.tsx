import { useState } from "react"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Tooltip from "@mui/material/Tooltip"
import IconButton from "@mui/material/IconButton"
import Badge from "@mui/material/Badge"
import AutoStoriesIcon from "@mui/icons-material/AutoStories"
import Description from "@mui/icons-material/Description"
import FolderOpen from "@mui/icons-material/FolderOpen"
import Search from "@mui/icons-material/Search"
import AccountTree from "@mui/icons-material/AccountTree"
import CheckCircleOutlineOutlined from "@mui/icons-material/CheckCircleOutlineOutlined"
import BugReport from "@mui/icons-material/BugReport"
import Explore from "@mui/icons-material/Explore"
import Settings from "@mui/icons-material/Settings"
import SwapHoriz from "@mui/icons-material/SwapHoriz"
import AccountCircleIcon from "@mui/icons-material/AccountCircle"
import LoginIcon from "@mui/icons-material/Login"
import type { SvgIconProps } from "@mui/material/SvgIcon"
import { useWikiStore } from "@/stores/wiki-store"
import { useResearchStore } from "@/stores/research-store"
import { useAuthStore } from "@/stores/auth-store"
import { useTranslation } from "react-i18next"
import type { WikiState } from "@/stores/wiki-store"
import { AuthModal } from "@/components/auth/AuthModal"

type NavIcon = React.ComponentType<SvgIconProps>
type NavView = WikiState["activeView"]
type MinRole = "anonymous" | "member" | "admin"

interface NavItem {
  view: NavView
  icon: NavIcon
  labelKey: string
  minRole: MinRole
}

const NAV_ITEMS: NavItem[] = [
  { view: "wiki",      icon: Description,                labelKey: "nav.wiki",     minRole: "anonymous" },
  { view: "sources",   icon: FolderOpen,                 labelKey: "nav.sources",  minRole: "member"    },
  { view: "search",    icon: Search,                     labelKey: "nav.search",   minRole: "anonymous" },
  { view: "graph",     icon: AccountTree,                labelKey: "nav.graph",    minRole: "anonymous" },
  { view: "lint",      icon: CheckCircleOutlineOutlined, labelKey: "nav.lint",     minRole: "admin"     },
  { view: "llm-debug", icon: BugReport,                  labelKey: "nav.llmDebug", minRole: "admin"     },
]

function hasAccess(userRole: string | undefined, minRole: MinRole): boolean {
  if (minRole === "anonymous") return true
  if (!userRole) return false
  if (minRole === "member") return userRole === "member" || userRole === "admin"
  if (minRole === "admin") return userRole === "admin"
  return false
}

interface IconSidebarProps {
  onSwitchProject: () => void
}

export function IconSidebar({ onSwitchProject }: IconSidebarProps) {
  const { t } = useTranslation()
  const activeView = useWikiStore((s) => s.activeView)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const researchPanelOpen = useResearchStore((s) => s.panelOpen)
  const researchActiveCount = useResearchStore((s) => s.tasks.filter((t) => t.status !== "done" && t.status !== "error").length)
  const toggleResearchPanel = useResearchStore((s) => s.setPanelOpen)

  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [authModalOpen, setAuthModalOpen] = useState(false)

  const visibleNavItems = NAV_ITEMS.filter((item) => hasAccess(user?.role, item.minRole))
  const showSettings = hasAccess(user?.role, "admin")

  // Notion-style nav button: minimal, content-first
  const navBtnSx = (active: boolean) => ({
    position: "relative" as const,
    width: 32,
    height: 32,
    borderRadius: "6px",
    color: active ? "text.primary" : "text.secondary",
    bgcolor: active ? "rgba(35,131,226,0.10)" : "transparent",
    transition: `background-color var(--duration-fast) ease, color var(--duration-fast) ease`,
    // Active left-edge indicator
    "&::before": active ? {
      content: '""',
      position: "absolute",
      left: -8,
      top: "50%",
      transform: "translateY(-50%)",
      width: 2,
      height: 16,
      borderRadius: "0 2px 2px 0",
      bgcolor: "primary.main",
    } : {},
    "&:hover": {
      bgcolor: active ? "rgba(35,131,226,0.14)" : "background.sidebarHover",
      color: "text.primary",
    },
  })

  const utilBtnSx = {
    width: 32,
    height: 32,
    borderRadius: "6px",
    color: "text.secondary",
    transition: `background-color var(--duration-fast) ease, color var(--duration-fast) ease`,
    "&:hover": { bgcolor: "background.sidebarHover", color: "text.primary" },
  }

  return (
    <>
      <Stack
        direction="column"
        sx={{
          alignItems: "center",
          height: "100%",
          width: 48,
          flexShrink: 0,
          bgcolor: "background.sidebar",
          py: 1.5,
          gap: 0,
          // Right border matches divider color (subtle 1px line)
          borderRight: "1px solid",
          borderColor: "divider",
        }}
      >
        {/* Logo */}
        <Box sx={{ mb: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: "6px",
              bgcolor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(35,131,226,0.3)",
              flexShrink: 0,
            }}
          >
            <AutoStoriesIcon sx={{ fontSize: 15, color: "#fff" }} />
          </Box>
        </Box>

        {/* Nav items */}
        <Stack direction="column" spacing={0.25} sx={{ alignItems: "center", flex: 1, width: "100%" }}>
          {visibleNavItems.map(({ view, icon: Icon, labelKey }) => (
            <Tooltip key={view} title={t(labelKey)} placement="right" enterDelay={400}>
              <Box sx={{ position: "relative" }}>
                <IconButton
                  size="small"
                  onClick={() => setActiveView(view)}
                  sx={navBtnSx(activeView === view)}
                >
                  <Icon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            </Tooltip>
          ))}

          {/* Divider */}
          <Box sx={{ width: 14, height: "1px", bgcolor: "divider", my: 1, flexShrink: 0 }} />

          {/* Deep Research */}
          <Tooltip title={t("iconSidebar.deepResearch")} placement="right" enterDelay={400}>
            <Box sx={{ position: "relative" }}>
              <IconButton
                size="small"
                onClick={() => toggleResearchPanel(!researchPanelOpen)}
                sx={navBtnSx(researchPanelOpen)}
              >
                <Explore sx={{ fontSize: 16 }} />
              </IconButton>
              {researchActiveCount > 0 && (
                <Box
                  component="span"
                  sx={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    minWidth: 14,
                    height: 14,
                    px: 0.25,
                    borderRadius: "999px",
                    bgcolor: "primary.main",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1,
                    pointerEvents: "none",
                    boxShadow: "0 0 0 2px",
                    boxShadowColor: "background.sidebar",
                  }}
                >
                  {researchActiveCount}
                </Box>
              )}
            </Box>
          </Tooltip>
        </Stack>

        {/* Bottom utilities */}
        <Stack direction="column" spacing={0.25} sx={{ alignItems: "center", pb: 0.5, width: "100%" }}>
          {showSettings && (
            <Tooltip title={t("nav.settings")} placement="right" enterDelay={400}>
              <IconButton
                size="small"
                onClick={() => setActiveView("settings")}
                sx={navBtnSx(activeView === "settings")}
              >
                <Badge
                  color="error"
                  variant="dot"
                  invisible
                  sx={{ "& .MuiBadge-badge": { right: 2, top: 2 } }}
                >
                  <Settings sx={{ fontSize: 16 }} />
                </Badge>
              </IconButton>
            </Tooltip>
          )}

          {user ? (
            <Tooltip
              title={`${user.username} (${t(`userMenu.role.${user.role}`)}) · ${t("auth.logout")}`}
              placement="right"
              enterDelay={400}
            >
              <IconButton size="small" onClick={() => logout()} sx={utilBtnSx}>
                <AccountCircleIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title={t("auth.login")} placement="right" enterDelay={400}>
              <IconButton
                size="small"
                onClick={(e) => { (e.currentTarget as HTMLElement).blur(); setAuthModalOpen(true) }}
                sx={utilBtnSx}
              >
                <LoginIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title={t("nav.switchProject")} placement="right" enterDelay={400}>
            <IconButton size="small" onClick={onSwitchProject} sx={utilBtnSx}>
              <SwapHoriz sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </>
  )
}
