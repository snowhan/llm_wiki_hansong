/**
 * Server-side ingest service.
 * Runs wiki generation tasks in the background, surviving page refreshes.
 * Progress is streamed to subscribers via SSE.
 *
 * Architecture change: tasks are now identified by (projectId, sourcePath)
 * instead of absolute paths. The server resolves the project root internally.
 */

import fs from "node:fs/promises"
import type { Dirent } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { Response } from "express"
import type { LlmConfig, ServerIngestTask } from "../types.js"
import { getProjectRoot } from "./project-service.js"
import { logLlmCall, nowBeijing } from "./ingest-audit-logger.js"
import { getState } from "./state-service.js"
import { getProviderConfig } from "../lib/llm-providers.js"
import type { ChatMessage } from "../lib/llm-providers.js"
import { llmDebugLogger, inferLlmCallSource } from "./llm-debug-logger.js"
import { supportsVision } from "../lib/vision-capability.js"
import {
  readImageAsBase64DataUri,
  extractEmbeddedImages,
} from "./preprocess-service.js"

// ── Imports from extracted modules ────────────────────────────────────────
import { extractFmField, extractMarkdownBody } from "./ingest-validators.js"
import {
  tryRead, writeWithMkdir,
  BINARY_EXTS, IMAGE_EXTS, MAX_IMAGES_PER_INGEST,
  buildMultimodalUserContent,
  parseFileBlocks, buildAllowedPaths,
  writeSingleBlock, writeBlocks, parseReviewBlocksText,
} from "./ingest-file-writer.js"
import {
  buildAnalysisPrompt, buildGenerationPrompt,
  parsePlan, summarizePlanCounts, sanitizeFilename,
  evaluatePlannedCountGate,
  buildSourceSummaryPrompt, buildSingleFilePrompt, buildSharedFilesPrompt,
  buildRebuildSummaryPrompt,
  parseMergePlan, buildDeduplicatePrompt, buildMergeContentPrompt,
} from "./ingest-prompts.js"
import type {
  PlanItem, PlanCountSummary, PlannedCountGateInput, PlannedCountGateResult, MergeGroup,
} from "./ingest-prompts.js"
import { checkCache, persistCache } from "./ingest-cache.js"

// ── Re-exports for backward compatibility ────────────────────────────────
export {
  normFrontmatter, setFmField, ensureCanonicalTitleType,
  isTitleFilenameConsistent, isBodyTitleSemanticallyConsistent, extractFmField,
} from "./ingest-validators.js"
export {
  buildMultimodalUserContent, parseFileBlocks, buildAllowedPaths,
} from "./ingest-file-writer.js"
export {
  buildAnalysisPrompt, buildGenerationPrompt,
  parsePlan, evaluatePlannedCountGate, summarizePlanCounts,
  sanitizeFilename,
  buildSourceSummaryPrompt, buildSingleFilePrompt, buildSharedFilesPrompt,
  buildRebuildSummaryPrompt,
  parseMergePlan, buildDeduplicatePrompt, buildMergeContentPrompt,
} from "./ingest-prompts.js"
export type {
  PlanItem, PlanCountSummary, PlannedCountGateInput, PlannedCountGateResult, MergeGroup,
} from "./ingest-prompts.js"

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

// ── File I/O helpers — moved to ingest-file-writer.ts ────────────────────
// (tryRead, writeWithMkdir, BINARY_EXTS, IMAGE_EXTS, MAX_IMAGES_PER_INGEST,
//  buildMultimodalUserContent, SHARED_ALLOWED — imported from ingest-file-writer.ts)

// ── Index rebuild ─────────────────────────────────────────────────────────

/**
 * Recursively collect all .md files under a directory.
 * Returns paths relative to `baseDir`.
 */
async function collectMdFiles(dir: string, baseDir: string): Promise<string[]> {
  const results: string[] = []
  let entries: Dirent[]
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

// ── Validator helpers — moved to ingest-validators.ts ────────────────────
// (extractFmField, extractMarkdownBody, normalizeForMatch, extractFirstHeading
//  — imported from ingest-validators.ts)

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
  let sourceEntries: Dirent[] = []
  try {
    sourceEntries = await fs.readdir(sourcesDir, { withFileTypes: true })
  } catch {
    await writeWithMkdir(path.join(wikiDir, "overview.md"), "# Wiki 概览\n\n暂无来源摘要。\n")
    return
  }

  const sourceSummaries = sourceEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))

  const allWikiFiles = await collectMdFiles(wikiDir, wikiDir)
  const stats = { source: 0, entity: 0, concept: 0, other: 0 }
  const entitySlugs: string[] = []
  const conceptSlugs: string[] = []

  for (const relPath of allWikiFiles) {
    if (INDEX_SKIP.has(path.basename(relPath))) continue
    const content = await tryRead(path.join(wikiDir, relPath))
    const type = extractFmField(content, "type")
    if (type === "source") stats.source += 1
    else if (type === "entity") {
      stats.entity += 1
      const slug = path.basename(relPath, ".md")
      entitySlugs.push(slug)
    } else if (type === "concept") {
      stats.concept += 1
      const slug = path.basename(relPath, ".md")
      conceptSlugs.push(slug)
    } else {
      stats.other += 1
    }
  }

  entitySlugs.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
  conceptSlugs.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))

  const lines: string[] = [
    "# Wiki 概览",
    "",
    "> 自动从当前 Wiki 页面生成。",
    "",
    "## 快照",
    "",
    `- 来源页面：${stats.source}`,
    `- 实体页面：${stats.entity}`,
    `- 概念页面：${stats.concept}`,
    `- 其他页面：${stats.other}`,
    "",
    "## 来源摘要",
    "",
  ]

  if (sourceSummaries.length === 0) {
    lines.push("- 暂未找到来源摘要页面。", "")
  } else {
    for (const fileName of sourceSummaries) {
      const relPath = `sources/${fileName}`
      const content = await tryRead(path.join(wikiDir, relPath))
      const title = extractFmField(content, "title") || fileName.replace(/\.md$/, "")
      // OPT-04: prefer description field over first body line
      const description = extractFmField(content, "description")
      let preview: string
      if (description && description.trim().length > 0) {
        preview = description.trim().slice(0, 120)
      } else {
        const body = extractMarkdownBody(content)
        const firstLine = body.split("\n").find((line) => line.trim().length > 0) ?? ""
        preview = firstLine.replace(/^#\s+/, "").slice(0, 90)
      }
      const slug = fileName.replace(/\.md$/, "")
      lines.push(`- [[${slug}]] — ${title}${preview ? `: ${preview}` : ""}`)
    }
    lines.push("")
  }

  // OPT-04: Key Entities section (top 10)
  if (entitySlugs.length > 0) {
    lines.push("## 核心实体", "")
    const top10 = entitySlugs.slice(0, 10)
    for (const slug of top10) {
      lines.push(`- [[${slug}]]`)
    }
    lines.push("")
  }

  // OPT-04: Key Concepts section (top 10)
  if (conceptSlugs.length > 0) {
    lines.push("## 核心概念", "")
    const top10 = conceptSlugs.slice(0, 10)
    for (const slug of top10) {
      lines.push(`- [[${slug}]]`)
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

// ── Ingest cache — moved to ingest-cache.ts ──────────────────────────────
// (CacheEntry, CacheData, loadCache, saveCache, checkCache, persistCache
//  — imported from ingest-cache.ts)

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
      source: inferLlmCallSource((messages as unknown) as Array<{ role: string; content: string }>),
      provider: llmConfig.provider,
      model: llmConfig.model ?? "",
      messages: (messages as unknown) as Array<{ role: "system" | "user" | "assistant"; content: string }>,
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
      source: inferLlmCallSource((messages as unknown) as Array<{ role: string; content: string }>),
      provider: llmConfig.provider,
      model: llmConfig.model ?? "",
      messages: (messages as unknown) as Array<{ role: "system" | "user" | "assistant"; content: string }>,
      output: outputText,
      durationMs: Date.now() - startMs,
      status: callError ? "error" : "done",
      ...(callError ? { error: callError } : {}),
    }).catch(() => {})
  }
}

// ── File blocks — moved to ingest-file-writer.ts ──────────────────────────
// (parseFileBlocks, normFrontmatter, setFmField, ensureCanonicalTitleType,
//  isTitleFilenameConsistent, isBodyTitleSemanticallyConsistent,
//  writeSingleBlock, buildAllowedPaths, writeBlocks, parseReviewBlocksText
//  — imported from ingest-file-writer.ts and ingest-validators.ts)

// ── Prompts — moved to ingest-prompts.ts ───────────────────────────────────
// (LANGUAGE_RULE, buildAnalysisPrompt, buildGenerationPrompt, PlanItem,
//  parsePlan, evaluatePlannedCountGate, sanitizeFilename,
//  buildSourceSummaryPrompt, buildSingleFilePrompt, buildSharedFilesPrompt
//  — imported from ingest-prompts.ts)

// ── Count gate helpers ─────────────────────────────────────────────────────

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

    const srcExt = path.extname(absSourcePath).toLowerCase().slice(1)

    // ── Handle standalone image files (vision ingest) ─────────────────────
    const isImageFile = IMAGE_EXTS.has(srcExt)
    let imageDataUris: string[] = []

    if (isImageFile) {
      if (!supportsVision(llmConfig.provider, llmConfig.model ?? "")) {
        updateTask(task, {
          status: "error",
          error: "Vision not supported",
          detail: `当前模型 (${llmConfig.model ?? llmConfig.provider}) 不支持视觉识别，无法处理图片文件。请在设置中切换支持视觉的模型（如 gpt-4o、claude-3、gemini-1.5-pro）。`,
        })
        return
      }
      try {
        const dataUri = await readImageAsBase64DataUri(absSourcePath)
        imageDataUris = [dataUri]
        updateTask(task, { detail: "Reading image for vision ingest..." })
      } catch (err) {
        updateTask(task, {
          status: "error",
          error: "Image read failed",
          detail: `无法读取图片文件: ${String(err)}`,
        })
        return
      }
    }

    // Guard: binary documents (PDF, DOCX…) must be preprocessed before ingest.
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

      // Collect embedded images from document (non-blocking, best-effort)
      if (supportsVision(llmConfig.provider, llmConfig.model ?? "")) {
        try {
          const embeddedPaths = await extractEmbeddedImages(absSourcePath)
          for (const imgPath of embeddedPaths.slice(0, MAX_IMAGES_PER_INGEST)) {
            try {
              const uri = await readImageAsBase64DataUri(imgPath)
              imageDataUris.push(uri)
            } catch { /* skip unreadable image */ }
          }
          if (imageDataUris.length > 0) {
            updateTask(task, { detail: `Reading source + ${imageDataUris.length} embedded image(s)...` })
          }
        } catch { /* image extraction is non-critical */ }
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
    const step1UserMsgText =
      `Analyze this source document:\n\n**File:** ${fileName}` +
      (folderContext ? `\n**Folder context:** ${folderContext}` : "") +
      (isImageFile ? "\n\nThis is an image file. Describe its content, extract all visible text, and identify key entities and concepts." : "") +
      (imageDataUris.length > 0 && !isImageFile ? `\n\n[${imageDataUris.length} embedded image(s) attached below]` : "") +
      `\n\n---\n\n${truncated}`
    const step1UserMsg = buildMultimodalUserContent(step1UserMsgText, imageDataUris)
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
      userMessage: typeof step1UserMsg === "string" ? step1UserMsg : "<multimodal content>",
      output: analysis,
    }).catch(() => {})

    if (ac.signal.aborted) return
    const plannedCounts = summarizePlanCounts(parsePlan(analysis))

    // ── Step 2: Generation ────────────────────────────────────────────────
    updateTask(task, { detail: "Step 2/2: Generating wiki pages..." })
    let generation = ""
    const step2SystemPrompt = buildGenerationPrompt(schema, purpose, existingSourcePaths, fileName, overview)
    const step2UserMsgText = [
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
    const step2UserMsg = buildMultimodalUserContent(step2UserMsgText, imageDataUris)
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
      userMessage: typeof step2UserMsg === "string" ? step2UserMsg : "<multimodal content>",
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

    // OPT-10: detect cross-source duplicates among newly written entity/concept pages
    const crossDupItems = await detectCrossSourceDuplicates(
      path.join(projectPath, "wiki"),
      writtenPaths,
    )

    const allReviewItems = [...reviewBlocks, ...crossDupItems]
    if (allReviewItems.length > 0) {
      pushEvent(task.id, { type: "review", items: allReviewItems })
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

// (buildRebuildSummaryPrompt — moved to ingest-prompts.ts)

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

    // ── 2. Build compact page listing (OPT-05: include description) ──────────
    const lines: string[] = []
    for (const relPath of relevantFiles) {
      const fullPath = path.join(wikiDir, relPath)
      let content = ""
      try { content = await fs.readFile(fullPath, "utf-8") } catch { continue }
      const typeVal = extractFmField(content, "type") || "other"
      const titleVal = extractFmField(content, "title") || relPath.replace(/\.md$/, "")
      const descVal = extractFmField(content, "description")
      const slug = path.basename(relPath, ".md")
      const descSuffix = descVal ? ` | desc: ${descVal}` : ""
      lines.push(`[${typeVal}] [[${slug}]] — ${titleVal}${descSuffix}`)
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
// (MergeGroup, parseMergePlan, buildDeduplicatePrompt, buildMergeContentPrompt
//  — moved to ingest-prompts.ts and imported from there)

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

    // ── 5. Execute merges (Round 2: per-group content merge) ─────────────────
    // MergeGroup.canonical / aliases are FULL REL-PATHS relative to wikiDir (no .md).
    // Example: "sources/2024/entities/珠海奥乐医院"
    const deletedFiles: string[] = []
    const skippedGroups: string[] = []

    for (let gi = 0; gi < mergeGroups.length; gi++) {
      const group = mergeGroups[gi]
      const { canonical: canonicalRelPath, aliases: aliasRelPaths } = group
      const canonicalSlug = path.basename(canonicalRelPath)
      const canonicalWikiPath = `wiki/${canonicalRelPath}.md`

      updateDeduplicateTask(task, {
        detail: `合并词条内容 (${gi + 1}/${mergeGroups.length})：${canonicalSlug}…`,
      })

      // Read full content for canonical + all aliases
      const allRelPaths = [canonicalRelPath, ...aliasRelPaths]
      const entries: { path: string; content: string }[] = []
      for (const relPath of allRelPaths) {
        try {
          const raw = await fs.readFile(path.join(wikiDir, `${relPath}.md`), "utf-8")
          entries.push({ path: `wiki/${relPath}.md`, content: raw })
        } catch {
          // File may not exist (already deleted in a previous run); skip it
        }
      }

      if (entries.length === 0) {
        skippedGroups.push(canonicalSlug)
        continue
      }

      // Round-2 LLM call: merge actual content
      let mergedContent = ""
      try {
        const mergePrompt = buildMergeContentPrompt(entries, canonicalWikiPath)
        let gen2 = ""
        await callLlm(llmConfig, [{ role: "user", content: mergePrompt }], (token: string) => { gen2 += token })
        const blocks = parseFileBlocks(gen2)
        mergedContent = blocks[0]?.content ?? ""
      } catch (mergeErr) {
        console.warn(`[deduplicate] Round-2 merge failed for ${canonicalSlug}:`, mergeErr)
      }

      if (!mergedContent) {
        skippedGroups.push(canonicalSlug)
        console.warn(`[deduplicate] Skipping group ${canonicalSlug}: no merged content produced`)
        continue
      }

      await writeWithMkdir(path.join(wikiDir, `${canonicalRelPath}.md`), mergedContent)

      // Delete each alias file and update [[aliasSlug]] → [[canonicalSlug]] links
      for (const aliasRelPath of aliasRelPaths) {
        const aliasSlug = path.basename(aliasRelPath)
        const aliasFullPath = path.join(wikiDir, `${aliasRelPath}.md`)
        try {
          await fs.unlink(aliasFullPath)
          deletedFiles.push(`wiki/${aliasRelPath}.md`)
        } catch { /* ignore if already gone */ }

        if (aliasSlug !== canonicalSlug) {
          await replaceWikiLinks(wikiDir, aliasSlug, canonicalSlug)
        }
      }
    }

    // ── 6. Rebuild index ─────────────────────────────────────────────────────
    scheduleIndexRebuild(projectPath)

    const successCount = mergeGroups.length - skippedGroups.length
    const skipNote = skippedGroups.length > 0
      ? `；${skippedGroups.length} 组合并失败已跳过（${skippedGroups.join("、")}）`
      : ""
    updateDeduplicateTask(task, {
      status: "done",
      detail: `已合并 ${successCount} 组词条，删除 ${deletedFiles.length} 个别名文件${skipNote}`,
      mergeCount: successCount,
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

/**
 * OPT-10: Scan the wiki directory for entity/concept pages that share a slug
 * across different source directories. Returns duplicate review items for any
 * newly written paths whose slug already exists under a different source.
 *
 * @param wikiDir - absolute path to the wiki/ directory
 * @param newlyWrittenPaths - wiki-relative paths that were just written (e.g. "wiki/sources/A/entities/foo.md")
 */
export async function detectCrossSourceDuplicates(
  wikiDir: string,
  newlyWrittenPaths: string[],
): Promise<Array<{ type: string; title: string; description: string; sourcePath: string; affectedPages?: string[]; options: Array<{ label: string; action: string }> }>> {
  const results: Array<{ type: string; title: string; description: string; sourcePath: string; affectedPages?: string[]; options: Array<{ label: string; action: string }> }> = []

  // Filter to only entity/concept paths
  const entityConceptPattern = /\/sources\/[^/]+\/(entities|concepts)\/[^/]+\.md$/
  const newEntCon = newlyWrittenPaths
    .map((p) => p.replace(/^wiki\//, ""))
    .filter((p) => entityConceptPattern.test(`/${p}`))

  if (newEntCon.length === 0) return results

  // Collect all existing entity/concept files indexed by [subtype][slug] -> [sourceDirs]
  const allMd = await collectMdFiles(wikiDir, wikiDir)
  const slugToSources = new Map<string, Set<string>>()

  for (const relPath of allMd) {
    const m = relPath.match(/^sources\/([^/]+)\/(entities|concepts)\/([^/]+)\.md$/)
    if (!m) continue
    const [, sourceDir, , slugName] = m
    const key = slugName
    if (!slugToSources.has(key)) slugToSources.set(key, new Set())
    slugToSources.get(key)!.add(sourceDir)
  }

  // Check newly written paths
  for (const relPath of newEntCon) {
    const m = relPath.match(/^sources\/([^/]+)\/(entities|concepts)\/([^/]+)\.md$/)
    if (!m) continue
    const [, newSource, , slugName] = m
    const existing = slugToSources.get(slugName)
    if (!existing) continue

    const otherSources = [...existing].filter((s) => s !== newSource)
    if (otherSources.length === 0) continue

    const affectedPages = [
      `wiki/${relPath}`,
      ...otherSources.map((s) => {
        const subtype = relPath.includes("/entities/") ? "entities" : "concepts"
        return `wiki/sources/${s}/${subtype}/${slugName}.md`
      }),
    ]

    results.push({
      type: "duplicate",
      title: `Cross-source duplicate: ${slugName}`,
      description: `"${slugName}" exists in multiple sources: ${[newSource, ...otherSources].join(", ")}. Consider deduplicating.`,
      sourcePath: `wiki/${relPath}`,
      affectedPages,
      options: [
        { label: "Deduplicate", action: "Deduplicate" },
        { label: "Skip", action: "Skip" },
      ],
    })
  }

  return results
}
