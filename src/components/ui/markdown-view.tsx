import "katex/dist/katex.min.css"
import { Box, type SxProps, type Theme } from "@mui/material"
import { EditorContent } from "@tiptap/react"
import { useCallback, type MouseEvent } from "react"
import { useTiptap } from "@/components/editor/use-tiptap"
import { splitFrontmatter } from "@/lib/path-utils"

export interface MarkdownViewProps {
  /** Markdown source to render. */
  markdown: string
  /** Called when a `wiki:` link is activated (see wikilink preprocessing). */
  onWikilinkClick?: (path: string) => void
  sx?: SxProps<Theme>
}

/**
 * Convert `[[Page]]` / `[[Page|Label]]` wiki syntax into markdown links using the `wiki:` scheme.
 */
export function wikiLinksToMarkdownLinks(markdown: string): string {
  const src = markdown ?? ""
  return src.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, page: string, alt?: string) => {
    const target = page.trim()
    const label = (alt ?? page).trim()
    return `[${label}](wiki:${encodeURIComponent(target)})`
  })
}

export function MarkdownView({ markdown, onWikilinkClick, sx }: MarkdownViewProps) {
  const { body } = splitFrontmatter(markdown)
  const prepared = wikiLinksToMarkdownLinks(body)

  const { editor } = useTiptap({
    content: prepared,
    editable: false,
  })

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const el = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null
      if (!el) return
      const href = el.getAttribute("href")
      if (!href) return
      const lower = href.toLowerCase()
      if (!lower.startsWith("wiki:")) return
      // Always prevent browser from following wiki: links (they are internal-only)
      e.preventDefault()
      e.stopPropagation()
      if (!onWikilinkClick) return
      const raw = href.slice(href.indexOf(":") + 1)
      onWikilinkClick(decodeURIComponent(raw))
    },
    [onWikilinkClick],
  )

  return (
    <Box
      onClick={handleClick}
      sx={{
        "& .tiptap": {
          outline: "none",
          cursor: "default",
          "& p": { margin: "0.35em 0" },
          "& h1, & h2, & h3": { margin: "0.65em 0 0.3em" },
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
          "& a": {
            color: "primary.main",
            textDecoration: "underline",
            cursor: onWikilinkClick ? "pointer" : "inherit",
          },
        },
        ...sx,
      }}
    >
      <EditorContent editor={editor} />
    </Box>
  )
}
