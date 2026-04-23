/**
 * File I/O utilities for writing LLM-generated wiki content to disk.
 * Includes path validation, block parsing, and multi-file write orchestration.
 */

import fs from "node:fs/promises"
import path from "node:path"
import type { ContentPart } from "../lib/llm-providers.js"
import { logFileChange, nowBeijing } from "./ingest-audit-logger.js"
import {
  normFrontmatter,
  ensureCanonicalTitleType,
  isTitleFilenameConsistent,
  isBodyTitleSemanticallyConsistent,
} from "./ingest-validators.js"

// ── File type constants ────────────────────────────────────────────────────

export const BINARY_EXTS = new Set(["pdf", "docx", "pptx", "xlsx", "xls", "rtf", "odt", "odp", "ods"])
export const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "tif", "avif", "heic", "heif"])
export const MAX_IMAGES_PER_INGEST = 10

// Paths the shared-files LLM call is allowed to write.
// wiki/index.md is intentionally excluded — it is rebuilt programmatically after each ingest.
export const SHARED_ALLOWED: ReadonlySet<string> = new Set(["wiki/log.md", "wiki/overview.md"])

// ── Low-level I/O ─────────────────────────────────────────────────────────

export async function tryRead(filePath: string): Promise<string> {
  try { return await fs.readFile(filePath, "utf-8") } catch { return "" }
}

export async function writeWithMkdir(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf-8")
}

// ── Multimodal content builder ─────────────────────────────────────────────

/**
 * Build the user message content for an ingest LLM call.
 * When images are provided, returns a ContentPart[] (multimodal).
 * When no images, returns a plain string (backward-compatible).
 */
export function buildMultimodalUserContent(
  textPrompt: string,
  imageDataUris: string[],
): string | ContentPart[] {
  if (imageDataUris.length === 0) return textPrompt

  const capped = imageDataUris.slice(0, MAX_IMAGES_PER_INGEST)
  const truncationNotice =
    imageDataUris.length > MAX_IMAGES_PER_INGEST
      ? `\n\n[Note: ${imageDataUris.length} images found; sending first ${MAX_IMAGES_PER_INGEST} to stay within token limits.]`
      : ""

  const parts: ContentPart[] = [
    { type: "text", text: textPrompt + truncationNotice },
    ...capped.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "auto" as const },
    })),
  ]
  return parts
}

// ── FILE block parser ──────────────────────────────────────────────────────

/**
 * Parse FILE blocks from LLM output.
 *
 * The LLM occasionally omits ---END FILE--- for a block. A pure regex
 * (non-greedy [\s\S]*?) would then consume all content up to the NEXT
 * ---END FILE--- — pulling in the following file's content and creating
 * title/content mismatches.
 *
 * This line-based parser treats a new ---FILE: header as an implicit
 * terminator for any open block, so missing ---END FILE--- markers can
 * never cause content bleed between files.
 */
export function parseFileBlocks(text: string): Array<{ path: string; content: string }> {
  const results: Array<{ path: string; content: string }> = []
  const lines = text.split("\n")
  let currentPath: string | null = null
  const currentLines: string[] = []

  const flush = () => {
    if (currentPath !== null) {
      results.push({ path: currentPath, content: currentLines.join("\n") })
      currentLines.length = 0
      currentPath = null
    }
  }

  for (const line of lines) {
    const startMatch = line.match(/^---FILE:\s*(.+?)\s*---$/)
    if (startMatch) {
      flush() // close previous block (handles missing ---END FILE---)
      currentPath = startMatch[1]
    } else if (line === "---END FILE---") {
      flush()
    } else if (currentPath !== null) {
      currentLines.push(line)
    }
  }
  flush() // handle trailing open block

  return results
}

// ── REVIEW block parser ────────────────────────────────────────────────────

const REVIEW_BLOCK_RE = /---REVIEW:\s*(\w[\w-]*)\s*\|\s*(.+?)\s*---\n([\s\S]*?)---END REVIEW---/g

export function parseReviewBlocksText(
  text: string,
  sourcePath: string,
): Array<{ type: string; title: string; description: string; sourcePath: string; affectedPages?: string[]; options: Array<{ label: string; action: string }> }> {
  const items = []
  for (const match of text.matchAll(REVIEW_BLOCK_RE)) {
    const rawType = match[1].trim().toLowerCase()
    const title = match[2].trim()
    const body = match[3].trim()

    const type = ["contradiction", "duplicate", "missing-page", "suggestion"].includes(rawType)
      ? rawType
      : "suggestion"

    const optionsMatch = body.match(/^OPTIONS:\s*(.+)$/m)
    const options = optionsMatch
      ? optionsMatch[1].split("|").map((o) => { const label = o.trim(); return { label, action: label } })
      : [{ label: "Approve", action: "Approve" }, { label: "Skip", action: "Skip" }]

    const pagesMatch = body.match(/^PAGES:\s*(.+)$/m)
    const affectedPages = pagesMatch ? pagesMatch[1].split(",").map((p) => p.trim()) : undefined

    const description = body
      .replace(/^OPTIONS:.*$/m, "").replace(/^PAGES:.*$/m, "").replace(/^SEARCH:.*$/m, "").trim()

    items.push({ type, title, description, sourcePath, affectedPages, options })
  }
  return items
}

// ── Path allowlist ─────────────────────────────────────────────────────────

/**
 * Build the set of paths this ingest task is allowed to write.
 * Paths outside this set are rejected to prevent LLM cross-source hallucinations.
 *
 * Allowed:
 *   - wiki/sources/<sourceBase>.md          (source summary page)
 *   - wiki/sources/<sourceBase>/**          (entities, concepts, etc.)
 *   - wiki/log.md                           (append-only log)
 *   - wiki/overview.md                      (shared overview, updated each ingest)
 *
 * wiki/index.md is intentionally excluded — it is rebuilt programmatically after each ingest.
 */
export function buildAllowedPaths(sourceBase: string): ReadonlySet<string> {
  return new Set<string>([
    `wiki/sources/${sourceBase}.md`,
    `wiki/log.md`,
    `wiki/overview.md`,
  ]) as ReadonlySet<string>
}

// ── Single block writer ────────────────────────────────────────────────────

export async function writeSingleBlock(
  projectPath: string,
  rel: string,
  rawContent: string,
  opts?: { allowedPaths?: ReadonlySet<string>; writtenInTask?: Set<string> },
): Promise<boolean> {
  if (!rel) return false

  // Contract validation: reject writes not in the declared allowed set
  if (opts?.allowedPaths && !opts.allowedPaths.has(rel)) {
    console.warn(`[ingest-service] Rejected out-of-contract write: ${rel}`)
    return false
  }

  const isLogFile = rel === "wiki/log.md" || rel.endsWith("/log.md")

  // Write protection: prevent a later step from overwriting a file already written in this task
  if (!isLogFile && opts?.writtenInTask?.has(rel)) {
    console.warn(`[ingest-service] Skipping already-written file: ${rel}`)
    return false
  }

  let content = rawContent

  if (rel.endsWith(".md") && !isLogFile) {
    content = normFrontmatter(content)
    content = ensureCanonicalTitleType(rel, content)
  }
  if (!isLogFile && !content.trim()) {
    console.warn(`[ingest-service] Skipping empty content for ${rel}`)
    return false
  }

  // Quality gates — ON by default (Phase 3G).
  // Set LLM_WIKI_SKIP_VALIDATION=1 to bypass (e.g. for legacy data replay tests).
  const SKIP_VALIDATION = process.env.LLM_WIKI_SKIP_VALIDATION === "1"
  if (!SKIP_VALIDATION && !isTitleFilenameConsistent(rel, content)) {
    const fileBasename = path.basename(rel, ".md")
    const titleMatch = content.match(/^---\s*\n[\s\S]*?^title:\s*(.+?)\s*$/m)
    console.warn(
      `[ingest-service] ⛔ REJECTED title-filename mismatch: path="${rel}" title="${titleMatch?.[1]?.trim()}" filename="${fileBasename}"`,
    )
    return false
  }
  if (!SKIP_VALIDATION && !isBodyTitleSemanticallyConsistent(rel, content)) {
    const titleMatch = content.match(/^---\s*\n[\s\S]*?^title:\s*(.+?)\s*$/m)
    console.warn(
      `[ingest-service] ⛔ REJECTED semantic mismatch: path="${rel}" title="${titleMatch?.[1]?.trim() ?? ""}"`,
    )
    return false
  }

  const full = path.join(projectPath, rel)
  try {
    if (isLogFile) {
      const existing = await tryRead(full)
      await writeWithMkdir(full, existing ? `${existing}\n\n${content.trim()}` : content.trim())
    } else {
      await writeWithMkdir(full, content)
    }
    opts?.writtenInTask?.add(rel)
    return true
  } catch (err) {
    console.error(`[ingest-service] Write failed ${rel}:`, err)
    return false
  }
}

// ── Multi-block writer ─────────────────────────────────────────────────────

export async function writeBlocks(
  projectPath: string,
  text: string,
  sourceBase: string,
  taskId: string,
  sourceFile: string,
): Promise<string[]> {
  const written: string[] = []
  const rejected: string[] = []
  const staticAllowed = buildAllowedPaths(sourceBase)
  const sourcePrefix = `wiki/sources/${sourceBase}/`
  const blocks = parseFileBlocks(text)

  console.log(`[writeBlocks] source="${sourceBase}" totalBlocks=${blocks.length}`)

  for (const { path: relRaw, content: rawContent } of blocks) {
    // Normalize to prevent path traversal (e.g. "sources/A/../../evil.md")
    const rel = path.posix.normalize(relRaw)

    if (rel === "wiki/overview.md") {
      // Shared overview is rebuilt programmatically to avoid concurrent LLM drift.
      continue
    }

    // Extract title and sources from frontmatter for logging
    const titleMatch = rawContent.match(/^---\s*\n[\s\S]*?^title:\s*(.+?)\s*$/m)
    const titleInContent = titleMatch?.[1]?.trim() ?? "(no title)"
    const sourcesMatch = rawContent.match(/^---\s*\n[\s\S]*?^sources:\s*(.+?)$/m)
    const sourcesField = sourcesMatch?.[1]?.trim() ?? ""
    const fileBasename = rel.split("/").pop()?.replace(/\.md$/, "") ?? ""
    const titleMatchesFilename = fileBasename.toLowerCase() === titleInContent.toLowerCase()

    const isAllowed = rel.startsWith(sourcePrefix) || staticAllowed.has(rel)
    if (!isAllowed) {
      rejected.push(rel)
      console.warn(
        `[writeBlocks] ⛔ REJECTED out-of-scope (source=${sourceBase}): ${rel}`,
      )
      logFileChange(projectPath, {
        ts: nowBeijing(),
        taskId,
        sourceFile,
        operation: "rejected-scope",
        path: rel,
        titleInContent,
        titleMatchesFilename,
        sourcesField,
        contentSnippet: rawContent.slice(0, 300),
      }).catch(() => {})
      continue
    }
    const ok = await writeSingleBlock(projectPath, rel, rawContent)
    if (ok) {
      written.push(rel)
      console.log(`[writeBlocks] ✅ WRITTEN (source=${sourceBase}): ${rel}`)
      logFileChange(projectPath, {
        ts: nowBeijing(),
        taskId,
        sourceFile,
        operation: "written",
        path: rel,
        titleInContent,
        titleMatchesFilename,
        sourcesField,
        contentSnippet: rawContent.slice(0, 300),
      }).catch(() => {})
    } else {
      console.warn(`[writeBlocks] ⚠️ SKIPPED empty/invalid (source=${sourceBase}): ${rel}`)
      logFileChange(projectPath, {
        ts: nowBeijing(),
        taskId,
        sourceFile,
        operation: "skipped-empty",
        path: rel,
        titleInContent,
        titleMatchesFilename,
        sourcesField,
        contentSnippet: rawContent.slice(0, 300),
      }).catch(() => {})
    }
  }

  console.log(
    `[writeBlocks] DONE source="${sourceBase}" written=${written.length} rejected=${rejected.length}` +
    (rejected.length > 0 ? ` rejectedPaths=[${rejected.join(", ")}]` : ""),
  )
  return written
}
