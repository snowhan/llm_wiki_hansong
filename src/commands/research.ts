/**
 * Frontend commands for server-side research tasks.
 * The server reads LLM and search API configuration from its own state.
 */

import { getStoredToken } from "@/lib/auth"
import { fetchWithAuth } from "@/lib/fetch-with-auth"

export interface ServerResearchTask {
  id: string
  projectId: string
  topic: string
  searchQueries: string[]
  status: "queued" | "searching" | "synthesizing" | "saving" | "done" | "error"
  webResults: Array<{ title: string; url: string; snippet: string; source: string }>
  synthesis: string
  savedPath: string | null
  error: string | null
  createdAt: number
  updatedAt: number
}

export interface ResearchSseCallbacks {
  onUpdate?: (task: ServerResearchTask) => void
  onToken?: (token: string) => void
  onDone?: (task: ServerResearchTask) => void
  onError?: (msg: string) => void
  onConnectionLost?: () => void
}

/**
 * Start a server-side research task.
 * Returns the server-assigned taskId.
 */
export async function startServerResearch(params: {
  projectId: string
  topic: string
  searchQueries?: string[]
}): Promise<string> {
  const res = await fetchWithAuth("/api/research/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `Research start failed: ${res.status}`)
  }
  const data = await res.json()
  return data.taskId as string
}

/**
 * Fetch status of a research task.
 */
export async function getServerResearchTask(taskId: string): Promise<ServerResearchTask | null> {
  const res = await fetchWithAuth(`/api/research/status/${taskId}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to get research task: ${res.status}`)
  const data = await res.json()
  return data.task as ServerResearchTask
}

/**
 * Fetch all research tasks for a project.
 */
export async function getAllServerResearchTasks(projectId: string): Promise<ServerResearchTask[]> {
  const res = await fetchWithAuth(`/api/research/tasks?projectId=${encodeURIComponent(projectId)}`)
  if (!res.ok) throw new Error(`Failed to get research tasks: ${res.status}`)
  const data = await res.json()
  return data.tasks as ServerResearchTask[]
}

/**
 * Cancel / remove a research task.
 */
export async function cancelServerResearchTask(taskId: string): Promise<void> {
  await fetchWithAuth(`/api/research/tasks/${taskId}`, { method: "DELETE" })
}

/**
 * Subscribe to SSE events for a research task.
 * Returns an unsubscribe function.
 */
export function subscribeResearchTask(
  taskId: string,
  callbacks: ResearchSseCallbacks,
): () => void {
  const token = getStoredToken()
  const url = token
    ? `/api/research/stream/${taskId}?token=${encodeURIComponent(token)}`
    : `/api/research/stream/${taskId}`

  const es = new EventSource(url)

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      switch (data.type) {
        case "state":
        case "update":
          callbacks.onUpdate?.(data.task)
          break
        case "token":
          callbacks.onToken?.(data.token)
          break
        case "done":
          callbacks.onDone?.(data.task)
          es.close()
          break
        case "error":
          callbacks.onError?.(data.message ?? "Unknown error")
          es.close()
          break
      }
    } catch {
      // ignore malformed events
    }
  }

  es.onerror = () => {
    callbacks.onConnectionLost?.()
  }

  return () => es.close()
}
