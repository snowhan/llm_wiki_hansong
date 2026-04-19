/**
 * Server-side ingest service.
 * Runs wiki generation tasks in the background, surviving page refreshes.
 * Progress is streamed to subscribers via SSE.
 *
 * Architecture change: tasks are now identified by (projectId, sourcePath)
 * instead of absolute paths. The server resolves the project root internally.
 */

import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import type { Response } from "express"
import type { LlmConfig, ServerIngestTask } from "../types.js"
import { getProjectRoot } from "./project-service.js"
import { getState } from "./state-service.js"
import { getProviderConfig } from "../lib/llm-providers.js"
import type { ChatMessage } from "../lib/llm-providers.js"

// ── Task types ────────────────────────────────────────────────────────────

export type IngestTaskStatus = "pending" | "running" | "done" | "error"
export type { ServerIngestTask, LlmConfig }

// ── In-memory stores ──────────────────────────────────────────────────────

const taskStore = new Map<string, ServerIngestTask>()
const sseClients = new Map<string, Set<Response>>()
const abortControllers = new Map<string, AbortController>()

// ── SSE helpers ───────────────────────────────────────────────────────────

function pushEvent(taskId: string, event: object) {
  const clients = sseClients.get(taskId)
  if (!clients?.size) return
  const payload = `data: ${JSON.stringify(event)}\n\n`
  for (const res of clients) {
    try { res.write(payload) } catch { /* client gone */ }
  }
}

export function registerSseClient(taskId: string, res: Response) {
  if (!sseClients.has(taskId)) sseClients.set(taskId, new Set())
  sseClients.get(taskId)!.add(res)
  const task = taskStore.get(taskId)
  if (task) {
    try { res.write(`data: ${JSON.stringify({ type: "state", task })}\n\n`) } catch { /* client gone */ }
  }
}

export function unregisterSseClient(taskId: string, res: Response) {
  const clients = sseClients.get(taskId)
  if (!clients) return
  clients.delete(res)
  if (clients.size === 0) sseClients.delete(taskId)
}

function updateTask(task: ServerIngestTask, patch: Partial<ServerIngestTask>) {
  Object.assign(task, patch, { updatedAt: Date.now() })
  // Use terminal event types so the frontend's onDone / onError handlers fire.
  if (task.status === "done") {
    pushEvent(task.id, { type: "done", task })
  } else if (task.status === "error") {
    pushEvent(task.id, { type: "error", task, message: task.error ?? task.detail })
  } else {
    pushEvent(task.id, { type: "update", task })
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export function getTask(taskId: string): ServerIngestTask | undefined {
  return taskStore.get(taskId)
}

export function getAllTasks(): ServerIngestTask[] {
  return Array.from(taskStore.values())
}

/**
 * Start a server-side ingest task.
 * Returns immediately with a taskId; the actual work runs asynchronously.
 *
 * Deduplication: if a task for the same (projectId, sourcePath) is already
 * running/pending, return that task's id instead of creating a new one.
 */
export function startIngestTask(
  projectId: string,
  sourcePath: string, // relative to project root
  folderContext = "",
  force = false,
): string {
  const existing = Array.from(taskStore.values()).find(
    (t) =>
      t.projectId === projectId &&
      t.sourcePath === sourcePath &&
      (t.status === "running" || t.status === "pending"),
  )
  if (existing) {
    console.log(`[ingest-service] Reusing existing task ${existing.id} for ${sourcePath}`)
    return existing.id
  }

  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const task: ServerIngestTask = {
    id,
    projectId,
    sourcePath,
    folderContext,
    force,
    status: "pending",
    detail: "Queued",
    filesWritten: [],
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  taskStore.set(id, task)

  runIngest(task).catch((err) => {
    console.error(`[ingest-service] Unhandled error for task ${id}:`, err)
    updateTask(task, { status: "error", error: String(err), detail: "Internal error" })
  })

  return id
}

// ── File I/O helpers ──────────────────────────────────────────────────────

async function tryRead(filePath: string): Promise<string> {
  try { return await fs.readFile(filePath, "utf-8") } catch { return "" }
}

async function writeWithMkdir(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf-8")
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

const BINARY_EXTS = new Set(["pdf", "docx", "pptx", "xlsx", "xls", "rtf", "odt", "odp", "ods"])

// Paths the shared-files LLM call is allowed to write.
// wiki/index.md is intentionally excluded — it is rebuilt programmatically after each ingest.
const SHARED_ALLOWED: ReadonlySet<string> = new Set(["wiki/log.md", "wiki/overview.md"])

// ── Index rebuild ─────────────────────────────────────────────────────────

/**
 * Recursively collect all .md files under a directory.
 * Returns paths relative to `baseDir`.
 */
async function collectMdFiles(dir: string, baseDir: string): Promise<string[]> {
  const results: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch { return results }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) {
      results.push(...await collectMdFiles(abs, baseDir))
    } else if (e.isFile() && e.name.endsWith(".md")) {
      results.push(path.relative(baseDir, abs).replace(/\\/g, "/"))
    }
  }
  return results
}

const INDEX_SKIP = new Set(["index.md", "log.md", "overview.md"])
const INDEX_TYPE_ORDER = ["source", "entity", "concept", "synthesis", "comparison", "query"]

function extractFmField(content: string, field: string): string {
  const m = content.match(new RegExp(`^${field}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, "m"))
  return m ? m[1].trim() : ""
}

/**
 * Scan wiki/ directory, read frontmatter from every .md file, and write
 * a fresh wiki/index.md grouped by page type.
 * This replaces the LLM-generated incremental index, eliminating concurrent-
 * write races and LLM drift.
 */
export async function rebuildWikiIndex(projectPath: string): Promise<void> {
  const wikiDir = path.join(projectPath, "wiki")
  const allRelPaths = await collectMdFiles(wikiDir, wikiDir)

  const entries: Array<{ relPath: string; wikiRel: string; type: string; title: string }> = []
  for (const relPath of allRelPaths) {
    if (INDEX_SKIP.has(path.basename(relPath))) continue
    const content = await tryRead(path.join(wikiDir, relPath))
    if (!content) continue
    const type = extractFmField(content, "type") || "other"
    const title = extractFmField(content, "title") || path.basename(relPath, ".md")
    entries.push({ relPath, wikiRel: `wiki/${relPath}`, type, title })
  }

  // Group by type
  const groups = new Map<string, typeof entries>()
  for (const e of entries) {
    const list = groups.get(e.type) ?? []
    list.push(e)
    groups.set(e.type, list)
  }

  const lines: string[] = ["# Wiki Index", ""]
  const written = new Set<string>()

  for (const t of INDEX_TYPE_ORDER) {
    const items = groups.get(t)
    if (!items?.length) continue
    const label = t.charAt(0).toUpperCase() + t.slice(1) + "s"
    lines.push(`## ${label}`, "")
    for (const e of items) {
      const slug = path.basename(e.relPath, ".md")
      lines.push(`- [[${slug}]] — ${e.title}`)
    }
    lines.push("")
    written.add(t)
  }

  // Remaining types not in the canonical order
  for (const [t, items] of groups) {
    if (written.has(t) || !items.length) continue
    const label = t.charAt(0).toUpperCase() + t.slice(1) + "s"
    lines.push(`## ${label}`, "")
    for (const e of items) {
      const slug = path.basename(e.relPath, ".md")
      lines.push(`- [[${slug}]] — ${e.title}`)
    }
    lines.push("")
  }

  await writeWithMkdir(path.join(projectPath, "wiki", "index.md"), lines.join("\n"))
}

/**
 * Schedule an index rebuild for the given project.
 * Rebuilds are serialised per-project via a promise chain so concurrent ingest
 * tasks never produce a partially-written index.md.
 */
const _rebuildQueue = new Map<string, Promise<void>>()

export function scheduleIndexRebuild(projectPath: string): void {
  const prev = _rebuildQueue.get(projectPath) ?? Promise.resolve()
  _rebuildQueue.set(
    projectPath,
    prev.then(() => rebuildWikiIndex(projectPath)).catch((err) => {
      console.error("[ingest-service] Index rebuild failed:", err)
    }),
  )
}

async function readSourceForIngest(sourcePath: string): Promise<string> {
  const ext = sourcePath.split(".").pop()?.toLowerCase() ?? ""
  if (BINARY_EXTS.has(ext)) {
    const cached = await tryRead(sourcePath + ".cache.txt")
    if (cached && !cached.startsWith("[Binary file:")) return cached
  }
  return tryRead(sourcePath)
}

// ── Ingest cache ──────────────────────────────────────────────────────────

interface CacheEntry { hash: string; timestamp: number; filesWritten: string[] }
interface CacheData { entries: Record<string, CacheEntry> }

async function loadCache(projectPath: string): Promise<CacheData> {
  try {
    const raw = await fs.readFile(
      path.join(projectPath, ".llm-wiki", "ingest-cache.json"),
      "utf-8",
    )
    return JSON.parse(raw) as CacheData
  } catch { return { entries: {} } }
}

async function saveCache(projectPath: string, data: CacheData): Promise<void> {
  try {
    const p = path.join(projectPath, ".llm-wiki", "ingest-cache.json")
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, JSON.stringify(data, null, 2))
  } catch { /* non-critical */ }
}

async function checkCache(
  projectPath: string,
  fileName: string,
  content: string,
): Promise<string[] | null> {
  const cache = await loadCache(projectPath)
  const entry = cache.entries[fileName]
  if (!entry) return null
  return entry.hash === sha256(content) ? entry.filesWritten : null
}

async function persistCache(
  projectPath: string,
  fileName: string,
  content: string,
  files: string[],
): Promise<void> {
  const cache = await loadCache(projectPath)
  cache.entries[fileName] = { hash: sha256(content), timestamp: Date.now(), filesWritten: files }
  await saveCache(projectPath, cache)
}

// ── LLM call ──────────────────────────────────────────────────────────────

async function callLlm(
  llmConfig: LlmConfig,
  messages: ChatMessage[],
  onToken: (t: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const pc = getProviderConfig(llmConfig)
  const body = pc.buildBody(messages)

  const response = await fetch(pc.url, {
    method: "POST",
    headers: pc.headers,
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const err = await response.text().catch(() => "")
    throw new Error(`LLM ${response.status}: ${err.slice(0, 200)}`)
  }
  if (!response.body) throw new Error("Empty LLM response body")

  const reader = response.body.getReader()
  const dec = new TextDecoder()
  let buf = ""

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const text = buf + dec.decode(value, { stream: true })
      const lines = text.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines) {
        const t = pc.parseStream(line.trim())
        if (t !== null) onToken(t)
      }
    }
    if (buf.trim()) {
      const t = pc.parseStream(buf.trim())
      if (t !== null) onToken(t)
    }
  } finally {
    reader.releaseLock()
  }
}

// ── File blocks ───────────────────────────────────────────────────────────

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
function parseFileBlocks(text: string): Array<{ path: string; content: string }> {
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

function normFrontmatter(content: string): string {
  if (/^-{3}[ \t]*\r?\n/.test(content)) return content
  const m = content.match(/^((?:[a-z_][a-z0-9_]*[ \t]*:[ \t]*[^\n]*\n){2,})/)
  if (m) {
    return `---\n${m[1]}---\n\n${content.slice(m[1].length).replace(/^\n+/, "")}`
  }
  return content
}


async function writeSingleBlock(
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
  }
  if (!isLogFile && !content.trim()) {
    console.warn(`[ingest-service] Skipping empty content for ${rel}`)
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

async function writeBlocks(projectPath: string, text: string): Promise<string[]> {
  const written: string[] = []
  for (const { path: rel, content: rawContent } of parseFileBlocks(text)) {
    if (await writeSingleBlock(projectPath, rel, rawContent)) written.push(rel)
  }
  return written
}

const REVIEW_BLOCK_RE = /---REVIEW:\s*(\w[\w-]*)\s*\|\s*(.+?)\s*---\n([\s\S]*?)---END REVIEW---/g

function parseReviewBlocksText(
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

// ── Prompts ───────────────────────────────────────────────────────────────

const LANGUAGE_RULE =
  "## Language Rule\n- ALWAYS match the language of the source document. " +
  "If the source is in Chinese, write in Chinese. If in English, write in English. " +
  "Wiki page titles, content, and descriptions should all be in the same language as the source material."

function buildAnalysisPrompt(purpose: string, index: string): string {
  return [
    "You are an expert research analyst. Read the source document and produce a structured analysis.",
    "",
    LANGUAGE_RULE,
    "",
    "Your analysis should cover:",
    "",
    "## Key Entities",
    "List people, organizations, products, datasets, tools mentioned. For each:",
    "- Name and type",
    "- Role in the source (central vs. peripheral)",
    "- Whether it likely already exists in the wiki (check the index)",
    "",
    "## Key Concepts",
    "List theories, methods, techniques, phenomena. For each:",
    "- Name and brief definition",
    "- Why it matters in this source",
    "- Whether it likely already exists in the wiki",
    "",
    "## Main Arguments & Findings",
    "- What are the core claims or results?",
    "- What evidence supports them?",
    "- How strong is the evidence?",
    "",
    "## Connections to Existing Wiki",
    "- What existing pages does this source relate to?",
    "- Does it strengthen, challenge, or extend existing knowledge?",
    "",
    "## Contradictions & Tensions",
    "- Does anything in this source conflict with existing wiki content?",
    "- Are there internal tensions or caveats?",
    "",
    "## Recommendations",
    "- What wiki pages should be created or updated?",
    "- What should be emphasized vs. de-emphasized?",
    "- Any open questions worth flagging for the user?",
    "",
    "Be thorough but concise. Focus on what's genuinely important.",
    "",
    "If a folder context is provided, use it as a hint for categorization.",
    "",
    purpose ? `## Wiki Purpose (for context)\n${purpose}` : "",
    index ? `## Current Wiki Index (for checking existing content)\n${index}` : "",
  ].filter(Boolean).join("\n")
}

function buildGenerationPrompt(
  schema: string,
  purpose: string,
  index: string,
  sourceFileName: string,
  overview?: string,
): string {
  const base = sourceFileName.replace(/\.[^.]+$/, "")
  return [
    "You are a wiki maintainer. Based on the analysis provided, generate wiki files.",
    "",
    LANGUAGE_RULE,
    "",
    `## IMPORTANT: Source File`,
    `The original source file is: **${sourceFileName}**`,
    `All wiki pages generated from this source MUST include this filename in their frontmatter \`sources\` field.`,
    "",
    "## Output Format",
    "",
    "Output each wiki file in this exact format:",
    "",
    "---FILE: wiki/sources/filename.md---",
    `(or: ---FILE: wiki/sources/${base}/entities/entity-name.md---)`,
    "(complete file content with YAML frontmatter)",
    "---END FILE---",
    "",
    "Generate:",
    `1. A source summary page at **wiki/sources/${base}.md** (MUST use this exact path)`,
    `2. Entity pages in **wiki/sources/${base}/entities/** for key entities identified in the analysis (MUST use this exact prefix, e.g. wiki/sources/${base}/entities/entity-name.md)`,
    `3. Concept pages in **wiki/sources/${base}/concepts/** for key concepts identified in the analysis (MUST use this exact prefix, e.g. wiki/sources/${base}/concepts/concept-name.md)`,
    "4. An updated wiki/index.md — add new entries to existing categories, preserve all existing entries",
    "5. A log entry for wiki/log.md (just the new entry to append, format: ## [YYYY-MM-DD] ingest | Title)",
    "6. An updated wiki/overview.md — a high-level summary of what the entire wiki covers, updated to reflect the newly ingested source.",
    "",
    "## Frontmatter Rules (CRITICAL)",
    "",
    "Every page MUST have YAML frontmatter with these fields:",
    "```yaml",
    "---",
    "type: source | entity | concept | comparison | query | synthesis",
    "title: Human-readable title",
    "created: YYYY-MM-DD",
    "updated: YYYY-MM-DD",
    "tags: []",
    "related: []",
    `sources: ["${sourceFileName}"]  # MUST contain the original source filename`,
    "---",
    "```",
    "",
    `The \`sources\` field MUST always contain "${sourceFileName}".`,
    "",
    "Other rules:",
    "- Use [[wikilink]] syntax for cross-references between pages",
    "- Filenames MUST follow source language. If the source is Chinese, use Chinese filenames directly (DO NOT transliterate to pinyin). If the source is English, use readable English filenames.",
    "- Follow the analysis recommendations on what to emphasize",
    "- If the analysis found connections to existing pages, add cross-references",
    "",
    "## Page Type Rules (CRITICAL — read before writing each FILE block)",
    "",
    `### Entity Pages  (path must be under wiki/sources/${base}/entities/)`,
    "- An entity page is about a SPECIFIC PERSON, ORGANIZATION, PRODUCT, DATASET, or TOOL",
    "- Content MUST describe: who/what this entity is, their background, their role in this source",
    "- ❌ DO NOT write about medical conditions, abstract concepts, or techniques in entity pages",
    "- ✅ Example correct: a page about '韩松' describes this person's identity and role in the source",
    "",
    `### Concept Pages  (path must be under wiki/sources/${base}/concepts/)`,
    "- A concept page is about an ABSTRACT IDEA, MEDICAL CONDITION, METHODOLOGY, or TECHNIQUE",
    "- Content MUST describe: definition, clinical/technical significance, how it appears in this source",
    "- ❌ DO NOT write about specific people, organizations, or products in concept pages",
    "- ✅ Example correct: a page about '高尿酸血症' explains what this medical condition is",
    "",
    "### SELF-CHECK before writing each FILE block:",
    "- Path contains /entities/ → content MUST be about a specific person/org/product/tool",
    "- Path contains /concepts/ → content MUST be about an abstract idea/condition/method",
    "- If content and path type do not match → FIX IT before outputting",
    "",
    "## Review Items",
    "",
    "After the FILE blocks, output REVIEW blocks for anything that needs human judgment:",
    "",
    "---REVIEW: type | Title---",
    "Description of what needs the user's attention.",
    "OPTIONS: (see allowed options below)",
    "PAGES: wiki/page1.md, wiki/page2.md",
    "SEARCH: search query 1 | search query 2",
    "---END REVIEW---",
    "",
    "Review types: contradiction, duplicate, missing-page, suggestion.",
    "For each: OPTIONS: Create Page | Skip",
    "",
    "Only create reviews for things that genuinely need human input.",
    "",
    purpose ? `## Wiki Purpose\n${purpose}` : "",
    schema ? `## Wiki Schema\n${schema}` : "",
    index ? `## Current Wiki Index (preserve all existing entries, add new ones)\n${index}` : "",
    overview ? `## Current Overview (update this to reflect the new source)\n${overview}` : "",
  ].filter(Boolean).join("\n")
}

// ── File plan ─────────────────────────────────────────────────────────────

interface PlanItem {
  type: "entity" | "concept"
  name: string
  description: string
}

/**
 * Extract entity/concept file plan from the LLM analysis output.
 * Looks for lines like: ENTITY: Name | description
 */
function parsePlan(analysis: string): PlanItem[] {
  const planMatch = analysis.match(/## File Plan\s*\n([\s\S]*)$/)
  const planSection = planMatch ? planMatch[1] : analysis
  const items: PlanItem[] = []

  for (const line of planSection.split("\n")) {
    const entityMatch = line.match(/^ENTITY:\s*(.+?)\s*\|\s*(.+)$/)
    if (entityMatch) {
      items.push({ type: "entity", name: entityMatch[1].trim(), description: entityMatch[2].trim() })
      continue
    }
    const conceptMatch = line.match(/^CONCEPT:\s*(.+?)\s*\|\s*(.+)$/)
    if (conceptMatch) {
      items.push({ type: "concept", name: conceptMatch[1].trim(), description: conceptMatch[2].trim() })
    }
  }
  return items
}

/** Remove characters that are unsafe in filenames */
function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim()
}

function buildSourceSummaryPrompt(
  sourceFileName: string,
  purpose: string,
  schema: string,
): string {
  const base = sourceFileName.replace(/\.[^.]+$/, "")
  return [
    "You are a wiki maintainer. Generate EXACTLY ONE wiki file: the source summary page.",
    "",
    LANGUAGE_RULE,
    "",
    `## File to Generate`,
    `- Path: wiki/sources/${base}.md`,
    `- Type: source`,
    `- This page summarizes the source document and links to entity/concept pages.`,
    "",
    "## Output Format",
    `Output ONLY this single FILE block:`,
    `---FILE: wiki/sources/${base}.md---`,
    "(YAML frontmatter + content)",
    "---END FILE---",
    "",
    "## Frontmatter",
    "```yaml",
    "---",
    "type: source",
    `title: "${base}"`,
    "created: YYYY-MM-DD",
    "updated: YYYY-MM-DD",
    "tags: []",
    "related: []",
    `sources: ["${sourceFileName}"]`,
    "---",
    "```",
    "",
    "## Content Rules",
    "- Summarize the source document's key findings, entities, and concepts",
    "- Use [[wikilink]] to link to entity and concept pages",
    "- Be comprehensive but concise",
    "",
    purpose ? `## Wiki Purpose\n${purpose}` : "",
    schema ? `## Wiki Schema\n${schema}` : "",
  ].filter(Boolean).join("\n")
}

function buildSingleFilePrompt(
  filePath: string,
  fileType: "entity" | "concept",
  title: string,
  description: string,
  sourceFileName: string,
  purpose: string,
): string {
  const typeRules =
    fileType === "entity"
      ? [
          `- This is an ENTITY page about a specific person, organization, product, or tool: "${title}"`,
          `- Content MUST describe who/what "${title}" is and their role in the source`,
          "- DO NOT write about abstract ideas, medical conditions, or techniques in this page",
          "- Focus on: identity, background, significance, role in the source document",
        ]
      : [
          `- This is a CONCEPT page about an abstract idea, medical condition, or technique: "${title}"`,
          `- Content MUST explain what "${title}" means and why it matters`,
          "- DO NOT write about specific people or organizations in this page",
          "- Focus on: definition, clinical/technical significance, how it appears in the source",
        ]

  return [
    `You are a wiki maintainer. Generate EXACTLY ONE wiki file.`,
    "",
    LANGUAGE_RULE,
    "",
    `## File to Generate`,
    `- Path: ${filePath}`,
    `- Type: ${fileType}`,
    `- Title: ${title}`,
    `- Description: ${description}`,
    `- Source: ${sourceFileName}`,
    "",
    "## Output Format",
    "Output ONLY this single FILE block (no other text before or after):",
    `---FILE: ${filePath}---`,
    "(YAML frontmatter + page content)",
    "---END FILE---",
    "",
    "## Frontmatter",
    "```yaml",
    "---",
    `type: ${fileType}`,
    `title: "${title}"`,
    "created: YYYY-MM-DD",
    "updated: YYYY-MM-DD",
    "tags: []",
    "related: []",
    `sources: ["${sourceFileName}"]`,
    "---",
    "```",
    "",
    "## Content Rules (CRITICAL)",
    ...typeRules,
    "- Use [[wikilink]] syntax for cross-references to other pages",
    `- The \`sources\` field MUST contain "${sourceFileName}"`,
    "",
    purpose ? `## Wiki Purpose\n${purpose}` : "",
  ].filter(Boolean).join("\n")
}

function buildSharedFilesPrompt(
  sourceFileName: string,
  writtenFiles: string[],
  purpose: string,
  _index: string,
  overview: string,
): string {
  return [
    "You are a wiki maintainer. Generate exactly 2 wiki management files.",
    "",
    LANGUAGE_RULE,
    "",
    `## Source Just Ingested: ${sourceFileName}`,
    `Pages created: ${writtenFiles.join(", ")}`,
    "",
    "## Files to Generate",
    "",
    "1. wiki/log.md — append a new log entry ONLY",
    `   - Format: ## [${new Date().toISOString().slice(0, 10)}] ingest | ${sourceFileName}`,
    "   - List the pages created",
    "",
    "2. wiki/overview.md — updated high-level summary of the entire wiki",
    "   - 2-5 paragraphs covering ALL topics in the wiki",
    "   - Reflect the newly added content",
    "",
    "## Output Format",
    "---FILE: wiki/log.md---",
    "(new log entry only)",
    "---END FILE---",
    "---FILE: wiki/overview.md---",
    "(complete updated overview)",
    "---END FILE---",
    "",
    "## Review Items",
    "After the FILE blocks, you may output REVIEW blocks:",
    "---REVIEW: type | Title---",
    "Description.",
    "OPTIONS: Create Page | Skip",
    "PAGES: wiki/page1.md",
    "SEARCH: query1 | query2",
    "---END REVIEW---",
    "Review types: contradiction, duplicate, missing-page, suggestion",
    "",
    purpose ? `## Wiki Purpose\n${purpose}` : "",
    overview ? `## Current Overview\n${overview}` : "",
  ].filter(Boolean).join("\n")
}

// ── Main ingest runner ────────────────────────────────────────────────────

async function runIngest(task: ServerIngestTask): Promise<void> {
  const { projectId, sourcePath, folderContext } = task

  // Resolve absolute project path and LLM config
  const projectPath = await getProjectRoot(projectId)
  const llmConfig = await getState("llmConfig") as LlmConfig | null
  if (!llmConfig?.provider) {
    updateTask(task, {
      status: "error",
      error: "LLM is not configured",
      detail: "Please configure LLM in Settings",
    })
    return
  }

  const absSourcePath = path.join(projectPath, sourcePath)
  const fileName = path.basename(sourcePath)
  const ac = new AbortController()
  abortControllers.set(task.id, ac)

  try {
    updateTask(task, { status: "running", detail: "Reading source..." })

    const [sourceContent, schema, purpose, index, overview] = await Promise.all([
      readSourceForIngest(absSourcePath),
      tryRead(path.join(projectPath, "schema.md")),
      tryRead(path.join(projectPath, "purpose.md")),
      tryRead(path.join(projectPath, "wiki", "index.md")),
      tryRead(path.join(projectPath, "wiki", "overview.md")),
    ])

    const cached = await checkCache(projectPath, fileName, sourceContent)
    if (!task.force && cached !== null) {
      updateTask(task, {
        status: "done",
        detail: `Skipped (unchanged) — ${cached.length} files from previous ingest`,
        filesWritten: cached,
      })
      return
    }

    // Guard: binary files (PDF, DOCX…) must be preprocessed before ingest.
    // If the cache.txt is missing or is just a placeholder, abort early so
    // the LLM doesn't hallucinate content from an empty / binary source.
    const srcExt = path.extname(absSourcePath).toLowerCase().slice(1)
    if (BINARY_EXTS.has(srcExt)) {
      const isEmpty = !sourceContent.trim()
      const isPlaceholder = sourceContent.startsWith("[Binary file:")
      if (isEmpty || isPlaceholder) {
        updateTask(task, {
          status: "error",
          error: "Source not preprocessed",
          detail: "请先预处理此文件（PDF/DOCX 等二进制文件需要提取文本后才能生成 wiki）",
        })
        return
      }
    }

    const truncated =
      sourceContent.length > 50000
        ? sourceContent.slice(0, 50000) + "\n\n[...truncated...]"
        : sourceContent

    // ── Step 1: Analysis ──────────────────────────────────────────────────
    updateTask(task, { detail: "Step 1: Analyzing source..." })
    let analysis = ""

    await callLlm(
      llmConfig,
      [
        { role: "system", content: buildAnalysisPrompt(purpose, index) },
        {
          role: "user",
          content:
            `Analyze this source document:\n\n**File:** ${fileName}` +
            (folderContext ? `\n**Folder context:** ${folderContext}` : "") +
            `\n\n---\n\n${truncated}`,
        },
      ],
      (token) => {
        analysis += token
        pushEvent(task.id, { type: "token", step: "1", token })
      },
      ac.signal,
    )

    if (ac.signal.aborted) return

    // ── Step 2: Generation ────────────────────────────────────────────────
    updateTask(task, { detail: "Step 2/2: Generating wiki pages..." })
    let generation = ""

    await callLlm(
      llmConfig,
      [
        {
          role: "system",
          content: buildGenerationPrompt(schema, purpose, index, fileName, overview),
        },
        {
          role: "user",
          content: [
            `Based on the following analysis of **${fileName}**, generate the wiki files.`,
            "",
            "## Source Analysis",
            "",
            analysis,
            "",
            "## Original Source Content",
            "",
            truncated,
          ].join("\n"),
        },
      ],
      (token) => {
        generation += token
        pushEvent(task.id, { type: "token", step: "2", token })
      },
      ac.signal,
    )

    if (ac.signal.aborted) return

    // ── Step 3: Write files ───────────────────────────────────────────────
    updateTask(task, { detail: "Writing files..." })
    const writtenPaths = await writeBlocks(projectPath, generation)

    const summaryPath = `wiki/sources/${fileName.replace(/\.[^.]+$/, "")}.md`
    if (!writtenPaths.includes(summaryPath)) {
      const date = new Date().toISOString().slice(0, 10)
      const fallback = [
        "---",
        `type: source`,
        `title: "${fileName.replace(/\.[^.]+$/, "")}"`,
        `created: ${date}`,
        `updated: ${date}`,
        `sources: ["${fileName}"]`,
        `tags: []`,
        `related: []`,
        "---",
        "",
        `# Source: ${fileName}`,
        "",
        analysis ? analysis.slice(0, 3000) : "(Analysis not available)",
        "",
      ].join("\n")
      try {
        await writeWithMkdir(path.join(projectPath, summaryPath), fallback)
        writtenPaths.push(summaryPath)
      } catch { /* non-critical */ }
    }

    // ── Parse review items ─────────────────────────────────────────────────
    const reviewBlocks = parseReviewBlocksText(generation, sourcePath)
    if (reviewBlocks.length > 0) {
      pushEvent(task.id, { type: "review", items: reviewBlocks })
    }

    if (writtenPaths.length > 0) {
      await persistCache(projectPath, fileName, sourceContent, writtenPaths)
      scheduleIndexRebuild(projectPath)
    }

    const detail =
      writtenPaths.length > 0 ? `${writtenPaths.length} files written` : "No files generated"

    updateTask(task, {
      status: writtenPaths.length > 0 ? "done" : "error",
      detail,
      filesWritten: writtenPaths,
      error: writtenPaths.length > 0 ? null : "LLM did not produce any FILE blocks",
    })
  } catch (err) {
    if (ac.signal.aborted) return
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ingest-service] Task ${task.id} failed:`, err)
    updateTask(task, { status: "error", error: msg, detail: `Failed: ${msg.slice(0, 120)}` })
  } finally {
    abortControllers.delete(task.id)
  }
}
