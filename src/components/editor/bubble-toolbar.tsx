import { useCallback } from "react"
import { BubbleMenu } from "@tiptap/extension-bubble-menu"
import type { Editor } from "@tiptap/react"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import Divider from "@mui/material/Divider"
import Tooltip from "@mui/material/Tooltip"
import FormatBold from "@mui/icons-material/FormatBold"
import FormatItalic from "@mui/icons-material/FormatItalic"
import FormatUnderlined from "@mui/icons-material/FormatUnderlined"
import StrikethroughS from "@mui/icons-material/StrikethroughS"
import Code from "@mui/icons-material/Code"
import Link from "@mui/icons-material/Link"
import FormatQuote from "@mui/icons-material/FormatQuote"
import FormatColorText from "@mui/icons-material/FormatColorText"
import AutoAwesome from "@mui/icons-material/AutoAwesome"

const TOOLBAR_SX = {
  display: "flex",
  alignItems: "center",
  gap: 0.25,
  bgcolor: "background.paper",
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "10px",
  px: 0.75,
  py: 0.5,
  boxShadow: 4,
  backdropFilter: "blur(8px)",
  animation: "notion-scale-in 140ms var(--ease-spring) both",
}

const BTN_SX = (active: boolean) => ({
  width: 28,
  height: 28,
  borderRadius: "5px",
  color: active ? "primary.main" : "text.secondary",
  bgcolor: active ? "rgba(35,131,226,0.10)" : "transparent",
  "&:hover": {
    bgcolor: active ? "rgba(35,131,226,0.14)" : "background.sidebarHover",
    color: active ? "primary.main" : "text.primary",
  },
})

interface BubbleToolbarProps {
  editor: Editor
  onAskAI?: (selectedText: string) => void
}

export function BubbleToolbar({ editor, onAskAI }: BubbleToolbarProps) {
  const handleAskAI = useCallback(() => {
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to, " ")
    onAskAI?.(text)
  }, [editor, onAskAI])

  const handleLink = useCallback(() => {
    const url = window.prompt("输入链接地址：", "https://")
    if (url === null) return
    if (url === "") {
      editor.chain().focus().unsetLink().run()
    } else {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }, [editor])

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        duration: [120, 80],
        placement: "top",
        animation: "scale",
        maxWidth: "none",
      }}
    >
      <Box sx={TOOLBAR_SX}>
        {/* Ask AI — premium action */}
        <Tooltip title="AI 助手 (Ask AI)" enterDelay={400}>
          <IconButton
            size="small"
            onClick={handleAskAI}
            sx={{
              ...BTN_SX(false),
              color: "primary.main",
              "&:hover": {
                bgcolor: "rgba(35,131,226,0.10)",
                color: "primary.main",
              },
            }}
          >
            <AutoAwesome sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.25, my: 0.5 }} />

        {/* Text formatting */}
        <Tooltip title="加粗 (⌘B)" enterDelay={400}>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleBold().run()}
            sx={BTN_SX(editor.isActive("bold"))}
          >
            <FormatBold sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="斜体 (⌘I)" enterDelay={400}>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            sx={BTN_SX(editor.isActive("italic"))}
          >
            <FormatItalic sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="下划线 (⌘U)" enterDelay={400}>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            sx={BTN_SX(editor.isActive("underline"))}
          >
            <FormatUnderlined sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="删除线" enterDelay={400}>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            sx={BTN_SX(editor.isActive("strike"))}
          >
            <StrikethroughS sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="行内代码 (⌘E)" enterDelay={400}>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleCode().run()}
            sx={BTN_SX(editor.isActive("code"))}
          >
            <Code sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.25, my: 0.5 }} />

        <Tooltip title="链接 (⌘K)" enterDelay={400}>
          <IconButton
            size="small"
            onClick={handleLink}
            sx={BTN_SX(editor.isActive("link"))}
          >
            <Link sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="引用块" enterDelay={400}>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            sx={BTN_SX(editor.isActive("blockquote"))}
          >
            <FormatQuote sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="高亮" enterDelay={400}>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            sx={BTN_SX(editor.isActive("highlight"))}
          >
            <FormatColorText sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </BubbleMenu>
  )
}
