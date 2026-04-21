/**
 * Server-side research service.
 * Runs deep-research tasks in the background, surviving page refreshes.
 * Progress is streamed to subscribers via SSE.
 *
 * Pipeline: web search (Tavily) → LLM synthesis (streaming) → write wiki file → auto-ingest
 */

import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { Response } from "express"
import type { LlmConfig } from "../types.js"
import { getState } from "./state-service.js"
import { getProjectRoot } from "./project-service.js"
import { getProviderConfig } from "../lib/llm-providers.js"
import type { ChatMessage } from "../lib/llm-providers.js"
import { startIngestTask } from "./ingest-service.js"

// ── Types ─────────────────────────────────────────────────────────────────

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  source: string
}

export interface ServerResearchTask {
  id: string
  projectId: string
  topic: string
  searchQueries: string[]
  status: "queued" | "searching" | "synthesizing" | "saving" | "done" | "error"
  webResults: WebSearchResult[]
  synthesis: string
  savedPath: string | null
  error: string | null
  createdAt: number
  updatedAt: number
}

// ── In-memory stores ──────────────────────────────────────────────────────

const taskStore = new Map<string, ServerResearchTask>()
const sseClients = new Map<string, Set<Response>>()
const abortControllers = new Map<string, AbortController>()

const MAX_CONCURRENT = 3

// ── SSE helpers ───────────────────────────────────────────────────────────

function pushEvent(taskId: string, event: object) {
  const clients = sseClients.get(taskId)
  if (!clients?.size) return
  const payload = `data: ${JSON.stringify(event)}\n\n`
  for (const res of clients) {
    try { res.write(payload) } catch { /* client gone */ }
  }
}

export function registerResearchSseClient(taskId: string, res: Response) {
  if (!sseClients.has(taskId)) sseClients.set(taskId, new Set())
  sseClients.get(taskId)!.add(res)
  const task = taskStore.get(taskId)
  if (task) {
    try { res.write(`data: ${JSON.stringify({ type: "state", task })}\n\n`) } catch { /* client gone */ }
  }
}

export function unregisterResearchSseClient(taskId: string, res: Response) {
  const clients = sseClients.get(taskId)
  if (!clients) return
  clients.delete(res)
  if (clients.size === 0) sseClients.delete(taskId)
}

function patchTask(task: ServerResearchTask, patch: Partial<ServerResearchTask>) {
  Object.assign(task, patch, { updatedAt: Date.now() })
  if (task.status === "done") {
    pushEvent(task.id, { type: "done", task })
  } else if (task.status === "error") {
    pushEvent(task.id, { type: "error", task, message: task.error ?? "Unknown error" })
  } else {
    pushEvent(task.id, { type: "update", task })
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export function getResearchTask(taskId: string): ServerResearchTask | undefined {
  return taskStore.get(taskId)
}

export function getAllResearchTasks(projectId?: string): ServerResearchTask[] {
  const all = Array.from(taskStore.values())
  if (!projectId) return all
  return all.filter((t) => t.projectId === projectId)
}

/**
 * Start a server-side research task.
 * Returns immediately with a taskId; the actual work runs asynchronously.
 *
 * Deduplication: if a task for the same (projectId, topic) is already
 * queued/searching/synthesizing/saving, return that task's id.
 */
export function startResearchTask(
  projectId: string,
  topic: string,
  searchQueries?: string[],
): string {
  const activeStatuses = new Set(["queued", "searching", "synthesizing", "saving"])
  const existing = Array.from(taskStore.values()).find(
    (t) =>
      t.projectId === projectId &&
      t.topic === topic &&
      activeStatuses.has(t.status),
  )
  if (existing) {
    console.log(`[research-service] Reusing existing task ${existing.id} for topic "${topic}"`)
    return existing.id
  }

  const id = `research_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const task: ServerResearchTask = {
    id,
    projectId,
    topic,
    searchQueries: searchQueries ?? [],
    status: "queued",
    webResults: [],
    synthesis: "",
    savedPath: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  taskStore.set(id, task)

  processQueue()

  return id
}

/**
 * Cancel a running or queued research task.
 */
export function cancelResearchTask(taskId: string): void {
  const task = taskStore.get(taskId)
  if (!task) return
  const ac = abortControllers.get(taskId)
  if (ac) {
    ac.abort()
    abortControllers.delete(taskId)
  }
  patchTask(task, { status: "error", error: "Cancelled by user" })
}

// ── Queue processing ──────────────────────────────────────────────────────

function getRunningCount(): number {
  const activeStatuses = new Set(["searching", "synthesizing", "saving"])
  return Array.from(taskStore.values()).filter((t) => activeStatuses.has(t.status)).length
}

function getNextQueued(): ServerResearchTask | undefined {
  return Array.from(taskStore.values()).find((t) => t.status === "queued")
}

function processQueue() {
  const running = getRunningCount()
  const available = MAX_CONCURRENT - running
  for (let i = 0; i < available; i++) {
    const next = getNextQueued()
    if (!next) break
    runResearch(next).catch((err) => {
      console.error(`[research-service] Unhandled error for task ${next.id}:`, err)
      patchTask(next, { status: "error", error: String(err) })
    })
  }
}

// ── Research pipeline ─────────────────────────────────────────────────────

async function runResearch(task: ServerResearchTask): Promise<void> {
  const ac = new AbortController()
  abortControllers.set(task.id, ac)

  try {
    // ── Step 0: resolve project path and configs ──────────────────────────
    const projectPath = await getProjectRoot(task.projectId)

    const rawLlm = await getState("llmConfig")
    const llmConfig = rawLlm as LlmConfig

    const rawSearch = await getState("searchApiConfig")
    const searchConfig = rawSearch as { provider: string; apiKey: string }

    // ── Step 1: Web search ────────────────────────────────────────────────
    patchTask(task, { status: "searching" })

    const queries =
      task.searchQueries.length > 0 ? task.searchQueries : [task.topic]

    const allResults: WebSearchResult[] = []
    const seenUrls = new Set<string>()

    for (const query of queries) {
      if (ac.signal.aborted) throw new Error("Cancelled by user")
      try {
        const results = await tavilySearch(query, searchConfig.apiKey, 5, ac.signal)
        for (const r of results) {
          if (!seenUrls.has(r.url)) {
            seenUrls.add(r.url)
            allResults.push(r)
          }
        }
      } catch (err) {
        if (ac.signal.aborted) throw err
        console.warn(`[research-service] Search query failed: "${query}"`, err)
      }
    }

    patchTask(task, { webResults: allResults })

    if (allResults.length === 0) {
      patchTask(task, { status: "done", synthesis: "No web results found." })
      return
    }

    // ── Step 2: LLM synthesis ─────────────────────────────────────────────
    patchTask(task, { status: "synthesizing" })

    const searchContext = allResults
      .map((r, i) => `[${i + 1}] **${r.title}** (${r.source})\n${r.snippet}`)
      .join("\n\n")

    let wikiIndex = ""
    try {
      wikiIndex = await fs.readFile(path.join(projectPath, "wiki", "index.md"), "utf-8")
    } catch { /* no index yet */ }

    const systemPrompt = [
      "You are a research assistant. Synthesize the web search results into a comprehensive wiki page.",
      "",
      "## Language Rule",
      "- ALWAYS match the language of the research topic.",
      "",
      "## Cross-referencing",
      "- When mentioning entities/concepts that exist in the wiki, use [[wikilink]] syntax.",
      "",
      "## Writing Rules",
      "- Organize into clear sections with headings",
      "- Cite web sources using [N] notation",
      "- Note contradictions or gaps",
      "- Neutral, encyclopedic tone",
      "",
      wikiIndex ? `## Existing Wiki Index\n${wikiIndex}` : "",
    ].filter(Boolean).join("\n")

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Research topic: **${task.topic}**\n\n## Web Search Results\n\n${searchContext}\n\nSynthesize into a wiki page.`,
      },
    ]

    let accumulated = ""

    await callLlmStreaming(llmConfig, messages, (token) => {
      accumulated += token
      pushEvent(task.id, { type: "token", token })
      // Update synthesis in store without triggering full SSE update each token
      task.synthesis = accumulated
      task.updatedAt = Date.now()
    }, ac.signal)

    if (ac.signal.aborted) throw new Error("Cancelled by user")

    // ── Step 3: Save to wiki ──────────────────────────────────────────────
    patchTask(task, { status: "saving", synthesis: accumulated })

    const date = new Date().toISOString().slice(0, 10)
    const slug = task.topic
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 50)
    const fileName = `research-${slug}-${date}.md`
    const savedPath = `wiki/queries/${fileName}`

    const cleanedSynthesis = accumulated
      .replace(/<think(?:ing)?>\s*[\s\S]*?<\/think(?:ing)?>\s*/gi, "")
      .replace(/<think(?:ing)?>\s*[\s\S]*$/gi, "")
      .trimStart()

    const references = allResults
      .map((r, i) => `${i + 1}. [${r.title}](${r.url}) — ${r.source}`)
      .join("\n")

    const pageContent = [
      "---",
      `type: query`,
      `title: "Research: ${task.topic.replace(/"/g, '\\"')}"`,
      `created: ${date}`,
      `origin: deep-research`,
      `tags: [research]`,
      "---",
      "",
      `# Research: ${task.topic}`,
      "",
      cleanedSynthesis,
      "",
      "## References",
      "",
      references,
      "",
    ].join("\n")

    const fullPath = path.join(projectPath, savedPath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, pageContent, "utf-8")

    patchTask(task, { status: "done", savedPath, synthesis: accumulated })

    // ── Step 4: Auto-ingest ───────────────────────────────────────────────
    try {
      startIngestTask(task.projectId, savedPath)
    } catch (err) {
      console.error("[research-service] Auto-ingest failed:", err)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    patchTask(task, { status: "error", error: msg })
  } finally {
    abortControllers.delete(task.id)
    // Schedule next queued task
    setTimeout(processQueue, 100)
  }
}

// ── Tavily search ─────────────────────────────────────────────────────────

async function tavilySearch(
  query: string,
  apiKey: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  if (!apiKey) throw new Error("Tavily API key not configured")

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: maxResults,
    }),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Tavily search failed ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json() as {
    results?: Array<{ title: string; url: string; content: string }>
  }

  return (data.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.content?.slice(0, 400) ?? "",
    source: new URL(r.url ?? "https://unknown").hostname,
  }))
}

// ── LLM streaming call ────────────────────────────────────────────────────

async function callLlmStreaming(
  llmConfig: LlmConfig,
  messages: ChatMessage[],
  onToken: (token: string) => void,
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
