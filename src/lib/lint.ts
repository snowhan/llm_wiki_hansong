import { readFile, listDirectory } from "@/commands/fs"
import { streamChat } from "@/lib/llm-client"
import type { LlmConfig } from "@/stores/wiki-store"
import type { FileNode } from "@/types/wiki"
import { useActivityStore } from "@/stores/activity-store"
import { getFileName } from "@/lib/path-utils"

export interface LintResult {
  type: "orphan" | "broken-link" | "no-outlinks" | "semantic"
  severity: "warning" | "info"
  page: string
  detail: string
  affectedPages?: string[]
}

// ── helpers ───────────────────────────────────────────────────────────────────

function flattenMdFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      files.push(...flattenMdFiles(node.children))
    } else if (!node.is_dir && node.name.endsWith(".md")) {
      files.push(node)
    }
  }
  return files
}

function extractWikilinks(content: string): string[] {
  const links: string[] = []
  const regex = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim())
  }
  return links
}

function relativeToSlug(relPath: string): string {
  // relPath relative to wiki/ dir, e.g. "entities/foo-bar" or "queries/my-page-2024-01-01"
  return relPath.replace(/\.md$/, "")
}

/** Strip the "wiki/" prefix from a project-relative path to get the wiki-relative path */
function wikiRelative(relativePath: string): string {
  return relativePath.replace(/^wiki\//, "")
}

/** Build a slug → relativePath map from wiki files */
function buildSlugMap(
  wikiFiles: FileNode[],
): Map<string, string> {
  const map = new Map<string, string>()
  for (const f of wikiFiles) {
    // e.g. "wiki/entities/foo.md" → "entities/foo"
    const rel = wikiRelative(f.relativePath).replace(/\.md$/, "")
    map.set(rel, f.relativePath)
    // also index by basename without extension
    map.set(f.name.replace(/\.md$/, ""), f.relativePath)
  }
  return map
}

// ── Structural lint ───────────────────────────────────────────────────────────

export async function runStructuralLint(projectId: string): Promise<LintResult[]> {
  let tree: FileNode[]
  try {
    tree = await listDirectory(projectId, "wiki")
  } catch {
    return []
  }

  const wikiFiles = flattenMdFiles(tree)
  // Exclude index.md and log.md from orphan checks
  const contentFiles = wikiFiles.filter(
    (f) => f.name !== "index.md" && f.name !== "log.md"
  )

  const slugMap = buildSlugMap(contentFiles)

  // Read all content files
  type PageData = { relativePath: string; slug: string; content: string; outlinks: string[] }
  const pages: PageData[] = []

  for (const f of contentFiles) {
    try {
      const content = await readFile(projectId, f.relativePath)
      const slug = relativeToSlug(wikiRelative(f.relativePath))
      const outlinks = extractWikilinks(content)
      pages.push({ relativePath: f.relativePath, slug, content, outlinks })
    } catch {
      // skip unreadable files
    }
  }

  // Build inbound link count
  const inboundCounts = new Map<string, number>()
  for (const p of pages) {
    for (const link of p.outlinks) {
      const target = slugMap.has(link)
        ? relativeToSlug(wikiRelative(slugMap.get(link)!))
        : link
      inboundCounts.set(target, (inboundCounts.get(target) ?? 0) + 1)
    }
  }

  const results: LintResult[] = []

  for (const p of pages) {
    const shortName = wikiRelative(p.relativePath)

    // Orphan: no inbound links
    const inbound = inboundCounts.get(p.slug) ?? 0
    if (inbound === 0) {
      results.push({
        type: "orphan",
        severity: "info",
        page: shortName,
        detail: "No other pages link to this page.",
      })
    }

    // No outbound links
    if (p.outlinks.length === 0) {
      results.push({
        type: "no-outlinks",
        severity: "info",
        page: shortName,
        detail: "This page has no [[wikilink]] references to other pages.",
      })
    }

    // Broken links
    for (const link of p.outlinks) {
      const exists = slugMap.has(link) || slugMap.has(getFileName(link).replace(/\.md$/, ""))
      if (!exists) {
        results.push({
          type: "broken-link",
          severity: "warning",
          page: shortName,
          detail: `Broken link: [[${link}]] — target page not found.`,
        })
      }
    }
  }

  return results
}

// ── Semantic lint ─────────────────────────────────────────────────────────────

const LINT_BLOCK_REGEX =
  /---LINT:\s*([^\n|]+?)\s*\|\s*([^\n|]+?)\s*\|\s*([^\n-]+?)\s*---\n([\s\S]*?)---END LINT---/g

export async function runSemanticLint(
  projectId: string,
  _llmConfig?: LlmConfig,
): Promise<LintResult[]> {
  const activity = useActivityStore.getState()
  const activityId = activity.addItem({
    type: "lint",
    title: "Semantic wiki lint",
    status: "running",
    detail: "Reading wiki pages...",
    filesWritten: [],
  })

  let tree: FileNode[]
  try {
    tree = await listDirectory(projectId, "wiki")
  } catch {
    activity.updateItem(activityId, { status: "error", detail: "Failed to read wiki directory." })
    return []
  }

  const wikiFiles = flattenMdFiles(tree).filter(
    (f) => f.name !== "log.md"
  )

  // Build a compact summary of each page (frontmatter + first 500 chars)
  const summaries: string[] = []
  for (const f of wikiFiles) {
    try {
      const content = await readFile(projectId, f.relativePath)
      const preview = content.slice(0, 500) + (content.length > 500 ? "..." : "")
      const shortPath = wikiRelative(f.relativePath)
      summaries.push(`### ${shortPath}\n${preview}`)
    } catch {
      // skip
    }
  }

  if (summaries.length === 0) {
    activity.updateItem(activityId, { status: "done", detail: "No wiki pages to lint." })
    return []
  }

  activity.updateItem(activityId, { detail: "Running LLM semantic analysis..." })

  const prompt = [
    "You are a wiki quality analyst. Review the following wiki page summaries and identify issues.",
    "",
    "## Language Rule",
    "- Match the language of the wiki content. If pages are in Chinese, write issues in Chinese. If in English, use English.",
    "",
    "For each issue, output exactly this format:",
    "",
    "---LINT: type | severity | Short title---",
    "Description of the issue.",
    "PAGES: page1.md, page2.md",
    "---END LINT---",
    "",
    "Types:",
    "- contradiction: two or more pages make conflicting claims",
    "- stale: information that appears outdated or superseded",
    "- missing-page: an important concept is heavily referenced but has no dedicated page",
    "- suggestion: a question or source worth adding to the wiki",
    "",
    "Severities:",
    "- warning: should be addressed",
    "- info: nice to have",
    "",
    "Only report genuine issues. Do not invent problems. Output ONLY the ---LINT--- blocks, no other text.",
    "",
    "## Wiki Pages",
    "",
    summaries.join("\n\n"),
  ].join("\n")

  let raw = ""
  let hadError = false

  await streamChat(
    [{ role: "user", content: prompt }],
    {
      onToken: (token) => { raw += token },
      onDone: () => {},
      onError: (err) => {
        hadError = true
        activity.updateItem(activityId, {
          status: "error",
          detail: `LLM error: ${err.message}`,
        })
      },
    },
  )

  if (hadError) return []

  const results: LintResult[] = []
  const matches = raw.matchAll(LINT_BLOCK_REGEX)

  for (const match of matches) {
    const rawType = match[1].trim().toLowerCase()
    const severity = match[2].trim().toLowerCase()
    const title = match[3].trim()
    const body = match[4].trim()

    // semantic results always use type "semantic"
    void rawType

    const pagesMatch = body.match(/^PAGES:\s*(.+)$/m)
    const affectedPages = pagesMatch
      ? pagesMatch[1].split(",").map((p) => p.trim())
      : undefined

    const detail = body.replace(/^PAGES:.*$/m, "").trim()

    results.push({
      type: "semantic",
      severity: (severity === "warning" ? "warning" : "info") as LintResult["severity"],
      page: title,
      detail: `[${rawType}] ${detail}`,
      affectedPages,
    })
  }

  activity.updateItem(activityId, {
    status: "done",
    detail: `Found ${results.length} semantic issue(s).`,
  })

  return results
}
