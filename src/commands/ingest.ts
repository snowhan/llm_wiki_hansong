/**
 * Frontend commands for server-side ingest tasks.
 */

import type { LlmConfig } from "@/stores/wiki-store"

export interface ServerIngestTask {
  id: string
  projectPath: string
  sourcePath: string
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
}

/**
 * Start a server-side ingest task.
 * Returns the taskId that can be used to subscribe to SSE progress.
 */
export async function startServerIngest(params: {
  projectPath: string
  sourcePath: string
  llmConfig: LlmConfig
  folderContext?: string
}): Promise<string> {
  const res = await fetch("/api/ingest/start", {
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
    const res = await fetch(`/api/ingest/status/${taskId}`)
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
    const res = await fetch("/api/ingest/tasks")
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
  const es = new EventSource(`/api/ingest/stream/${taskId}`)

  es.onmessage = (ev) => {
    let data: { type: string; task?: ServerIngestTask; token?: string; step?: string; message?: string }
    try { data = JSON.parse(ev.data as string) as typeof data }
    catch { return }

    if (data.type === "state" || data.type === "update") {
      if (data.task) callbacks.onUpdate?.(data.task)
    } else if (data.type === "token") {
      if (data.step !== undefined && data.token !== undefined) {
        callbacks.onToken?.(data.step, data.token)
      }
    } else if (data.type === "done") {
      if (data.task) callbacks.onDone?.(data.task)
      es.close()
    } else if (data.type === "error") {
      callbacks.onError?.(data.message ?? "Unknown error")
      es.close()
    }
  }

  es.onerror = () => {
    callbacks.onError?.("SSE connection error")
    es.close()
  }

  return () => { es.close() }
}
