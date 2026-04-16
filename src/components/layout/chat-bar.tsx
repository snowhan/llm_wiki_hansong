import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import ChatBubbleOutlineOutlined from "@mui/icons-material/ChatBubbleOutlineOutlined"
import KeyboardArrowUp from "@mui/icons-material/KeyboardArrowUp"
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown"
import { useWikiStore } from "@/stores/wiki-store"
import { ChatPanel } from "@/components/chat/chat-panel"

export function ChatBar() {
  const chatExpanded = useWikiStore((s) => s.chatExpanded)
  const setChatExpanded = useWikiStore((s) => s.setChatExpanded)

  if (!chatExpanded) {
    return (
      <Box
        component="button"
        type="button"
        onClick={() => setChatExpanded(true)}
        sx={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: 1,
          borderColor: "divider",
          px: 2,
          py: 1,
          borderLeft: "none",
          borderRight: "none",
          borderBottom: "none",
          background: "none",
          cursor: "pointer",
          font: "inherit",
          fontSize: 14,
          color: "text.secondary",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <Typography component="span" variant="body2" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ChatBubbleOutlineOutlined sx={{ fontSize: 18 }} />
          CHAT
        </Typography>
        <KeyboardArrowUp sx={{ fontSize: 18 }} />
      </Box>
    )
  }

  return (
    <Box sx={{ display: "flex", height: "100%", flexDirection: "column" }}>
      <Box
        component="button"
        type="button"
        onClick={() => setChatExpanded(false)}
        sx={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          px: 2,
          py: 1,
          borderLeft: "none",
          borderRight: "none",
          borderTop: "none",
          background: "none",
          cursor: "pointer",
          font: "inherit",
          fontSize: 14,
          color: "text.secondary",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <Typography component="span" variant="body2" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ChatBubbleOutlineOutlined sx={{ fontSize: 18 }} />
          CHAT
        </Typography>
        <KeyboardArrowDown sx={{ fontSize: 18 }} />
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <ChatPanel />
      </Box>
    </Box>
  )
}
