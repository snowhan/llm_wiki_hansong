import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import Tooltip from "@mui/material/Tooltip"
import IconButton from "@mui/material/IconButton"
import SmartToyOutlined from "@mui/icons-material/SmartToyOutlined"
import { useWikiStore } from "@/stores/wiki-store"
import { useTranslation } from "react-i18next"

const VIEW_LABELS: Record<string, string> = {
  sources: "nav.sources",
  search: "nav.search",
  graph: "nav.graph",
  lint: "nav.lint",
  review: "nav.review",
  settings: "nav.settings",
  admin: "nav.admin",
}

export function MainToolbar() {
  const { t } = useTranslation()
  const activeView = useWikiStore((s) => s.activeView)
  const activeTabPath = useWikiStore((s) => s.activeTabPath)
  const project = useWikiStore((s) => s.project)
  const chatExpanded = useWikiStore((s) => s.chatExpanded)
  const setChatExpanded = useWikiStore((s) => s.setChatExpanded)

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

      {/* Right: AI Chat toggle */}
      <Tooltip title={chatExpanded ? t("chat.hidePanel") : t("chat.showPanel")} placement="bottom" enterDelay={400}>
        <IconButton
          size="small"
          onClick={() => setChatExpanded(!chatExpanded)}
          sx={{
            flexShrink: 0,
            width: 28,
            height: 28,
            borderRadius: "8px",
            color: chatExpanded ? "primary.main" : "text.secondary",
            bgcolor: chatExpanded ? "rgba(194, 65, 12, 0.08)" : "transparent",
            border: chatExpanded ? "1px solid" : "1px solid transparent",
            borderColor: chatExpanded ? "rgba(194, 65, 12, 0.25)" : "transparent",
            transition: "all 0.2s ease",
            "&:hover": {
              bgcolor: chatExpanded ? "rgba(194, 65, 12, 0.12)" : "action.hover",
              color: chatExpanded ? "primary.main" : "text.primary",
            },
          }}
        >
          <SmartToyOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
