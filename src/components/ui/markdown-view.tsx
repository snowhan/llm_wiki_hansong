import { useEffect, useRef, useCallback, type MouseEvent } from "react"
import { renderPreview } from "@/lib/markdown-renderer"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"
import { useIsDark } from "@/hooks/use-is-dark"
import { cn } from "@/lib/utils"

interface MarkdownViewProps {
  content: string
  className?: string
  enableWikilinks?: boolean
}

export function MarkdownView({ content, className, enableWikilinks = false }: MarkdownViewProps) {
  const project = useWikiStore((s) => s.project)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setFileContent = useWikiStore((s) => s.setFileContent)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDark = useIsDark()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (!content) {
      el.innerHTML = ""
      return
    }

    let cancelled = false
    renderPreview(el, content, { isDark }).then(() => {
      if (cancelled) return
    })

    return () => { cancelled = true }
  }, [content, isDark])

  const handleClick = useCallback(
    async (e: MouseEvent<HTMLDivElement>) => {
      if (!enableWikilinks || !project) return
      const target = (e.target as HTMLElement).closest("a[data-wikilink]") as HTMLAnchorElement | null
      if (!target) return
      e.preventDefault()
      e.stopPropagation()

      const pageName = target.getAttribute("data-wikilink") ?? ""
      if (!pageName) return

      const pp = normalizePath(project.path)
      const dirs = ["entities", "concepts", "sources", "synthesis", "comparisons", "queries", ""]
      for (const dir of dirs) {
        const tryPath = dir ? `${pp}/wiki/${dir}/${pageName}.md` : `${pp}/wiki/${pageName}.md`
        try {
          const fc = await readFile(tryPath)
          setSelectedFile(tryPath)
          setFileContent(fc)
          return
        } catch {
          // try next
        }
      }
    },
    [project, enableWikilinks, setSelectedFile, setFileContent],
  )

  return (
    <div
      ref={containerRef}
      className={cn(
        "vditor-reset",
        isDark && "vditor-reset--dark",
        className,
      )}
      onClick={handleClick}
    />
  )
}
