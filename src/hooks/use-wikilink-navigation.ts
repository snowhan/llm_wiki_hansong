import { useCallback } from "react"
import { useWikiStore } from "@/stores/wiki-store"
import { listDirectory } from "@/commands/fs"
import type { FileNode } from "@/types/wiki"

/** Recursively find the first file matching `fileName` in a FileNode tree. */
function findFileInTree(nodes: FileNode[], fileName: string): string | null {
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      const found = findFileInTree(node.children, fileName)
      if (found) return found
    } else if (!node.is_dir && node.name === fileName) {
      return node.relativePath
    }
  }
  return null
}

/**
 * Returns an `onWikilinkClick` handler suitable for passing to `MarkdownView`.
 *
 * Navigation strategy (uses `fileTree` from the store when available, with a
 * fallback to a targeted `wiki/sources` scan for namespaced pages):
 * 1. Search the full project `fileTree` (already loaded) for `<slug>.md`
 * 2. Fallback: recursively scan wiki/sources/ tree for <slug>.md
 *
 * On success, opens the page in a **new tab** via `openTab`.
 */
export function useWikilinkNavigation(): (pageName: string) => Promise<void> {
  const project = useWikiStore((s) => s.project)
  const fileTree = useWikiStore((s) => s.fileTree)
  const openTab = useWikiStore((s) => s.openTab)
  const setActiveView = useWikiStore((s) => s.setActiveView)

  return useCallback(
    async (pageName: string) => {
      if (!project) return

      // 1. Search the already-loaded full project fileTree
      const found = findFileInTree(fileTree, `${pageName}.md`)
      if (found) {
        openTab(found, pageName)
        setActiveView("wiki")
        return
      }

      // 2. Fallback: scan wiki/sources/ for namespaced pages not yet in tree
      try {
        const sourcesTree = await listDirectory(project.id, "wiki/sources")
        const foundInSources = findFileInTree(sourcesTree, `${pageName}.md`)
        if (foundInSources) {
          openTab(foundInSources, pageName)
          setActiveView("wiki")
        }
      } catch {
        // not found anywhere — silently ignore
      }
    },
    [project, fileTree, openTab, setActiveView],
  )
}
