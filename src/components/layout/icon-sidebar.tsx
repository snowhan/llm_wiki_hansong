import { useState } from "react"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Tooltip from "@mui/material/Tooltip"
import IconButton from "@mui/material/IconButton"
import Badge from "@mui/material/Badge"
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
import logoImg from "@/assets/logo.png"
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
  { view: "wiki",      icon: Description,               labelKey: "nav.wiki",     minRole: "anonymous" },
  { view: "sources",   icon: FolderOpen,                labelKey: "nav.sources",  minRole: "member"    },
  { view: "search",    icon: Search,                    labelKey: "nav.search",   minRole: "anonymous" },
  { view: "graph",     icon: AccountTree,               labelKey: "nav.graph",    minRole: "anonymous" },
  { view: "lint",      icon: CheckCircleOutlineOutlined,  labelKey: "nav.lint",    minRole: "admin"     },
  { view: "llm-debug", icon: BugReport,                 labelKey: "nav.llmDebug", minRole: "admin"     },
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

  return (
    <>
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
            sx={{ height: 34, width: 34, borderRadius: "10px", objectFit: "cover" }}
          />
        </Box>

        <Stack direction="column" spacing={0.5} sx={{ alignItems: "center", flex: 1, width: "100%" }}>
          {visibleNavItems.map(({ view, icon: Icon, labelKey }) => (
            <Tooltip key={view} title={t(labelKey)} placement="right" enterDelay={300}>
              <Box sx={{ position: "relative" }}>
                <IconButton
                  size="small"
                  onClick={() => setActiveView(view)}
                  sx={navButtonSx(activeView === view)}
                >
                  <Icon sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            </Tooltip>
          ))}

          <Box sx={{ width: 16, height: "1px", bgcolor: "rgba(245,243,239,0.08)", my: 1.5, flexShrink: 0 }} />

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
                <Box component="span" sx={{
                  position: "absolute", top: 0, right: 0,
                  minWidth: 15, height: 15, px: 0.25, borderRadius: "999px",
                  bgcolor: "#0369A1", color: "#fff", fontSize: 9, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  lineHeight: 1, pointerEvents: "none", boxShadow: "0 0 0 2px #141218",
                }}>
                  {researchActiveCount}
                </Box>
              )}
            </Box>
          </Tooltip>
        </Stack>

        <Stack direction="column" spacing={0.5} sx={{ alignItems: "center", pb: 0.5, width: "100%" }}>
          {showSettings && (
            <Tooltip title={t("nav.settings")} placement="right" enterDelay={300}>
              <IconButton
                size="small"
                onClick={() => setActiveView("settings")}
                sx={navButtonSx(activeView === "settings")}
              >
                <Badge
                  color="error"
                  variant="dot"
                  invisible={true}
                  sx={{ "& .MuiBadge-badge": { right: 2, top: 2 } }}
                >
                  <Settings sx={{ fontSize: 18 }} />
                </Badge>
              </IconButton>
            </Tooltip>
          )}

          {/* Login / User avatar button */}
          {user ? (
            <Tooltip
              title={`${user.username} (${t(`userMenu.role.${user.role}`)}) · ${t("auth.logout")}`}
              placement="right"
              enterDelay={300}
            >
              <IconButton
                size="small"
                onClick={() => logout()}
                sx={{
                  width: 36, height: 36, borderRadius: "10px",
                  color: "rgba(245,243,239,0.6)",
                  "&:hover": { bgcolor: "rgba(245,243,239,0.06)", color: "#F5F3EF" },
                }}
              >
                <AccountCircleIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title={t("auth.login")} placement="right" enterDelay={300}>
              <IconButton
                size="small"
                onClick={(e) => { (e.currentTarget as HTMLElement).blur(); setAuthModalOpen(true) }}
                sx={{
                  width: 36, height: 36, borderRadius: "10px",
                  color: "rgba(245,243,239,0.5)",
                  "&:hover": { bgcolor: "rgba(245,243,239,0.06)", color: "#F5F3EF" },
                }}
              >
                <LoginIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title={t("nav.switchProject")} placement="right" enterDelay={300}>
            <IconButton
              size="small"
              onClick={onSwitchProject}
              sx={{
                width: 36, height: 36, borderRadius: "10px",
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

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </>
  )
}
