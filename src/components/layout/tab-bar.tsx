import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import Close from "@mui/icons-material/Close"
import Add from "@mui/icons-material/Add"
import Description from "@mui/icons-material/Description"
import { useWikiStore, isNewTab } from "@/stores/wiki-store"
import type { TabItem } from "@/stores/wiki-store"

export function TabBar() {
  const openTabs = useWikiStore((s) => s.openTabs)
  const activeTabId = useWikiStore((s) => s.activeTabId)
  const setActiveTab = useWikiStore((s) => s.setActiveTab)
  const closeTab = useWikiStore((s) => s.closeTab)
  const openNewTab = useWikiStore((s) => s.openNewTab)

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "stretch",
        flexShrink: 0,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        height: 36,
        overflowX: "auto",
        "&::-webkit-scrollbar": { height: 0 },
        scrollbarWidth: "none",
      }}
    >
      {openTabs.map((tab) => (
        <Tab
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onActivate={() => setActiveTab(tab.id)}
          onClose={() => closeTab(tab.id)}
        />
      ))}

      {/* + button sits right after the last tab */}
      <Tooltip title="新建标签页" placement="bottom" enterDelay={500}>
        <IconButton
          size="small"
          onClick={openNewTab}
          sx={{
            flexShrink: 0,
            width: 32,
            height: "100%",
            borderRadius: 0,
            color: "text.secondary",
            "&:hover": { color: "text.primary", bgcolor: "action.hover" },
          }}
        >
          <Add sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>

      {/* Spacer so the row fills remaining width without stretching the + button */}
      <Box sx={{ flex: 1, minWidth: 0 }} />
    </Box>
  )
}

interface TabProps {
  tab: TabItem
  isActive: boolean
  onActivate: () => void
  onClose: () => void
}

function Tab({ tab, isActive, onActivate, onClose }: TabProps) {
  const isEmpty = isNewTab(tab.path)

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        pl: 1.5,
        pr: 0.5,
        height: "100%",
        flexShrink: 0,
        maxWidth: 200,
        minWidth: 80,
        cursor: "pointer",
        position: "relative",
        borderRight: "1px solid",
        borderColor: "divider",
        bgcolor: isActive ? "background.paper" : "background.paper2",
        color: isActive ? "text.primary" : "text.secondary",
        transition: "background-color 0.15s ease, color 0.15s ease",
        "&:hover": {
          bgcolor: isActive ? "background.paper" : "action.hover",
          color: "text.primary",
          "& .tab-close-btn": { opacity: 1 },
        },
        "&::before": isActive ? {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "2px",
          bgcolor: "primary.main",
          borderRadius: "0 0 2px 2px",
        } : {},
      }}
      onClick={onActivate}
    >
      <Description sx={{ fontSize: 13, flexShrink: 0, opacity: isEmpty ? 0.3 : 0.6 }} />
      <Typography
        variant="caption"
        noWrap
        sx={{
          flex: 1,
          minWidth: 0,
          fontWeight: isActive ? 600 : 400,
          fontSize: "0.75rem",
          letterSpacing: "0.01em",
          fontStyle: isEmpty ? "italic" : "normal",
          opacity: isEmpty ? 0.6 : 1,
        }}
      >
        {tab.title}
        {tab.isDirty && (
          <Box component="span" sx={{ ml: 0.5, color: "primary.main" }}>●</Box>
        )}
      </Typography>
      <IconButton
        className="tab-close-btn"
        size="small"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        sx={{
          flexShrink: 0,
          width: 18,
          height: 18,
          opacity: 0,
          transition: "opacity 0.15s ease",
          color: "text.secondary",
          "&:hover": { color: "text.primary", bgcolor: "action.hover" },
          borderRadius: "4px",
        }}
      >
        <Close sx={{ fontSize: 11 }} />
      </IconButton>
    </Box>
  )
}
