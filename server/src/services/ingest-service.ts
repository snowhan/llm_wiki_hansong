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
import { createHash, randomUUID } from "node:crypto"
import type { Response } from "express"
import type { LlmConfig, ServerIngestTask } from "../types.js"
import { getProjectRoot } from "./project-service.js"
import { logLlmCall, logFileChange, nowBeijing } from "./ingest-audit-logger.js"
import { getState } from "./state-service.js"
import { getProviderConfig } from "../lib/llm-providers.js"
import type { ChatMessage } from "../lib/llm-providers.js"
import { llmDebugLogger, inferLlmCallSource } from "./llm-debug-logger.js"

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

function extractMarkdownBody(content: string): string {
  const fmMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n?/)
  if (fmMatch) return content.slice(fmMatch[0].length).trim()
  return content.trim()
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "").replace(/[`*_[\]()#.:,，。！？!?\-]/g, "")
}

function extractFirstHeading(body: string): string {
  const m = body.match(/^#\s+(.+)\s*$/m)
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
 * Rebuild wiki/overview.md from current source summary pages.
 * This avoids LLM race/contamination on shared overview file under concurrent ingest.
 */
export async function rebuildWikiOverview(projectPath: string): Promise<void> {
  const wikiDir = path.join(projectPath, "wiki")
  const sourcesDir = path.join(wikiDir, "sources")
  let sourceEntries: fs.Dirent[] = []
  try {
    sourceEntries = await fs.readdir(sourcesDir, { withFileTypes: true })
  } catch {
    await writeWithMkdir(path.join(wikiDir, "overview.md"), "# Wiki Overview\n\nNo source summaries yet.\n")
    return
  }

  const sourceSummaries = sourceEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))

  const allWikiFiles = await collectMdFiles(wikiDir, wikiDir)
  const stats = { source: 0, entity: 0, concept: 0, other: 0 }
  for (const relPath of allWikiFiles) {
    if (INDEX_SKIP.has(path.basename(relPath))) continue
    const content = await tryRead(path.join(wikiDir, relPath))
    const type = extractFmField(content, "type")
    if (type === "source") stats.source += 1
    else if (type === "entity") stats.entity += 1
    else if (type === "concept") stats.concept += 1
    else stats.other += 1
  }

  const lines: string[] = [
    "# Wiki Overview",
    "",
    "> Auto-generated from current wiki pages.",
    "",
    "## Snapshot",
    "",
    `- Source pages: ${stats.source}`,
    `- Entity pages: ${stats.entity}`,
    `- Concept pages: ${stats.concept}`,
    `- Other pages: ${stats.other}`,
    "",
    "## Source Summaries",
    "",
  ]

  if (sourceSummaries.length === 0) {
    lines.push("- No source summary pages found.", "")
  } else {
    for (const fileName of sourceSummaries) {
      const relPath = `sources/${fileName}`
      const content = await tryRead(path.join(wikiDir, relPath))
      const title = extractFmField(content, "title") || fileName.replace(/\.md$/, "")
      const body = extractMarkdownBody(content)
      const firstLine = body.split("\n").find((line) => line.trim().length > 0) ?? ""
      const preview = firstLine.replace(/^#\s+/, "").slice(0, 90)
      const slug = fileName.replace(/\.md$/, "")
      lines.push(`- [[${slug}]] — ${title}${preview ? `: ${preview}` : ""}`)
    }
    lines.push("")
  }

  await writeWithMkdir(path.join(wikiDir, "overview.md"), lines.join("\n"))
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

/**
 * Per-project queue for overview rebuilds.
 * Serialises concurrent calls so multiple finishing ingest tasks never race
 * on writing wiki/overview.md simultaneously.
 */
const _overviewQueue = new Map<string, Promise<void>>()

function scheduleOverviewRebuild(projectPath: string): Promise<void> {
  const prev = _overviewQueue.get(projectPath) ?? Promise.resolve()
  const next = prev
    .then(() => rebuildWikiOverview(projectPath))
    .catch((err) => {
      console.error("[ingest-service] Overview rebuild failed:", err)
    })
  _overviewQueue.set(projectPath, next)
  return next
}

/**
 * Wait until all scheduled index rebuild work for a project is finished.
 * Used by ingest flow so task status "done" is published after index.md is up to date.
 */
export async function waitForIndexRebuild(projectPath: string): Promise<void> {
  const pending = _rebuildQueue.get(projectPath)
  if (!pending) return
  await pending
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
  const startMs = Date.now()
  let outputText = ""
  let callError: string | undefined

  const response = await fetch(pc.url, {
    method: "POST",
    headers: pc.headers,
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const err = await response.text().catch(() => "")
    callError = `LLM ${response.status}: ${err.slice(0, 200)}`
    llmDebugLogger.append({
      id: randomUUID(),
      timestamp: startMs,
      source: inferLlmCallSource(messages),
      provider: llmConfig.provider,
      model: llmConfig.model ?? "",
      messages: messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
      output: "",
      durationMs: Date.now() - startMs,
      status: "error",
      error: callError,
    }).catch(() => {})
    throw new Error(callError)
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
        if (t !== null) {
          outputText += t
          onToken(t)
        }
      }
    }
    if (buf.trim()) {
      const t = pc.parseStream(buf.trim())
      if (t !== null) {
        outputText += t
        onToken(t)
      }
    }
  } finally {
    reader.releaseLock()
    // Debug logging — non-blocking, never throws
    llmDebugLogger.append({
      id: randomUUID(),
      timestamp: startMs,
      source: inferLlmCallSource(messages),
      provider: llmConfig.provider,
      model: llmConfig.model ?? "",
      messages: messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
      output: outputText,
      durationMs: Date.now() - startMs,
      status: callError ? "error" : "done",
      ...(callError ? { error: callError } : {}),
    }).catch(() => {})
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

export function normFrontmatter(content: string): string {
  if (/^-{3}[ \t]*\r?\n/.test(content)) return content
  const m = content.match(/^((?:[a-z_][a-z0-9_]*[ \t]*:[ \t]*[^\n]*\n){2,})/)
  if (m) {
    return `---\n${m[1]}---\n\n${content.slice(m[1].length).replace(/^\n+/, "")}`
  }
  return content
}

/**
 * Set or insert a frontmatter key/value pair (the block between the --- delimiters).
 */
export function setFmField(fm: string, key: string, value: string): string {
  const line = `${key}: ${value}`
  const re = new RegExp(`^${key}:\\s*.*$`, "m")
  if (re.test(fm)) return fm.replace(re, line)
  return `${fm}\n${line}`.trim()
}

/**
 * Correct the `title` and `type` frontmatter fields to match the canonical
 * values derived from the file path.  Called by writeSingleBlock so that LLM
 * output with wrong titles never reaches disk.
 */
export function ensureCanonicalTitleType(rel: string, content: string): string {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---\n?)([\s\S]*)$/)
  if (!fmMatch) return content

  const canonicalType = rel === "wiki/overview.md"
    ? "overview"
    : rel.includes("/entities/") ? "entity"
    : rel.includes("/concepts/") ? "concept"
    : /^wiki\/sources\/[^/]+\.md$/.test(rel) ? "source"
    : null

  const entityMatch = rel.match(/^wiki\/sources\/.+\/(entities|concepts)\/([^/]+)\.md$/)
  const sourceMatch = rel.match(/^wiki\/sources\/([^/]+)\.md$/)
  const canonicalTitle = rel === "wiki/overview.md"
    ? "Wiki 总览"
    : entityMatch ? path.basename(rel, ".md")
    : sourceMatch ? sourceMatch[1]
    : null

  if (!canonicalType && !canonicalTitle) return content

  let fm = fmMatch[2]
  if (canonicalType) fm = setFmField(fm, "type", canonicalType)
  if (canonicalTitle) fm = setFmField(fm, "title", canonicalTitle)
  return `---\n${fm}\n---\n${fmMatch[4]}`
}


/**
 * Check that the frontmatter title in a wiki file matches the file's basename.
 * Returns true when consistent (or when the check is not applicable).
 * This is the invariant that prevents LLM path-content mismatches from reaching disk.
 */
export function isTitleFilenameConsistent(rel: string, content: string): boolean {
  const titleMatch = content.match(/^---\s*\n[\s\S]*?^title:\s*(.+?)\s*$/m)
  const titleInFrontmatter = titleMatch?.[1]?.trim()
  if (!titleInFrontmatter) return true // no title → let empty-content check handle it

  // 汇总页：wiki/sources/<base>.md（直接在 sources/ 下，不含子目录）
  const sourceSummaryMatch = rel.match(/^wiki\/sources\/([^/]+)\.md$/)
  if (sourceSummaryMatch) {
    return titleInFrontmatter.toLowerCase() === sourceSummaryMatch[1].toLowerCase()
  }

  // 实体/概念页：wiki/sources/<base>/entities/<name>.md 或 .../concepts/<name>.md
  if (!rel.match(/\/(entities|concepts)\/[^/]+\.md$/)) return true
  const fileBasename = path.basename(rel, ".md")
  return titleInFrontmatter.toLowerCase() === fileBasename.toLowerCase()
}

/**
 * Check semantic consistency between path/title/body for generated pages.
 * This blocks cases where filename/title are valid but body obviously belongs to another topic.
 */
export function isBodyTitleSemanticallyConsistent(rel: string, content: string): boolean {
  if (!rel.endsWith(".md")) return true
  if (rel === "wiki/log.md" || rel === "wiki/index.md" || rel === "wiki/overview.md") return true
  const titleMatch = content.match(/^---\s*\n[\s\S]*?^title:\s*(.+?)\s*$/m)
  const title = titleMatch?.[1]?.trim()
  if (!title) return true

  const expectedType = rel.includes("/entities/")
    ? "entity"
    : rel.includes("/concepts/")
      ? "concept"
      : null
  if (expectedType) {
    const type = extractFmField(content, "type")
    if (type && type !== expectedType) return false
  }

  const body = extractMarkdownBody(content)
  if (!body) return false
  const titleNorm = normalizeForMatch(title)
  const bodyNorm = normalizeForMatch(body)
  const heading = extractFirstHeading(body)
  if (heading) {
    const headingNorm = normalizeForMatch(heading)
    if (!headingNorm.includes(titleNorm) && !titleNorm.includes(headingNorm)) return false
  }

  if (rel.includes("/entities/") || rel.includes("/concepts/")) {
    const hasDirectMention = bodyNorm.includes(titleNorm)
    const hasWikilinkMention = body.includes(`[[${title}]]`)
    if (!hasDirectMention && !hasWikilinkMention) return false
  }

  const summaryMatch = rel.match(/^wiki\/sources\/([^/]+)\.md$/)
  if (summaryMatch) {
    const sourceBaseNorm = normalizeForMatch(summaryMatch[1])
    const hasSourceMention = bodyNorm.includes(sourceBaseNorm) || body.includes(`[[${summaryMatch[1]}]]`)
    if (!hasSourceMention) return false
  }

  return true
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
    content = ensureCanonicalTitleType(rel, content)
  }
  if (!isLogFile && !content.trim()) {
    console.warn(`[ingest-service] Skipping empty content for ${rel}`)
    return false
  }

  // TEST: title-filename 一致性校验暂时注释掉，用于测试错位是否由 LLM 输出本身导致
  // if (!isTitleFilenameConsistent(rel, content)) {
  //   const fileBasename = path.basename(rel, ".md")
  //   const titleMatch = content.match(/^---\s*\n[\s\S]*?^title:\s*(.+?)\s*$/m)
  //   console.warn(
  //     `[ingest-service] ⛔ REJECTED title-filename mismatch: path="${rel}" title="${titleMatch?.[1]?.trim()}" filename="${fileBasename}"`,
  //   )
  //   return false
  // }
  // TEST: semantic mismatch 拦截暂时注释掉，测试 LLM 原始输出写入磁盘的裸状态
  // if (!isBodyTitleSemanticallyConsistent(rel, content)) {
  //   const titleMatch = content.match(/^---\s*\n[\s\S]*?^title:\s*(.+?)\s*$/m)
  //   console.warn(
  //     `[ingest-service] ⛔ REJECTED semantic mismatch: path="${rel}" title="${titleMatch?.[1]?.trim() ?? ""}"`,
  //   )
  //   return false
  // }

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

async function writeBlocks(
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

function buildAnalysisPrompt(purpose: string, existingSourcePaths: string): string {
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
    "- Whether it likely already exists as a page for this source (check existing pages below)",
    "",
    "## Key Concepts",
    "List theories, methods, techniques, phenomena. For each:",
    "- Name and brief definition",
    "- Why it matters in this source",
    "- Whether it likely already exists as a page for this source",
    "",
    "## Main Arguments & Findings",
    "- What are the core claims or results?",
    "- What evidence supports them?",
    "- How strong is the evidence?",
    "",
    "## Connections to Existing Pages",
    "- What existing pages for this source does the new content relate to?",
    "- Does it strengthen, challenge, or extend existing knowledge?",
    "",
    "## Contradictions & Tensions",
    "- Are there internal tensions or caveats within this source?",
    "",
    "## Recommendations",
    "- What wiki pages should be created or updated for this source?",
    "- What should be emphasized vs. de-emphasized?",
    "- Any open questions worth flagging for the user?",
    "",
    "Be thorough but concise. Focus on what's genuinely important.",
    "",
    "If a folder context is provided, use it as a hint for categorization.",
    "",
    purpose ? `## Wiki Purpose (for context)\n${purpose}` : "",
    existingSourcePaths ? `## Existing pages for this source\n${existingSourcePaths}` : "",
  ].filter(Boolean).join("\n")
}

function buildGenerationPrompt(
  schema: string,
  purpose: string,
  existingSourcePaths: string,
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
    "4. A log entry for wiki/log.md (just the new entry to append, format: ## [YYYY-MM-DD] ingest | Title)",
    "5. An updated wiki/overview.md — a high-level summary of what the entire wiki covers, updated to reflect the newly ingested source.",
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
    existingSourcePaths ? `## Existing pages for this source (use [[wikilink]] syntax to reference them; skip regenerating if content is already correct)\n${existingSourcePaths}` : "",
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
export function parsePlan(analysis: string): PlanItem[] {
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

interface PlanCountSummary {
  expectedEntityNames: string[]
  expectedConceptNames: string[]
}

interface PlannedCountGateInput {
  expectedEntityNames: string[]
  expectedConceptNames: string[]
  actualEntityNames: string[]
  actualConceptNames: string[]
}

interface PlannedCountGateResult {
  ok: boolean
  detail?: string
}

function normalizeCountName(name: string): string {
  return name.trim().toLowerCase()
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const rawName of names) {
    const normalized = normalizeCountName(rawName)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(rawName.trim())
  }
  return result
}

function summarizePlanCounts(items: PlanItem[]): PlanCountSummary {
  const expectedEntityNames = dedupeNames(
    items.filter((item) => item.type === "entity").map((item) => item.name),
  )
  const expectedConceptNames = dedupeNames(
    items.filter((item) => item.type === "concept").map((item) => item.name),
  )
  return { expectedEntityNames, expectedConceptNames }
}

function findMissingPlannedNames(expectedNames: string[], actualNames: string[]): string[] {
  const actualSet = new Set(actualNames.map((name) => normalizeCountName(name)))
  return expectedNames.filter((name) => !actualSet.has(normalizeCountName(name)))
}

export function evaluatePlannedCountGate(input: PlannedCountGateInput): PlannedCountGateResult {
  const expectedEntityNames = dedupeNames(input.expectedEntityNames)
  const expectedConceptNames = dedupeNames(input.expectedConceptNames)
  const actualEntityNames = dedupeNames(input.actualEntityNames)
  const actualConceptNames = dedupeNames(input.actualConceptNames)

  const missingEntities = findMissingPlannedNames(expectedEntityNames, actualEntityNames)
  const missingConcepts = findMissingPlannedNames(expectedConceptNames, actualConceptNames)
  const entityMissingCount = Math.max(0, expectedEntityNames.length - actualEntityNames.length)
  const conceptMissingCount = Math.max(0, expectedConceptNames.length - actualConceptNames.length)

  if (entityMissingCount === 0 && conceptMissingCount === 0) {
    return { ok: true }
  }

  const details: string[] = [
    `planned_count_mismatch: expected entities=${expectedEntityNames.length}, concepts=${expectedConceptNames.length}; actual entities=${actualEntityNames.length}, concepts=${actualConceptNames.length}`,
  ]
  if (entityMissingCount > 0) {
    details.push(
      `missing entities=${entityMissingCount}` +
      (missingEntities.length > 0 ? ` sample=[${missingEntities.slice(0, 5).join(", ")}]` : ""),
    )
  }
  if (conceptMissingCount > 0) {
    details.push(
      `missing concepts=${conceptMissingCount}` +
      (missingConcepts.length > 0 ? ` sample=[${missingConcepts.slice(0, 5).join(", ")}]` : ""),
    )
  }
  return { ok: false, detail: details.join(" | ") }
}

async function collectActualWikiNames(
  projectPath: string,
  sourceBase: string,
): Promise<{ entityNames: string[]; conceptNames: string[] }> {
  const sourceRoot = path.join(projectPath, "wiki", "sources", sourceBase)
  const [entityFiles, conceptFiles] = await Promise.all([
    collectMdFiles(path.join(sourceRoot, "entities"), path.join(sourceRoot, "entities")),
    collectMdFiles(path.join(sourceRoot, "concepts"), path.join(sourceRoot, "concepts")),
  ])
  const entityNames = entityFiles
    .filter((relPath) => relPath.endsWith(".md"))
    .map((relPath) => path.basename(relPath, ".md"))
  const conceptNames = conceptFiles
    .filter((relPath) => relPath.endsWith(".md"))
    .map((relPath) => path.basename(relPath, ".md"))
  return { entityNames, conceptNames }
}

async function validatePostRebuildCountGate(
  projectPath: string,
  sourceBase: string,
  summary: PlanCountSummary,
): Promise<PlannedCountGateResult> {
  if (summary.expectedEntityNames.length === 0 && summary.expectedConceptNames.length === 0) {
    return { ok: true }
  }
  const actual = await collectActualWikiNames(projectPath, sourceBase)
  return evaluatePlannedCountGate({
    expectedEntityNames: summary.expectedEntityNames,
    expectedConceptNames: summary.expectedConceptNames,
    actualEntityNames: actual.entityNames,
    actualConceptNames: actual.conceptNames,
  })
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

    const [sourceContent, schema, purpose, overview] = await Promise.all([
      readSourceForIngest(absSourcePath),
      tryRead(path.join(projectPath, "schema.md")),
      tryRead(path.join(projectPath, "purpose.md")),
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

    // Compute source base and scan for existing pages under this source directory.
    // This gives the LLM awareness of previously ingested pages for this source
    // WITHOUT exposing content from other sources (which causes cross-source contamination).
    const sourceBase = fileName.replace(/\.[^.]+$/, "")
    const sourceDirAbs = path.join(projectPath, "wiki", "sources", sourceBase)
    const existingSourceFiles = await collectMdFiles(sourceDirAbs, path.join(projectPath, "wiki")).catch(
      () => [] as string[],
    )
    const existingSourcePaths = existingSourceFiles.length > 0
      ? existingSourceFiles.map((p) => `- wiki/${p}`).join("\n")
      : ""

    // ── Step 1: Analysis ──────────────────────────────────────────────────
    updateTask(task, { detail: "Step 1: Analyzing source..." })
    let analysis = ""
    const step1SystemPrompt = buildAnalysisPrompt(purpose, existingSourcePaths)
    const step1UserMsg =
      `Analyze this source document:\n\n**File:** ${fileName}` +
      (folderContext ? `\n**Folder context:** ${folderContext}` : "") +
      `\n\n---\n\n${truncated}`
    const step1Start = Date.now()

    await callLlm(
      llmConfig,
      [
        { role: "system", content: step1SystemPrompt },
        { role: "user", content: step1UserMsg },
      ],
      (token) => {
        analysis += token
        pushEvent(task.id, { type: "token", step: "1", token })
      },
      ac.signal,
    )

    logLlmCall(projectPath, {
      ts: nowBeijing(new Date(step1Start)),
      taskId: task.id,
      sourceFile: fileName,
      step: "1-analysis",
      model: llmConfig.model ?? "",
      durationMs: Date.now() - step1Start,
      status: "done",
      systemPrompt: step1SystemPrompt,
      userMessage: step1UserMsg,
      output: analysis,
    }).catch(() => {})

    if (ac.signal.aborted) return
    const plannedCounts = summarizePlanCounts(parsePlan(analysis))

    // ── Step 2: Generation ────────────────────────────────────────────────
    updateTask(task, { detail: "Step 2/2: Generating wiki pages..." })
    let generation = ""
    const step2SystemPrompt = buildGenerationPrompt(schema, purpose, existingSourcePaths, fileName, overview)
    const step2UserMsg = [
      `Based on the following analysis of **${fileName}**, generate the wiki files.`,
      "",
      "## Source Analysis",
      "",
      analysis,
      "",
      "## Original Source Content",
      "",
      truncated,
    ].join("\n")
    const step2Start = Date.now()

    await callLlm(
      llmConfig,
      [
        { role: "system", content: step2SystemPrompt },
        { role: "user", content: step2UserMsg },
      ],
      (token) => {
        generation += token
        pushEvent(task.id, { type: "token", step: "2", token })
      },
      ac.signal,
    )

    logLlmCall(projectPath, {
      ts: nowBeijing(new Date(step2Start)),
      taskId: task.id,
      sourceFile: fileName,
      step: "2-generation",
      model: llmConfig.model ?? "",
      durationMs: Date.now() - step2Start,
      status: "done",
      systemPrompt: step2SystemPrompt,
      userMessage: step2UserMsg,
      output: generation,
    }).catch(() => {})

    if (ac.signal.aborted) return

    // ── Step 3: Write files ───────────────────────────────────────────────
    updateTask(task, { detail: "Writing files..." })
    const writtenPaths = await writeBlocks(projectPath, generation, sourceBase, task.id, fileName)

    const summaryPath = `wiki/sources/${sourceBase}.md`
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
      // Rebuild index programmatically (unconditional — LLM is not allowed to write index.md).
      scheduleIndexRebuild(projectPath)
      await waitForIndexRebuild(projectPath)
      const rebuiltIndex = await tryRead(path.join(projectPath, "wiki", "index.md"))
      if (rebuiltIndex && !writtenPaths.includes("wiki/index.md")) writtenPaths.push("wiki/index.md")
      try {
        await scheduleOverviewRebuild(projectPath)
        const rebuiltOverview = await tryRead(path.join(projectPath, "wiki", "overview.md"))
        if (rebuiltOverview && !writtenPaths.includes("wiki/overview.md")) writtenPaths.push("wiki/overview.md")
      } catch (err) {
        console.error("[ingest-service] Overview rebuild failed:", err)
      }

      const countGate = await validatePostRebuildCountGate(projectPath, sourceBase, plannedCounts)
      if (!countGate.ok) {
        updateTask(task, {
          status: "error",
          detail: countGate.detail ?? "Planned count mismatch",
          filesWritten: writtenPaths,
          error: countGate.detail ?? "Planned count mismatch",
        })
        return
      }

      await persistCache(projectPath, fileName, sourceContent, writtenPaths)
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

// ── Rebuild Summary Task ──────────────────────────────────────────────────────
// A separate, manually-triggered task that uses LLM to generate high-quality
// wiki/index.md and wiki/overview.md based on all existing wiki pages.
// This runs independently from individual ingest tasks to avoid concurrent writes.

export interface RebuildSummaryTask {
  id: string
  projectId: string
  status: "pending" | "running" | "done" | "error"
  detail: string
  error: string | null
  filesWritten: string[]
  createdAt: number
  updatedAt: number
}

const _rebuildSummaryTasks = new Map<string, RebuildSummaryTask>()

/**
 * Create and enqueue a new rebuild-summary task for the given project.
 * Returns the taskId immediately; the task runs asynchronously.
 */
export function startRebuildSummaryTask(projectId: string): string {
  const taskId = randomUUID()
  const now = Date.now()
  const task: RebuildSummaryTask = {
    id: taskId,
    projectId,
    status: "pending",
    detail: "排队中…",
    error: null,
    filesWritten: [],
    createdAt: now,
    updatedAt: now,
  }
  _rebuildSummaryTasks.set(taskId, task)
  // Run asynchronously so the caller gets the taskId immediately.
  void runRebuildSummaryTask(task)
  return taskId
}

/**
 * Retrieve a rebuild-summary task by its ID.
 */
export function getRebuildSummaryTask(taskId: string): RebuildSummaryTask | undefined {
  return _rebuildSummaryTasks.get(taskId)
}

function updateRebuildSummaryTask(task: RebuildSummaryTask, updates: Partial<RebuildSummaryTask>): void {
  Object.assign(task, { ...updates, updatedAt: Date.now() })
}

/**
 * Build the LLM prompt for rebuilding wiki/index.md and wiki/overview.md.
 * @param pageListing - compact listing of all wiki pages (type, slug, title)
 */
export function buildRebuildSummaryPrompt(pageListing: string): string {
  return [
    "You are a wiki librarian. Generate two high-quality wiki meta-documents based on the existing wiki pages listed below.",
    "",
    LANGUAGE_RULE,
    "",
    "## Existing Wiki Pages",
    "",
    pageListing,
    "",
    "## Output Format",
    "",
    "Output each file in this exact format:",
    "",
    "---FILE: wiki/index.md---",
    "(complete file content)",
    "---END FILE---",
    "",
    "---FILE: wiki/overview.md---",
    "(complete file content)",
    "---END FILE---",
    "",
    "## Generate",
    "",
    "1. **wiki/index.md** — A well-organized catalog of all wiki pages.",
    "   - Group pages by type (Entities, Concepts, Sources, etc.).",
    "   - Each entry format: `- [[slug]] — Title`",
    "   - Do NOT include index.md, overview.md, or log.md themselves.",
    "",
    "2. **wiki/overview.md** — A high-level prose summary of the entire wiki.",
    "   - Describe the main topics, entities, and concepts covered.",
    "   - Mention the number of sources, entities, and concepts.",
    "   - Write in a clear, encyclopedic style.",
    "   - Begin with a YAML frontmatter block: `---\\ntype: overview\\ntitle: Wiki 总览\\n---`",
  ].join("\n")
}

/**
 * Execute the rebuild-summary task: scan wiki pages, call LLM, write files.
 */
async function runRebuildSummaryTask(task: RebuildSummaryTask): Promise<void> {
  const projectPath = await getProjectRoot(task.projectId).catch(() => null)
  if (!projectPath) {
    updateRebuildSummaryTask(task, {
      status: "error",
      detail: "Project not found",
      error: `Project not found: ${task.projectId}`,
    })
    return
  }

  updateRebuildSummaryTask(task, { status: "running", detail: "扫描 Wiki 页面…" })

  try {
    // ── 1. Collect all wiki pages ────────────────────────────────────────────
    const wikiDir = path.join(projectPath, "wiki")
    const mdFiles = await collectMdFiles(wikiDir, wikiDir)
    const skipFiles = new Set(["index.md", "overview.md", "log.md"])
    const relevantFiles = mdFiles.filter((f) => !skipFiles.has(path.basename(f)))

    if (relevantFiles.length === 0) {
      updateRebuildSummaryTask(task, {
        status: "error",
        detail: "Wiki 中尚无页面，无法生成摘要",
        error: "No wiki pages found",
      })
      return
    }

    // ── 2. Build compact page listing ────────────────────────────────────────
    const lines: string[] = []
    for (const relPath of relevantFiles) {
      const fullPath = path.join(wikiDir, relPath)
      let content = ""
      try { content = await fs.readFile(fullPath, "utf-8") } catch { continue }
      const typeVal = extractFmField(content, "type") || "other"
      const titleVal = extractFmField(content, "title") || relPath.replace(/\.md$/, "")
      const slug = path.basename(relPath, ".md")
      lines.push(`[${typeVal}] [[${slug}]] — ${titleVal}`)
    }

    const pageListing = lines.join("\n")
    const prompt = buildRebuildSummaryPrompt(pageListing)

    // ── 3. Call LLM ──────────────────────────────────────────────────────────
    updateRebuildSummaryTask(task, { detail: "调用 LLM 生成 index 和 overview…" })

    const llmConfig = await getState("llmConfig") as LlmConfig | null
    if (!llmConfig?.provider) {
      updateRebuildSummaryTask(task, {
        status: "error",
        detail: "LLM 未配置，请在设置中配置模型",
        error: "LLM is not configured",
      })
      return
    }

    let generation = ""
    const messages: ChatMessage[] = [{ role: "user", content: prompt }]
    await callLlm(
      llmConfig,
      messages,
      (token: string) => { generation += token },
    )

    // ── 4. Parse and write files ──────────────────────────────────────────────
    updateRebuildSummaryTask(task, { detail: "解析并写入文件…" })

    const blocks = parseFileBlocks(generation)
    const allowedOutputs = new Set(["wiki/index.md", "wiki/overview.md"])
    const written: string[] = []

    for (const { path: relRaw, content } of blocks) {
      const rel = path.posix.normalize(relRaw)
      if (!allowedOutputs.has(rel)) continue
      try {
        await writeWithMkdir(path.join(projectPath, rel), content)
        written.push(rel)
      } catch (err) {
        console.error(`[rebuild-summary] Failed to write ${rel}:`, err)
      }
    }

    if (written.length === 0) {
      updateRebuildSummaryTask(task, {
        status: "error",
        detail: "LLM 未生成有效的 index.md 或 overview.md",
        error: "LLM produced no valid FILE blocks",
      })
      return
    }

    updateRebuildSummaryTask(task, {
      status: "done",
      detail: `已重建：${written.join(", ")}`,
      filesWritten: written,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[rebuild-summary] Task ${task.id} failed:`, err)
    updateRebuildSummaryTask(task, {
      status: "error",
      detail: `失败: ${msg.slice(0, 120)}`,
      error: msg,
    })
  }
}

// ── Deduplicate Task ──────────────────────────────────────────────────────────

export interface MergeGroup {
  /**
   * Relative path from wikiDir to the canonical file, WITHOUT .md extension.
   * Example: "sources/2024/entities/珠海奥乐医院"
   * Using full paths (not just slugs) to correctly handle same-named files
   * from different source directories.
   */
  canonical: string
  /** Relative paths (same format as canonical) of files to merge into canonical and delete. */
  aliases: string[]
}

export interface DeduplicateTask {
  id: string
  projectId: string
  status: "pending" | "running" | "done" | "error"
  detail: string
  error: string | null
  mergeCount: number
  filesDeleted: string[]
  createdAt: number
  updatedAt: number
}

const _deduplicateTasks = new Map<string, DeduplicateTask>()

/**
 * Parse the ---MERGE-PLAN--- block from LLM output.
 * Returns an array of MergeGroup objects, or [] if absent/invalid.
 */
export function parseMergePlan(text: string): MergeGroup[] {
  const match = text.match(/---MERGE-PLAN---\s*([\s\S]*?)\s*---END MERGE-PLAN---/)
  if (!match || !match[1]) return []
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (g): g is MergeGroup =>
        typeof g === "object" && g !== null &&
        typeof g.canonical === "string" &&
        Array.isArray(g.aliases),
    )
  } catch {
    return []
  }
}

/**
 * Build the LLM prompt for deduplicating wiki entities and concepts.
 * @param pageListing - compact listing including full path, slug, title for each page
 */
export function buildDeduplicatePrompt(pageListing: string): string {
  return [
    "You are a wiki librarian. Analyze the wiki pages listed below and identify duplicate or semantically similar entries.",
    "",
    LANGUAGE_RULE,
    "",
    "## Existing Wiki Pages (entities and concepts only)",
    "",
    "Each line format: [type] path: wiki/<rel-path> | slug: [[slug]] | title: <title> | sources: <count>",
    "The `path` field is the UNIQUE identifier for each file (files can share the same slug but have different paths).",
    "",
    pageListing,
    "",
    "## Task",
    "",
    "1. Identify groups of pages that represent the same real-world entity or concept and should be merged.",
    "   - Only group pages that are clearly duplicates or near-duplicates.",
    "   - Do NOT group pages that are merely related.",
    "   - If no duplicates exist, output an empty MERGE-PLAN array.",
    "",
    "2. For each merge group, choose ONE canonical page:",
    "   - Prefer the page with the most source references.",
    "   - Tiebreak: longest body, then alphabetical path.",
    "   - Use the canonical page's FULL REL-PATH (without wiki/ prefix, without .md) as the `canonical` value.",
    "   - Use each alias page's FULL REL-PATH (without wiki/ prefix, without .md) as the `aliases` values.",
    "",
    "3. For each merge group, generate the merged canonical page content.",
    "   - Use the canonical page's EXACT full path (with wiki/ prefix and .md) as the FILE block path.",
    "",
    "## Output Format",
    "",
    "First output the merge plan (use FULL REL-PATHS, not just slugs):",
    "",
    "---MERGE-PLAN---",
    '[{"canonical":"sources/2024/entities/example","aliases":["sources/2025/entities/example"]},...]',
    "---END MERGE-PLAN---",
    "",
    "Then for each merge group output the merged canonical file:",
    "",
    "---FILE: wiki/sources/<source-base>/entities/<canonical-slug>.md---",
    "(complete merged file content with YAML frontmatter)",
    "---END FILE---",
    "",
    "CRITICAL: The `canonical` and `aliases` values in MERGE-PLAN must be the rel-path WITHOUT wiki/ prefix and WITHOUT .md.",
    "Example: `sources/2024/entities/珠海奥乐医院`  (NOT just `珠海奥乐医院`)",
    "",
    "If there are no duplicates to merge, output only:",
    "---MERGE-PLAN---",
    "[]",
    "---END MERGE-PLAN---",
  ].join("\n")
}

/**
 * Create and enqueue a new deduplicate task for the given project.
 * Returns the taskId immediately; the task runs asynchronously.
 */
export function startDeduplicateTask(projectId: string): string {
  const taskId = randomUUID()
  const now = Date.now()
  const task: DeduplicateTask = {
    id: taskId,
    projectId,
    status: "pending",
    detail: "排队中…",
    error: null,
    mergeCount: 0,
    filesDeleted: [],
    createdAt: now,
    updatedAt: now,
  }
  _deduplicateTasks.set(taskId, task)
  void runDeduplicateTask(task)
  return taskId
}

/**
 * Retrieve a deduplicate task by its ID.
 */
export function getDeduplicateTask(taskId: string): DeduplicateTask | undefined {
  return _deduplicateTasks.get(taskId)
}

function updateDeduplicateTask(task: DeduplicateTask, updates: Partial<DeduplicateTask>): void {
  Object.assign(task, { ...updates, updatedAt: Date.now() })
}

async function runDeduplicateTask(task: DeduplicateTask): Promise<void> {
  const projectPath = await getProjectRoot(task.projectId).catch(() => null)
  if (!projectPath) {
    updateDeduplicateTask(task, {
      status: "error",
      detail: "Project not found",
      error: `Project not found: ${task.projectId}`,
    })
    return
  }

  updateDeduplicateTask(task, { status: "running", detail: "扫描实体与概念词条…" })

  try {
    // ── 1. Collect entities + concepts from all source subdirectories ─────────
    // Real structure: wiki/sources/<source-base>/entities/ and .../concepts/
    const wikiDir = path.join(projectPath, "wiki")
    const sourcesDir = path.join(wikiDir, "sources")

    let sourceBases: string[] = []
    try {
      const entries = await fs.readdir(sourcesDir, { withFileTypes: true })
      sourceBases = entries.filter((e) => e.isDirectory()).map((e) => e.name)
    } catch { /* sources dir may not exist yet */ }

    // allFiles: paths relative to wikiDir, e.g. "sources/<base>/entities/ai.md"
    const allFiles: string[] = []
    for (const sourceBase of sourceBases) {
      const sourceRoot = path.join(sourcesDir, sourceBase)
      const [entityFiles, conceptFiles] = await Promise.all([
        collectMdFiles(path.join(sourceRoot, "entities"), wikiDir).catch(() => []),
        collectMdFiles(path.join(sourceRoot, "concepts"), wikiDir).catch(() => []),
      ])
      allFiles.push(...entityFiles, ...conceptFiles)
    }

    if (allFiles.length === 0) {
      updateDeduplicateTask(task, {
        status: "done",
        detail: "Wiki 中尚无实体或概念词条，无需去重",
        mergeCount: 0,
      })
      return
    }

    // ── 2. Build compact page listing (include full path for LLM) ────────────
    const lines: string[] = []
    for (const relPath of allFiles) {
      const fullPath = path.join(wikiDir, relPath)
      let content = ""
      try { content = await fs.readFile(fullPath, "utf-8") } catch { continue }
      const typeVal = extractFmField(content, "type") || "other"
      const titleVal = extractFmField(content, "title") || relPath.replace(/\.md$/, "")
      const slug = path.basename(relPath, ".md")
      const sourcesVal = extractFmField(content, "sources") || ""
      // Include full path so LLM can reference canonical file location precisely
      lines.push(`[${typeVal}] path: wiki/${relPath} | slug: [[${slug}]] | title: ${titleVal} | sources: ${sourcesVal || "none"}`)
    }

    const pageListing = lines.join("\n")
    const prompt = buildDeduplicatePrompt(pageListing)

    // ── 3. Call LLM ──────────────────────────────────────────────────────────
    updateDeduplicateTask(task, { detail: "调用 LLM 分析重复词条…" })

    const llmConfig = await getState("llmConfig") as LlmConfig | null
    if (!llmConfig?.provider) {
      updateDeduplicateTask(task, {
        status: "error",
        detail: "LLM 未配置，请在设置中配置模型",
        error: "LLM is not configured",
      })
      return
    }

    let generation = ""
    const messages: ChatMessage[] = [{ role: "user", content: prompt }]
    await callLlm(llmConfig, messages, (token: string) => { generation += token })

    // ── 4. Parse merge plan ───────────────────────────────────────────────────
    updateDeduplicateTask(task, { detail: "解析合并计划…" })
    const mergeGroups = parseMergePlan(generation)

    if (mergeGroups.length === 0) {
      updateDeduplicateTask(task, {
        status: "done",
        detail: "未发现重复词条，无需合并",
        mergeCount: 0,
      })
      return
    }

    // ── 5. Execute merges ────────────────────────────────────────────────────
    updateDeduplicateTask(task, { detail: `执行合并 (${mergeGroups.length} 组)…` })

    // blockMap: canonical slug (basename) → merged content
    // MergeGroup.canonical / aliases are now FULL REL-PATHS relative to wikiDir (no .md).
    // Example: "sources/2024/entities/珠海奥乐医院"
    const fileBlocks = parseFileBlocks(generation)
    const blockMap = new Map(fileBlocks.map((b) => [path.basename(b.path, ".md"), b.content]))
    const deletedFiles: string[] = []

    for (const group of mergeGroups) {
      const { canonical: canonicalRelPath, aliases: aliasRelPaths } = group
      const canonicalSlug = path.basename(canonicalRelPath)

      // Write canonical merged content to its exact path
      const mergedContent = blockMap.get(canonicalSlug)
      if (mergedContent) {
        await writeWithMkdir(path.join(wikiDir, `${canonicalRelPath}.md`), mergedContent)
      }

      // Delete each alias file and update [[aliasSlug]] → [[canonicalSlug]] links
      for (const aliasRelPath of aliasRelPaths) {
        const aliasSlug = path.basename(aliasRelPath)
        const aliasFullPath = path.join(wikiDir, `${aliasRelPath}.md`)
        try {
          await fs.unlink(aliasFullPath)
          deletedFiles.push(`wiki/${aliasRelPath}.md`)
        } catch { /* ignore if already gone */ }

        // Only replace links when slugs differ (same-slug merges just delete the alias file)
        if (aliasSlug !== canonicalSlug) {
          await replaceWikiLinks(wikiDir, aliasSlug, canonicalSlug)
        }
      }
    }

    // ── 6. Rebuild index ─────────────────────────────────────────────────────
    scheduleIndexRebuild(projectPath)

    updateDeduplicateTask(task, {
      status: "done",
      detail: `已合并 ${mergeGroups.length} 组词条，删除 ${deletedFiles.length} 个别名文件`,
      mergeCount: mergeGroups.length,
      filesDeleted: deletedFiles,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[deduplicate] Task ${task.id} failed:`, err)
    updateDeduplicateTask(task, {
      status: "error",
      detail: `失败: ${msg.slice(0, 120)}`,
      error: msg,
    })
  }
}

/**
 * Replace all [[aliasSlug]] wiki links with [[canonicalSlug]] in every .md
 * file under wikiDir.
 */
async function replaceWikiLinks(wikiDir: string, aliasSlug: string, canonicalSlug: string): Promise<void> {
  const allMd = await collectMdFiles(wikiDir, wikiDir).catch(() => [])
  const pattern = new RegExp(`\\[\\[${escapeRegex(aliasSlug)}\\]\\]`, "g")
  const replacement = `[[${canonicalSlug}]]`
  for (const relPath of allMd) {
    const fullPath = path.join(wikiDir, relPath)
    try {
      const content = await fs.readFile(fullPath, "utf-8")
      if (!pattern.test(content)) continue
      pattern.lastIndex = 0
      await fs.writeFile(fullPath, content.replace(pattern, replacement), "utf-8")
    } catch { /* ignore */ }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
