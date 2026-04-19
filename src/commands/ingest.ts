/**
 * Frontend commands for server-side ingest tasks.
 * The server reads the LLM configuration from its own state — the frontend
 * no longer needs to send API keys or provider URLs.
 */

import { getStoredToken } from "@/lib/auth"

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

function authHeaders(): Record<string, string> {
  const token = getStoredToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
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
  const res = await fetch("/api/ingest/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
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
    const res = await fetch(`/api/ingest/status/${taskId}`, {
      headers: authHeaders(),
    })
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
    const res = await fetch("/api/ingest/tasks", { headers: authHeaders() })
    if (!res.ok) return []
    const { tasks } = (await res.json()) as { tasks: ServerIngestTask[] }
    return tasks
  } catch {
    return []
  }
}

/**
 * Subscribe to server-sent events for a task.
 * Returns a cleanup function — call it to close the connection.
 */
export function subscribeIngestSSE(taskId: string, callbacks: SseCallbacks): () => void {
  const token = getStoredToken()
  const url = token
    ? `/api/ingest/stream/${taskId}?token=${encodeURIComponent(token)}`
    : `/api/ingest/stream/${taskId}`

  const es = new EventSource(url)
  let intentionallyClosed = false

  const closeClean = () => {
    intentionallyClosed = true
    es.close()
  }

  es.onmessage = (ev) => {
    let data: {
      type: string
      task?: ServerIngestTask
      token?: string
      step?: string
      message?: string
    }
    try {
      data = JSON.parse(ev.data as string) as typeof data
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

  es.onerror = () => {
    if (intentionallyClosed) return
    if (es.readyState === EventSource.CLOSED) {
      intentionallyClosed = true
      // Prefer onConnectionLost so callers can query the server before deciding
      // whether to report failure. Fall back to onError for legacy callers.
      if (callbacks.onConnectionLost) {
        callbacks.onConnectionLost()
      } else {
        callbacks.onError?.("SSE connection error")
      }
    }
  }

  return closeClean
}
