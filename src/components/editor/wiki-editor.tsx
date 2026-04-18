import "katex/dist/katex.min.css"
import { useRef, useCallback, useEffect, type MouseEvent } from "react"
import Box from "@mui/material/Box"
import { EditorContent } from "@tiptap/react"
import { useTiptap } from "./use-tiptap"
import { useWikiStore } from "@/stores/wiki-store"
import { wikiLinksToMarkdownLinks } from "@/components/ui/markdown-view"
import type { FileNode } from "@/types/wiki"

interface WikiEditorProps {
  content: string
  onSave: (markdown: string) => void
}

/** Recursively find a wiki file by stem name (case-insensitive). */
function findWikiFileByName(nodes: FileNode[], name: string): string | null {
  const lower = name.toLowerCase()
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      const found = findWikiFileByName(node.children, name)
      if (found) return found
    } else if (!node.is_dir) {
      const stem = node.name.replace(/\.md$/i, "").toLowerCase()
      if (stem === lower) return node.path
    }
  }
  return null
}

/**
 * Resolve a link href to a wiki page name.
 * Handles:
 *   - wiki:encoded       (our preprocessing scheme)
 *   - wiki/xxx/name.md   (LLM-generated relative wiki path)
 *   - bare name or name.md (plain relative links without scheme or slash)
 */
function resolveWikiHref(href: string): string | null {
  if (!href) return null
  // Ignore external / email / anchor links
  if (/^https?:\/\/|^mailto:|^#/.test(href)) return null

  // wiki: scheme — from our [[wikilink]] preprocessing
  if (href.startsWith("wiki:")) {
    return decodeURIComponent(href.slice(5)) || null
  }

  // wiki/ relative path — LLM sometimes writes [text](wiki/concepts/name.md)
  if (href.startsWith("wiki/") || href.includes("/wiki/")) {
    const m = href.match(/([^/\\]+?)(?:\.md)?$/)
    return m ? decodeURIComponent(m[1]) : null
  }

  // Bare relative link (no scheme, no leading slash, no dots in path):
  // e.g. [产前筛查](产前筛查) or [foo](foo.md)
  if (!href.includes(":") && !href.startsWith("/") && !href.startsWith("..")) {
    const stem = decodeURIComponent(href.replace(/\.md$/i, ""))
    return stem || null
  }

  return null
}

export function WikiEditor({ content, onSave }: WikiEditorProps) {
  const fileTree = useWikiStore((s) => s.fileTree)
  const navigateInCurrentTab = useWikiStore((s) => s.navigateInCurrentTab)
  const setActiveView = useWikiStore((s) => s.setActiveView)

  // Use refs so the editorProps callback always has fresh values
  // (the TipTap editor is only created once; stale closures would use initial values)
  const fileTreeRef = useRef(fileTree)
  const navigateRef = useRef(navigateInCurrentTab)
  const setActiveViewRef = useRef(setActiveView)
  useEffect(() => { fileTreeRef.current = fileTree }, [fileTree])
  useEffect(() => { navigateRef.current = navigateInCurrentTab }, [navigateInCurrentTab])
  useEffect(() => { setActiveViewRef.current = setActiveView }, [setActiveView])

  // Stable ProseMirror-level click handler (created once, uses refs internally)
  const handleEditorClick = useRef((_view: unknown, _pos: unknown, event: MouseEvent) => {
    const target = event.target as HTMLElement
    const link = target.closest("a[href]") as HTMLAnchorElement | null
    if (!link) return false
    const href = link.getAttribute("href") ?? ""
    const pageName = resolveWikiHref(href)
    if (!pageName) return false
    event.preventDefault()
    const filePath = findWikiFileByName(fileTreeRef.current, pageName)
    if (filePath) {
      navigateRef.current(filePath, pageName)
      setActiveViewRef.current("wiki")
    }
    return true
  }).current

  // Pre-process [[wikilinks]] so TipTap renders them as real links
  const prepared = wikiLinksToMarkdownLinks(content)

  const { editor } = useTiptap({
    content: prepared,
    editable: true,
    onUpdate: onSave,
    // ProseMirror-level editorProps — handleClick fires even when mousedown is preventDefault'd
    editorProps: {
      handleClick: handleEditorClick,
    } as Record<string, unknown>,
  })

  // Fallback: React onClick for any clicks that bubble up normally
  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const el = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null
      if (!el) return
      const href = el.getAttribute("href") ?? ""
      const pageName = resolveWikiHref(href)
      if (!pageName) return
      e.preventDefault()
      e.stopPropagation()
      const filePath = findWikiFileByName(fileTree, pageName)
      if (filePath) {
        navigateInCurrentTab(filePath, pageName)
        setActiveView("wiki")
      }
    },
    [fileTree, navigateInCurrentTab, setActiveView],
  )

  return (
    <Box
      onClick={handleClick}
      sx={{
        flex: 1,
        "& .tiptap.ProseMirror": {
          minHeight: 300,
        },
      }}
    >
      <EditorContent editor={editor} />
    </Box>
  )
}
