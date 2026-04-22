import { readFile, listDirectory } from "@/commands/fs"
import type { FileNode } from "@/types/wiki"

export interface SearchResult {
  relativePath: string
  title: string
  snippet: string
  titleMatch: boolean
  score: number
}

const MAX_RESULTS = 20
const SNIPPET_CONTEXT = 80
const TITLE_MATCH_BONUS = 10

const STOP_WORDS = new Set([
  "的", "是", "了", "什么", "在", "有", "和", "与", "对", "从",
  "the", "is", "a", "an", "what", "how", "are", "was", "were",
  "do", "does", "did", "be", "been", "being", "have", "has", "had",
  "it", "its", "in", "on", "at", "to", "for", "of", "with", "by",
  "this", "that", "these", "those",
])

export function tokenizeQuery(query: string): string[] {
  // Split by whitespace and punctuation
  const rawTokens = query
    .toLowerCase()
    .split(/[\s,，。！？、；：""''（）()\-_/\\·~～…]+/)
    .filter((t) => t.length > 1)
    .filter((t) => !STOP_WORDS.has(t))

  const tokens: string[] = []

  for (const token of rawTokens) {
    // Check if token contains CJK characters
    const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(token)

    if (hasCJK && token.length > 2) {
      // For CJK text: split into individual characters AND overlapping bigrams
      // "默会知识" → ["默会", "会知", "知识", "默", "会", "知", "识"]
      const chars = [...token]
      // Add bigrams (most useful for Chinese)
      for (let i = 0; i < chars.length - 1; i++) {
        tokens.push(chars[i] + chars[i + 1])
      }
      // Also add individual chars (for single-char matches)
      for (const ch of chars) {
        if (!STOP_WORDS.has(ch)) {
          tokens.push(ch)
        }
      }
      // Keep the original token too (for exact phrase match)
      tokens.push(token)
    } else {
      tokens.push(token)
    }
  }

  // Deduplicate
  return [...new Set(tokens)]
}

function tokenMatchScore(text: string, tokens: readonly string[]): number {
  const lower = text.toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (lower.includes(token)) score += 1
  }
  return score
}

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

function extractTitle(content: string, fileName: string): string {
  const frontmatterMatch = content.match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m)
  if (frontmatterMatch) return frontmatterMatch[1].trim()

  return fileName.replace(/\.md$/, "").replace(/-/g, " ")
}

function buildSnippet(content: string, query: string): string {
  const lower = content.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lower.indexOf(lowerQuery)
  if (idx === -1) return content.slice(0, SNIPPET_CONTEXT * 2).replace(/\n/g, " ")

  const start = Math.max(0, idx - SNIPPET_CONTEXT)
  const end = Math.min(content.length, idx + query.length + SNIPPET_CONTEXT)
  let snippet = content.slice(start, end).replace(/\n/g, " ")
  if (start > 0) snippet = "..." + snippet
  if (end < content.length) snippet = snippet + "..."
  return snippet
}

export async function searchWiki(
  projectId: string,
  query: string,
): Promise<SearchResult[]> {
  if (!query.trim()) return []

  const tokens = tokenizeQuery(query)
  // Fallback: if all tokens were filtered out, use the trimmed query as a single token
  const effectiveTokens = tokens.length > 0 ? tokens : [query.trim().toLowerCase()]
  const results: SearchResult[] = []

  // Search wiki pages
  try {
    const wikiTree = await listDirectory(projectId, "wiki")
    const wikiFiles = flattenMdFiles(wikiTree)
    await searchFiles(projectId, wikiFiles, effectiveTokens, query, results)
  } catch {
    // no wiki directory
  }

  // Also search raw sources (extracted text)
  try {
    const rawTree = await listDirectory(projectId, "raw/sources")
    const rawFiles = flattenAllFiles(rawTree)
    await searchFiles(projectId, rawFiles, effectiveTokens, query, results)
  } catch {
    // no raw sources
  }

  // Vector search: merge semantic results if embedding enabled
  try {
    const { useWikiStore } = await import("@/stores/wiki-store")
    const embCfg = useWikiStore.getState().embeddingConfig
    if (embCfg.enabled && embCfg.model) {
      const { searchByEmbedding } = await import("@/lib/embedding")
      const vectorResults = await searchByEmbedding(projectId, query, embCfg, 10)

      const existingPaths = new Set(results.map((r) => r.relativePath))

      for (const vr of vectorResults) {
        // Check if already in results
        const existing = results.find((r) => {
          const fileName = r.relativePath.split("/").pop()?.replace(/\.md$/, "") ?? ""
          return fileName === vr.id
        })

        if (existing) {
          // Boost score of existing result
          existing.score += vr.score * 5
        } else {
          // Try to find the file and add it
          const dirs = ["entities", "concepts", "sources", "synthesis", "comparison", "queries"]
          for (const dir of dirs) {
            const tryPath = `wiki/${dir}/${vr.id}.md`
            if (existingPaths.has(tryPath)) break
            try {
              const content = await readFile(projectId, tryPath)
              const title = extractTitle(content, `${vr.id}.md`)
              results.push({
                relativePath: tryPath,
                title,
                snippet: buildSnippet(content, query),
                titleMatch: false,
                score: vr.score * 5,
              })
              existingPaths.add(tryPath)
              break
            } catch {
              // not in this directory
            }
          }
        }
      }
    }
  } catch {
    // Vector search not available — continue with token results only
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)

  return results.slice(0, MAX_RESULTS)
}

async function searchFiles(
  projectId: string,
  files: FileNode[],
  tokens: readonly string[],
  query: string,
  results: SearchResult[],
): Promise<void> {
  for (const file of files) {
    let content = ""
    try {
      content = await readFile(projectId, file.relativePath)
    } catch {
      continue
    }

    const title = extractTitle(content, file.name)
    const titleText = `${title} ${file.name}`

    const titleScore = tokenMatchScore(titleText, tokens)
    const contentScore = tokenMatchScore(content, tokens)

    if (titleScore === 0 && contentScore === 0) continue

    const isTitleMatch = titleScore > 0
    const score = contentScore + (isTitleMatch ? TITLE_MATCH_BONUS : 0)

    const firstMatchingToken = tokens.find((t) =>
      content.toLowerCase().includes(t),
    ) ?? query
    const snippet = buildSnippet(content, firstMatchingToken)

    results.push({
      relativePath: file.relativePath,
      title,
      snippet,
      titleMatch: isTitleMatch,
      score,
    })
  }
}

function flattenAllFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      files.push(...flattenAllFiles(node.children))
    } else if (!node.is_dir) {
      files.push(node)
    }
  }
  return files
}
