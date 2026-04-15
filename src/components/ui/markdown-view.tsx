import { useMemo, useCallback, type MouseEvent } from "react"
import { renderMarkdown } from "@/lib/markdown-renderer"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"
import { cn } from "@/lib/utils"
import "@/styles/markdown-theme.css"
import "katex/dist/katex.min.css"
import "highlight.js/styles/github-dark.min.css"

interface MarkdownViewProps {
  content: string
  className?: string
  enableWikilinks?: boolean
}

export function MarkdownView({ content, className, enableWikilinks = false }: MarkdownViewProps) {
  const project = useWikiStore((s) => s.project)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setFileContent = useWikiStore((s) => s.setFileContent)

  const html = useMemo(() => renderMarkdown(content), [content])

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
      className={cn("md-rendered", className)}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  )
}
