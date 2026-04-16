import "katex/dist/katex.min.css"
import { Box } from "@mui/material"
import { EditorContent } from "@tiptap/react"
import { EditorToolbar } from "./editor-toolbar"
import { useTiptap } from "./use-tiptap"

interface WikiEditorProps {
  content: string
  onSave: (markdown: string) => void
}

export function WikiEditor({ content, onSave }: WikiEditorProps) {
  const { editor } = useTiptap({
    content,
    editable: true,
    onUpdate: onSave,
  })

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 320,
        bgcolor: "#fff",
      }}
    >
      <EditorToolbar editor={editor} />
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          px: 2,
          py: 1.5,
          "& .tiptap": {
            outline: "none",
            minHeight: 280,
            "& p": { margin: "0.5em 0" },
            "& h1, & h2, & h3": { margin: "0.75em 0 0.35em" },
            "& pre": {
              backgroundColor: "action.hover",
              borderRadius: 1,
              padding: 1,
              overflow: "auto",
            },
            "& blockquote": {
              borderLeft: "3px solid",
              borderColor: "divider",
              marginLeft: 0,
              paddingLeft: 2,
              color: "text.secondary",
            },
            "& img": { maxWidth: "100%", height: "auto" },
            "& table": {
              borderCollapse: "collapse",
              width: "100%",
            },
            "& th, & td": {
              border: "1px solid",
              borderColor: "divider",
              padding: "6px 8px",
            },
          },
        }}
      >
        <EditorContent editor={editor} />
      </Box>
    </Box>
  )
}
