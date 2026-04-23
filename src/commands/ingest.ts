/**
 * Frontend commands for server-side ingest tasks.
 * The server reads the LLM configuration from its own state — the frontend
 * no longer needs to send API keys or provider URLs.
 */

import { getStoredToken } from "@/lib/auth"
import { fetchWithAuth } from "@/lib/fetch-with-auth"

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "")

export interface ServerIngestTask {
  id: string
  projectId: string
  sourcePath: string   // relative to project root
  folderContext: string
  status: "pending" | "running" | "done" | "error"
  detail: string
  filesWritten: string[]
  error: string | null
  createdAt: number
  updatedAt: number
}

export interface SseCallbacks {
  onUpdate?: (task: ServerIngestTask) => void
  onToken?: (step: string, token: string) => void
  onDone?: (task: ServerIngestTask) => void
  onError?: (msg: string) => void
  /** Fired when the SSE transport closes unexpectedly (distinct from a task error).
   *  Callers should query the server before deciding whether to mark as failed. */
  onConnectionLost?: () => void
}

/**
 * Start a server-side ingest task.
 * Returns the taskId for SSE subscription.
 */
export async function startServerIngest(params: {
  projectId: string
  sourcePath: string   // relative to project root
  folderContext?: string
  force?: boolean
}): Promise<string> {
  const res = await fetchWithAuth("/api/ingest/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Failed to start ingest task: ${err}`)
  }
  const { taskId } = (await res.json()) as { taskId: string }
  return taskId
}

/**
 * Fetch current status of a task without subscribing to SSE.
 */
export async function getServerIngestStatus(taskId: string): Promise<ServerIngestTask | null> {
  try {
    const res = await fetchWithAuth(`/api/ingest/status/${taskId}`)
    if (!res.ok) return null
    const { task } = (await res.json()) as { task: ServerIngestTask }
    return task
  } catch {
    return null
  }
}

/**
 * Fetch all known server-side ingest tasks.
 * Used on mount to reconnect to tasks that are still running.
 */
export async function getAllServerTasks(): Promise<ServerIngestTask[]> {
  try {
    const res = await fetchWithAuth("/api/ingest/tasks")
    if (!res.ok) return []
    const { tasks } = (await res.json()) as { tasks: ServerIngestTask[] }
    return tasks
  } catch {
    return []
  }
}

/**
 * Trigger a server-side LLM rebuild of wiki/index.md and wiki/overview.md.
 * Returns the taskId for status polling.
 */
export async function rebuildWikiSummary(projectId: string): Promise<string> {
  const res = await fetchWithAuth("/api/ingest/rebuild-summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Failed to start rebuild-summary task: ${err}`)
  }
  const { taskId } = (await res.json()) as { taskId: string }
  return taskId
}

export interface RebuildSummaryStatus {
  id: string
  projectId: string
  status: "pending" | "running" | "done" | "error"
  detail: string
  error: string | null
  filesWritten: string[]
  createdAt: number
  updatedAt: number
}

/**
 * Poll the status of a rebuild-summary task.
 */
export async function getRebuildSummaryStatus(taskId: string): Promise<RebuildSummaryStatus | null> {
  try {
    const res = await fetchWithAuth(`/api/ingest/rebuild-summary/status/${taskId}`)
    if (!res.ok) return null
    const { task } = (await res.json()) as { task: RebuildSummaryStatus }
    return task
  } catch {
    return null
  }
}

/**
 * Trigger a server-side LLM deduplication of wiki entities and concepts.
 * Returns the taskId for status polling.
 */
export async function deduplicateWiki(projectId: string): Promise<string> {
  const res = await fetchWithAuth("/api/ingest/deduplicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Failed to start deduplicate task: ${err}`)
  }
  const { taskId } = (await res.json()) as { taskId: string }
  return taskId
}

export interface DeduplicateStatus {
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

/**
 * Poll the status of a deduplicate task.
 */
export async function getDeduplicateStatus(taskId: string): Promise<DeduplicateStatus | null> {
  try {
    const res = await fetchWithAuth(`/api/ingest/deduplicate/status/${taskId}`)
    if (!res.ok) return null
    const { task } = (await res.json()) as { task: DeduplicateStatus }
    return task
  } catch {
    return null
  }
}

/**
 * Subscribe to ingest task progress via SSE.
 * Uses fetch + ReadableStream instead of EventSource so the JWT can be sent
 * in the Authorization header (not as an insecure URL query param).
 */
export function subscribeIngestSSE(taskId: string, callbacks: SseCallbacks): () => void {
  const token = getStoredToken()
  const url = `${BASE_URL}/api/ingest/stream/${taskId}`
  const abortController = new AbortController()
  let closed = false

  const closeClean = () => {
    if (closed) return
    closed = true
    abortController.abort()
  }

  const run = async () => {
    let response: Response
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: "text/event-stream",
        },
        signal: abortController.signal,
      })
    } catch (err) {
      if (closed) return
      if (callbacks.onConnectionLost) {
        callbacks.onConnectionLost()
      } else {
        callbacks.onError?.("SSE connection failed")
      }
      return
    }

    if (!response.ok) {
      callbacks.onError?.(`SSE request failed: ${response.status}`)
      return
    }

    if (!response.body) {
      callbacks.onError?.("Empty SSE response body")
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buf = ""

    const processLine = (line: string) => {
      if (!line.startsWith("data:")) return
      const raw = line.slice(5).trim()
      if (!raw || raw === "[DONE]") return

      let data: {
        type: string
        task?: ServerIngestTask
        token?: string
        step?: string
        message?: string
      }
      try {
        data = JSON.parse(raw) as typeof data
      } catch {
        callbacks.onError?.("Invalid SSE payload")
        return
      }

      if (data.type === "state" || data.type === "update") {
        if (data.task) callbacks.onUpdate?.(data.task)
      } else if (data.type === "token") {
        if (data.step !== undefined && data.token !== undefined) {
          callbacks.onToken?.(data.step, data.token)
        }
      } else if (data.type === "done") {
        closeClean()
        if (data.task) {
          callbacks.onDone?.(data.task)
        } else {
          callbacks.onError?.("Incomplete done event from server")
        }
      } else if (data.type === "error") {
        closeClean()
        callbacks.onError?.(data.message ?? "Unknown error")
      }
    }

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const line of lines) {
          processLine(line.trim())
        }
      }
    } catch (err) {
      if (closed) return
      if (callbacks.onConnectionLost) {
        callbacks.onConnectionLost()
      } else {
        callbacks.onError?.("SSE connection lost")
      }
    } finally {
      reader.releaseLock()
    }
  }

  run().catch(() => {
    if (!closed) callbacks.onError?.("SSE unexpected error")
  })

  return closeClean
}
