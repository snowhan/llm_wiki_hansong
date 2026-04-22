import { create } from "zustand"
import { getStoredToken } from "@/lib/auth"
import { fetchWithAuth } from "@/lib/fetch-with-auth"

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "")

export interface LlmCallLog {
  id: string
  timestamp: number
  source: "ingest" | "chat" | "lint" | "research" | "enrich" | "other"
  provider: string
  model: string
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  output: string
  durationMs: number
  status: "done" | "error"
  error?: string
}

interface LlmDebugState {
  logs: LlmCallLog[]
  isConnected: boolean
  _eventSource: EventSource | null
  loadLogs: () => Promise<void>
  connectSSE: () => void
  disconnectSSE: () => void
  clearLogs: () => Promise<void>
}

export const useLlmDebugStore = create<LlmDebugState>((set, get) => ({
  logs: [],
  isConnected: false,
  _eventSource: null,

  loadLogs: async () => {
    try {
      const res = await fetchWithAuth("/api/llm/debug/logs")
      if (res.ok) {
        const data = await res.json() as { logs: LlmCallLog[] }
        set({ logs: data.logs ?? [] })
      }
    } catch {
      // Non-critical
    }
  },

  connectSSE: () => {
    const existing = get()._eventSource
    if (existing) return // already connected

    const token = getStoredToken()
    const sseUrl = token
      ? `${BASE_URL}/api/llm/debug/stream?token=${encodeURIComponent(token)}`
      : `${BASE_URL}/api/llm/debug/stream`

    // Use fetch-based SSE since EventSource doesn't support custom headers
    // Fall back to polling-compatible approach using a custom reader
    let aborted = false
    const controller = new AbortController()

    const headers: Record<string, string> = { Accept: "text/event-stream" }
    if (token) headers["Authorization"] = `Bearer ${token}`

    void (async () => {
      try {
        const res = await fetch(sseUrl, {
          headers,
          signal: controller.signal,
        })
        if (!res.ok || !res.body) return

        set({ isConnected: true })

        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ""

        while (!aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })

          const parts = buf.split("\n\n")
          buf = parts.pop() ?? ""

          for (const part of parts) {
            const eventMatch = part.match(/^event:\s*(.+)$/m)
            const dataMatch = part.match(/^data:\s*(.+)$/m)
            if (!dataMatch) continue
            const event = eventMatch?.[1]?.trim() ?? "message"
            try {
              const payload = JSON.parse(dataMatch[1]) as unknown
              if (event === "history") {
                const { logs } = payload as { logs: LlmCallLog[] }
                set({ logs: logs ?? [] })
              } else if (event === "log") {
                const entry = payload as LlmCallLog
                set((s) => ({ logs: [entry, ...s.logs].slice(0, 100) }))
              } else if (event === "clear") {
                set({ logs: [] })
              }
            } catch {
              // ignore malformed SSE
            }
          }
        }
      } catch {
        // ignore abort / network errors
      } finally {
        set({ isConnected: false, _eventSource: null })
      }
    })()

    // Store the controller as a synthetic "EventSource" for cleanup
    set({ _eventSource: { close: () => { aborted = true; controller.abort() } } as unknown as EventSource })
  },

  disconnectSSE: () => {
    const es = get()._eventSource
    if (es) es.close()
    set({ isConnected: false, _eventSource: null })
  },

  clearLogs: async () => {
    try {
      await fetchWithAuth("/api/llm/debug/logs", { method: "DELETE" })
      set({ logs: [] })
    } catch {
      // Non-critical
    }
  },
}))
