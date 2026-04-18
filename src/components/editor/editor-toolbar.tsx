import FormatAlignCenter from "@mui/icons-material/FormatAlignCenter"
import FormatAlignLeft from "@mui/icons-material/FormatAlignLeft"
import FormatAlignRight from "@mui/icons-material/FormatAlignRight"
import FormatBold from "@mui/icons-material/FormatBold"
import FormatItalic from "@mui/icons-material/FormatItalic"
import FormatListBulleted from "@mui/icons-material/FormatListBulleted"
import FormatListNumbered from "@mui/icons-material/FormatListNumbered"
import FormatQuote from "@mui/icons-material/FormatQuote"
import FormatStrikethrough from "@mui/icons-material/FormatStrikethrough"
import FormatUnderlined from "@mui/icons-material/FormatUnderlined"
import Functions from "@mui/icons-material/Functions"
import HorizontalRule from "@mui/icons-material/HorizontalRule"
import ImageOutlined from "@mui/icons-material/ImageOutlined"
import Looks3 from "@mui/icons-material/Looks3"
import LooksOne from "@mui/icons-material/LooksOne"
import LooksTwo from "@mui/icons-material/LooksTwo"
import Link from "@mui/icons-material/Link"
import Redo from "@mui/icons-material/Redo"
import TableChart from "@mui/icons-material/TableChart"
import TaskAlt from "@mui/icons-material/TaskAlt"
import Undo from "@mui/icons-material/Undo"
import Code from "@mui/icons-material/Code"
import DataObject from "@mui/icons-material/DataObject"
import { Box, Divider, IconButton, Tooltip } from "@mui/material"
import type { Editor } from "@tiptap/core"

export interface EditorToolbarProps {
  editor: Editor | null
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const disabled = !editor || editor.isDestroyed

  const run = (fn: () => boolean) => {
    if (disabled) return
    fn()
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 0.25,
        px: 1,
        py: 0.5,
        bgcolor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Tooltip title="Bold">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("bold") ? "primary" : "default"}
            onClick={() => run(() => editor!.chain().focus().toggleBold().run())}
          >
            <FormatBold fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Italic">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("italic") ? "primary" : "default"}
            onClick={() => run(() => editor!.chain().focus().toggleItalic().run())}
          >
            <FormatItalic fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Underline">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("underline") ? "primary" : "default"}
            onClick={() => run(() => editor!.chain().focus().toggleUnderline().run())}
          >
            <FormatUnderlined fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Strikethrough">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("strike") ? "primary" : "default"}
            onClick={() => run(() => editor!.chain().focus().toggleStrike().run())}
          >
            <FormatStrikethrough fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Inline code">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("code") ? "primary" : "default"}
            onClick={() => run(() => editor!.chain().focus().toggleCode().run())}
          >
            <Code fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, alignSelf: "stretch" }} />

      <Tooltip title="Heading 1">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("heading", { level: 1 }) ? "primary" : "default"}
            onClick={() =>
              run(() => editor!.chain().focus().toggleHeading({ level: 1 }).run())
            }
          >
            <LooksOne fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Heading 2">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("heading", { level: 2 }) ? "primary" : "default"}
            onClick={() =>
              run(() => editor!.chain().focus().toggleHeading({ level: 2 }).run())
            }
          >
            <LooksTwo fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Heading 3">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("heading", { level: 3 }) ? "primary" : "default"}
            onClick={() =>
              run(() => editor!.chain().focus().toggleHeading({ level: 3 }).run())
            }
          >
            <Looks3 fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, alignSelf: "stretch" }} />

      <Tooltip title="Bullet list">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("bulletList") ? "primary" : "default"}
            onClick={() => run(() => editor!.chain().focus().toggleBulletList().run())}
          >
            <FormatListBulleted fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Ordered list">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("orderedList") ? "primary" : "default"}
            onClick={() => run(() => editor!.chain().focus().toggleOrderedList().run())}
          >
            <FormatListNumbered fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Task list">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("taskList") ? "primary" : "default"}
            onClick={() => run(() => editor!.chain().focus().toggleTaskList().run())}
          >
            <TaskAlt fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, alignSelf: "stretch" }} />

      <Tooltip title="Link">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("link") ? "primary" : "default"}
            onClick={() => {
              if (disabled || !editor) return
              const prev = editor.getAttributes("link").href as string | undefined
              const href = window.prompt("Link URL", prev ?? "https://")
              if (href === null) return
              if (href === "") {
                editor.chain().focus().unsetLink().run()
                return
              }
              editor.chain().focus().extendMarkRange("link").setLink({ href }).run()
            }}
          >
            <Link fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Image">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            onClick={() => {
              if (disabled || !editor) return
              const src = window.prompt("Image URL")
              if (!src) return
              editor.chain().focus().setImage({ src }).run()
            }}
          >
            <ImageOutlined fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Table">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            onClick={() =>
              run(() =>
                editor!.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
              )
            }
          >
            <TableChart fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Horizontal rule">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            onClick={() => run(() => editor!.chain().focus().setHorizontalRule().run())}
          >
            <HorizontalRule fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Code block">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("codeBlock") ? "primary" : "default"}
            onClick={() => run(() => editor!.chain().focus().toggleCodeBlock().run())}
          >
            <DataObject fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Quote">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("blockquote") ? "primary" : "default"}
            onClick={() => run(() => editor!.chain().focus().toggleBlockquote().run())}
          >
            <FormatQuote fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Math block">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive("blockMath") ? "primary" : "default"}
            onClick={() => {
              if (disabled || !editor) return
              const latex = window.prompt("LaTeX", "E = mc^2")
              if (latex === null) return
              editor.chain().focus().insertBlockMath({ latex }).run()
            }}
          >
            <Functions fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, alignSelf: "stretch" }} />

      <Tooltip title="Align left">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive({ textAlign: "left" }) ? "primary" : "default"}
            onClick={() => run(() => editor!.chain().focus().setTextAlign("left").run())}
          >
            <FormatAlignLeft fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Align center">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive({ textAlign: "center" }) ? "primary" : "default"}
            onClick={() => run(() => editor!.chain().focus().setTextAlign("center").run())}
          >
            <FormatAlignCenter fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Align right">
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            color={editor?.isActive({ textAlign: "right" }) ? "primary" : "default"}
            onClick={() => run(() => editor!.chain().focus().setTextAlign("right").run())}
          >
            <FormatAlignRight fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, alignSelf: "stretch" }} />

      <Tooltip title="Undo">
        <span>
          <IconButton
            size="small"
            disabled={disabled || !editor?.can().undo()}
            onClick={() => run(() => editor!.chain().focus().undo().run())}
          >
            <Undo fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Redo">
        <span>
          <IconButton
            size="small"
            disabled={disabled || !editor?.can().redo()}
            onClick={() => run(() => editor!.chain().focus().redo().run())}
          >
            <Redo fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  )
}
