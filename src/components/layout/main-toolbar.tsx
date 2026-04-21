import { useState } from "react"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import Tooltip from "@mui/material/Tooltip"
import IconButton from "@mui/material/IconButton"
import SmartToyOutlined from "@mui/icons-material/SmartToyOutlined"
import LightMode from "@mui/icons-material/LightMode"
import DarkMode from "@mui/icons-material/DarkMode"
import SettingsBrightness from "@mui/icons-material/SettingsBrightness"
import KeyboardOutlined from "@mui/icons-material/KeyboardOutlined"
import { useColorScheme } from "@mui/material/styles"
import { useWikiStore } from "@/stores/wiki-store"
import { useTranslation } from "react-i18next"
import { KeyboardShortcutsOverlay } from "@/components/keyboard-shortcuts-overlay"
import type { ColorScheme } from "@/stores/wiki-store"

const VIEW_LABELS: Record<string, string> = {
  sources: "nav.sources",
  search: "nav.search",
  graph: "nav.graph",
  lint: "nav.lint",
  settings: "nav.settings",
}

const COLOR_SCHEME_ICONS: Record<ColorScheme, typeof LightMode> = {
  light:  LightMode,
  dark:   DarkMode,
  system: SettingsBrightness,
}

const COLOR_SCHEME_CYCLE: ColorScheme[] = ["light", "dark", "system"]

export function MainToolbar() {
  const { t } = useTranslation()
  const activeView = useWikiStore((s) => s.activeView)
  const activeTabPath = useWikiStore((s) => s.activeTabPath)
  const project = useWikiStore((s) => s.project)
  const chatExpanded = useWikiStore((s) => s.chatExpanded)
  const setChatExpanded = useWikiStore((s) => s.setChatExpanded)
  const colorScheme = useWikiStore((s) => s.colorScheme)
  const setColorScheme = useWikiStore((s) => s.setColorScheme)
  const { setMode } = useColorScheme()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  function cycleColorScheme() {
    const idx = COLOR_SCHEME_CYCLE.indexOf(colorScheme)
    const next = COLOR_SCHEME_CYCLE[(idx + 1) % COLOR_SCHEME_CYCLE.length]
    // Update wiki-store (for icon sync + persistence) AND MUI directly (for immediate visual effect)
    setColorScheme(next)
    setMode(next)
  }

  const ColorSchemeIcon = COLOR_SCHEME_ICONS[colorScheme]
  const colorSchemeLabel = { light: "浅色", dark: "深色", system: "系统" }[colorScheme]

  // Build breadcrumb from activeTabPath (already relative)
  const buildBreadcrumb = (): string[] => {
    if (!activeTabPath || !project) return []
    return activeTabPath.replace(/\\/g, "/").split("/").filter(Boolean)
  }

  const isWikiView = activeView === "wiki"
  const breadcrumb = isWikiView ? buildBreadcrumb() : []
  const viewLabel = !isWikiView ? t(VIEW_LABELS[activeView] ?? activeView) : ""

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 38,
        px: 2,
        flexShrink: 0,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        gap: 1,
      }}
    >
      {/* Left: breadcrumb or view title */}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ flex: 1, minWidth: 0, overflow: "hidden", alignItems: "center" }}
      >
        {isWikiView && breadcrumb.length > 0 ? (
          breadcrumb.map((segment, i) => (
            <Stack key={i} direction="row" spacing={0.5} sx={{ minWidth: 0, flexShrink: i < breadcrumb.length - 1 ? 0 : 1, alignItems: "center" }}>
              {i > 0 && (
                <Typography variant="caption" sx={{ color: "text.tertiary", opacity: 0.5, flexShrink: 0 }}>
                  /
                </Typography>
              )}
              <Typography
                variant="caption"
                noWrap
                sx={{
                  color: i === breadcrumb.length - 1 ? "text.primary" : "text.secondary",
                  fontWeight: i === breadcrumb.length - 1 ? 500 : 400,
                  fontSize: "0.8rem",
                }}
              >
                {segment}
              </Typography>
            </Stack>
          ))
        ) : isWikiView ? (
          <Typography variant="caption" sx={{ color: "text.tertiary", fontSize: "0.8rem" }}>
            {t("editor.noFileOpen")}
          </Typography>
        ) : (
          <Typography
            variant="caption"
            sx={{ color: "text.primary", fontWeight: 600, fontSize: "0.8rem", letterSpacing: "0.01em" }}
          >
            {viewLabel}
          </Typography>
        )}
      </Stack>

      {/* Right: actions */}
      <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0, alignItems: "center" }}>
        {/* Theme toggle */}
        <Tooltip title={`主题: ${colorSchemeLabel} (点击切换)`} placement="bottom" enterDelay={400}>
          <IconButton
            size="small"
            onClick={cycleColorScheme}
            sx={{
              width: 28, height: 28, borderRadius: "6px",
              color: "text.secondary",
              transition: "background-color var(--duration-fast) ease, color var(--duration-fast) ease",
              "&:hover": { bgcolor: "background.sidebarHover", color: "text.primary" },
            }}
          >
            <ColorSchemeIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>

        {/* Keyboard shortcuts help */}
        <Tooltip title="键盘快捷键 (⌘/)" placement="bottom" enterDelay={400}>
          <IconButton
            size="small"
            onClick={() => setShortcutsOpen(true)}
            sx={{
              width: 28, height: 28, borderRadius: "6px",
              color: "text.secondary",
              "&:hover": { bgcolor: "background.sidebarHover", color: "text.primary" },
            }}
          >
            <KeyboardOutlined sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>

        {/* AI Chat toggle */}
        <Tooltip title={chatExpanded ? t("chat.hidePanel") : t("chat.showPanel")} placement="bottom" enterDelay={400}>
          <IconButton
            size="small"
            onClick={() => setChatExpanded(!chatExpanded)}
            sx={{
              width: 28,
              height: 28,
              borderRadius: "6px",
              color: chatExpanded ? "primary.main" : "text.secondary",
              bgcolor: chatExpanded ? "rgba(35,131,226,0.10)" : "transparent",
              transition: "background-color var(--duration-fast) ease",
              "&:hover": { bgcolor: chatExpanded ? "rgba(35,131,226,0.14)" : "background.sidebarHover" },
            }}
          >
            <SmartToyOutlined sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      </Stack>

      <KeyboardShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </Box>
  )
}
