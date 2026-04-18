/**
 * Server-side ingest service.
 * Mirrors the browser-side autoIngest logic but runs inside the Node.js process,
 * so it survives page refreshes.  Progress is streamed to subscribers via SSE.
 */

import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import type { Response } from "express"

// ── LLM config type (mirrors frontend wiki-store.ts) ─────────────────────

export interface LlmConfig {
  provider: "openai" | "anthropic" | "google" | "ollama" | "custom" | "minimax" | "wps"
  apiKey: string
  model: string
  ollamaUrl: string
  customEndpoint: string
  maxContextSize: number
}

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

// ── Task types ────────────────────────────────────────────────────────────

export type IngestTaskStatus = "pending" | "running" | "done" | "error"

export interface ServerIngestTask {
  id: string
  projectPath: string
  sourcePath: string
  folderContext: string
  status: IngestTaskStatus
  detail: string
  filesWritten: string[]
  error: string | null
  createdAt: number
  updatedAt: number
}

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
  // Send current snapshot immediately so reconnect gets the latest state
  const task = taskStore.get(taskId)
  if (task) {
    try { res.write(`data: ${JSON.stringify({ type: "state", task })}\n\n`) } catch { /* client gone */ }
  }
}

export function unregisterSseClient(taskId: string, res: Response) {
  sseClients.get(taskId)?.delete(res)
}

function updateTask(task: ServerIngestTask, patch: Partial<ServerIngestTask>) {
  Object.assign(task, patch, { updatedAt: Date.now() })
  pushEvent(task.id, { type: "update", task })
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
 */
export function startIngestTask(
  projectPath: string,
  sourcePath: string,
  llmConfig: LlmConfig,
  folderContext = "",
): string {
  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const task: ServerIngestTask = {
    id,
    projectPath,
    sourcePath,
    folderContext,
    status: "pending",
    detail: "Queued",
    filesWritten: [],
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  taskStore.set(id, task)

  // Fire and forget — progress is streamed via SSE
  runIngest(task, llmConfig).catch((err) => {
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
    const raw = await fs.readFile(path.join(projectPath, ".llm-wiki", "ingest-cache.json"), "utf-8")
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

async function checkCache(projectPath: string, fileName: string, content: string): Promise<string[] | null> {
  const cache = await loadCache(projectPath)
  const entry = cache.entries[fileName]
  if (!entry) return null
  return entry.hash === sha256(content) ? entry.filesWritten : null
}

async function persistCache(projectPath: string, fileName: string, content: string, files: string[]): Promise<void> {
  const cache = await loadCache(projectPath)
  cache.entries[fileName] = { hash: sha256(content), timestamp: Date.now(), filesWritten: files }
  await saveCache(projectPath, cache)
}

// ── LLM provider (mirrors frontend llm-providers.ts) ─────────────────────

interface ProviderCfg {
  url: string
  headers: Record<string, string>
  body: unknown
  parseStream: (line: string) => string | null
}

function parseOpenAi(line: string): string | null {
  if (!line.startsWith("data: ")) return null
  const d = line.slice(6).trim()
  if (d === "[DONE]") return null
  try { return (JSON.parse(d) as { choices: Array<{ delta: { content?: string } }> }).choices?.[0]?.delta?.content ?? null }
  catch { return null }
}

function parseAnthropic(line: string): string | null {
  if (!line.startsWith("data: ")) return null
  try {
    const p = JSON.parse(line.slice(6).trim()) as { type: string; delta?: { type: string; text?: string } }
    return p.type === "content_block_delta" && p.delta?.type === "text_delta" ? (p.delta.text ?? null) : null
  } catch { return null }
}

function parseGoogle(line: string): string | null {
  if (!line.startsWith("data: ")) return null
  try {
    const p = JSON.parse(line.slice(6).trim()) as { candidates: Array<{ content: { parts: Array<{ text?: string }> } }> }
    return p.candidates?.[0]?.content?.parts?.[0]?.text ?? null
  } catch { return null }
}

function buildProviderCfg(config: LlmConfig, messages: ChatMessage[]): ProviderCfg {
  const { provider, apiKey, model, ollamaUrl, customEndpoint } = config

  const openAiBody = () => ({ messages, stream: true, model })

  switch (provider) {
    case "openai":
      return {
        url: "https://api.openai.com/v1/chat/completions",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: openAiBody(),
        parseStream: parseOpenAi,
      }

    case "anthropic": {
      const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n") || undefined
      const conv = messages.filter((m) => m.role !== "system")
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: { messages: conv, ...(sys ? { system: sys } : {}), stream: true, max_tokens: 4096, model },
        parseStream: parseAnthropic,
      }
    }

    case "google": {
      const sys = messages.filter((m) => m.role === "system")
      const conv = messages.filter((m) => m.role !== "system").map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }))
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: {
          contents: conv,
          ...(sys.length > 0 ? { systemInstruction: { parts: sys.map((m) => ({ text: m.content })) } } : {}),
        },
        parseStream: parseGoogle,
      }
    }

    case "ollama":
      return {
        url: `${ollamaUrl}/v1/chat/completions`,
        headers: { "Content-Type": "application/json" },
        body: openAiBody(),
        parseStream: parseOpenAi,
      }

    case "minimax":
      return {
        url: "https://api.minimax.io/v1/chat/completions",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: { messages, stream: true, model, temperature: 1.0 },
        parseStream: parseOpenAi,
      }

    case "wps": {
      const wpsUrl = process.env.VITE_WPS_GATEWAY_URL ?? "http://ai-gateway.wps.cn/api/v3"
      const wpsToken = (process.env.VITE_WPS_GATEWAY_TOKEN ?? apiKey) || apiKey
      const wpsModel = model || (process.env.VITE_WPS_GATEWAY_MODEL ?? "azure/gpt-5.4")
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${wpsToken}`,
      }
      if (process.env.VITE_WPS_GATEWAY_UID) headers["Ai-Gateway-Uid"] = process.env.VITE_WPS_GATEWAY_UID
      if (process.env.VITE_WPS_GATEWAY_PRODUCT_NAME) headers["Ai-Gateway-Product-Name"] = process.env.VITE_WPS_GATEWAY_PRODUCT_NAME
      return {
        url: `${wpsUrl}/chat/completions`,
        headers,
        body: { messages, stream: true, model: wpsModel },
        parseStream: parseOpenAi,
      }
    }

    case "custom":
      return {
        url: `${customEndpoint}/chat/completions`,
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: openAiBody(),
        parseStream: parseOpenAi,
      }

    default: {
      const x: never = provider
      throw new Error(`Unknown provider: ${String(x)}`)
    }
  }
}

async function callLlm(
  config: LlmConfig,
  messages: ChatMessage[],
  onToken: (t: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const pc = buildProviderCfg(config, messages)

  const response = await fetch(pc.url, {
    method: "POST",
    headers: pc.headers,
    body: JSON.stringify(pc.body),
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

const FILE_BLOCK_RE = /---FILE:\s*([^\n-]+?)\s*---\n([\s\S]*?)---END FILE---/g

function normFrontmatter(content: string): string {
  if (/^-{3}[ \t]*\r?\n/.test(content)) return content
  const m = content.match(/^((?:[a-z_][a-z0-9_]*[ \t]*:[ \t]*[^\n]*\n){2,})/)
  if (m) {
    return `---\n${m[1]}---\n\n${content.slice(m[1].length).replace(/^\n+/, "")}`
  }
  return content
}

async function writeBlocks(projectPath: string, text: string): Promise<string[]> {
  const written: string[] = []
  for (const match of text.matchAll(FILE_BLOCK_RE)) {
    const rel = match[1].trim()
    let content = match[2]
    if (!rel) continue

    if (rel.endsWith(".md") && !rel.endsWith("/log.md") && rel !== "wiki/log.md") {
      content = normFrontmatter(content)
    }
    if (!rel.endsWith("/log.md") && rel !== "wiki/log.md" && !content.trim()) {
      console.warn(`[ingest-service] Skipping empty content for ${rel}`)
      continue
    }

    const full = path.join(projectPath, rel)
    try {
      if (rel === "wiki/log.md" || rel.endsWith("/log.md")) {
        const existing = await tryRead(full)
        await writeWithMkdir(full, existing ? `${existing}\n\n${content.trim()}` : content.trim())
      } else {
        await writeWithMkdir(full, content)
      }
      written.push(rel)
    } catch (err) {
      console.error(`[ingest-service] Write failed ${rel}:`, err)
    }
  }
  return written
}

// ── Prompts (copied from src/lib/ingest.ts) ───────────────────────────────

const LANGUAGE_RULE = "## Language Rule\n- ALWAYS match the language of the source document. If the source is in Chinese, write in Chinese. If in English, write in English. Wiki page titles, content, and descriptions should all be in the same language as the source material."

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
    "If a folder context is provided, use it as a hint for categorization — the folder structure often reflects the user's organizational intent.",
    "",
    purpose ? `## Wiki Purpose (for context)\n${purpose}` : "",
    index ? `## Current Wiki Index (for checking existing content)\n${index}` : "",
  ].filter(Boolean).join("\n")
}

function buildGenerationPrompt(schema: string, purpose: string, index: string, sourceFileName: string, overview?: string): string {
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
    "(complete file content with YAML frontmatter)",
    "---END FILE---",
    "",
    "Generate:",
    `1. A source summary page at **wiki/sources/${base}.md** (MUST use this exact path)`,
    "2. Entity pages in wiki/entities/ for key entities identified in the analysis",
    "3. Concept pages in wiki/concepts/ for key concepts identified in the analysis",
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
    "- Use kebab-case filenames",
    "- Follow the analysis recommendations on what to emphasize",
    "- If the analysis found connections to existing pages, add cross-references",
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

// ── Main ingest runner ────────────────────────────────────────────────────

async function runIngest(task: ServerIngestTask, llmConfig: LlmConfig): Promise<void> {
  const { projectPath, sourcePath, folderContext } = task
  const fileName = path.basename(sourcePath)
  const ac = new AbortController()
  abortControllers.set(task.id, ac)

  try {
    updateTask(task, { status: "running", detail: "Reading source..." })

    const [sourceContent, schema, purpose, index, overview] = await Promise.all([
      readSourceForIngest(sourcePath),
      tryRead(path.join(projectPath, "schema.md")),
      tryRead(path.join(projectPath, "purpose.md")),
      tryRead(path.join(projectPath, "wiki", "index.md")),
      tryRead(path.join(projectPath, "wiki", "overview.md")),
    ])

    // Cache check
    const cached = await checkCache(projectPath, fileName, sourceContent)
    if (cached !== null) {
      updateTask(task, {
        status: "done",
        detail: `Skipped (unchanged) — ${cached.length} files from previous ingest`,
        filesWritten: cached,
      })
      return
    }

    const truncated = sourceContent.length > 50000
      ? sourceContent.slice(0, 50000) + "\n\n[...truncated...]"
      : sourceContent

    // ── Step 1: Analysis ────────────────────────────────────────────────
    updateTask(task, { detail: "Step 1/2: Analyzing source..." })
    let analysis = ""

    await callLlm(
      llmConfig,
      [
        { role: "system", content: buildAnalysisPrompt(purpose, index) },
        {
          role: "user",
          content: `Analyze this source document:\n\n**File:** ${fileName}${folderContext ? `\n**Folder context:** ${folderContext}` : ""}\n\n---\n\n${truncated}`,
        },
      ],
      (token) => {
        analysis += token
        pushEvent(task.id, { type: "token", step: "1", token })
      },
      ac.signal,
    )

    if (ac.signal.aborted) return

    // ── Step 2: Generation ──────────────────────────────────────────────
    updateTask(task, { detail: "Step 2/2: Generating wiki pages..." })
    let generation = ""

    await callLlm(
      llmConfig,
      [
        { role: "system", content: buildGenerationPrompt(schema, purpose, index, fileName, overview) },
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

    // ── Step 3: Write files ─────────────────────────────────────────────
    updateTask(task, { detail: "Writing files..." })
    const writtenPaths = await writeBlocks(projectPath, generation)

    // Ensure source summary page exists
    const hasSummary = writtenPaths.some((p) => p.startsWith("wiki/sources/"))
    if (!hasSummary) {
      const date = new Date().toISOString().slice(0, 10)
      const fallback = [
        "---",
        `type: source`,
        `title: "Source: ${fileName}"`,
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
      const rel = `wiki/sources/${fileName.replace(/\.[^.]+$/, "")}.md`
      try {
        await writeWithMkdir(path.join(projectPath, rel), fallback)
        writtenPaths.push(rel)
      } catch { /* non-critical */ }
    }

    // ── Step 4: Save cache ──────────────────────────────────────────────
    if (writtenPaths.length > 0) {
      await persistCache(projectPath, fileName, sourceContent, writtenPaths)
    }

    const detail = writtenPaths.length > 0
      ? `${writtenPaths.length} files written`
      : "No files generated"

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
