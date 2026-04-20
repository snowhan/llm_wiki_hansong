import type { Response } from "express"
import { getState, setState } from "./state-service.js"

const MAX_LOGS = 100
const STATE_KEY = "llmDebugLogs"

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

class LlmDebugLogger {
  private clients = new Set<Response>()
  private logs: LlmCallLog[] | null = null

  private async ensureLoaded(): Promise<LlmCallLog[]> {
    if (this.logs === null) {
      const stored = await getState(STATE_KEY)
      this.logs = Array.isArray(stored) ? (stored as LlmCallLog[]) : []
    }
    return this.logs
  }

  async getLogs(): Promise<LlmCallLog[]> {
    return this.ensureLoaded()
  }

  async append(entry: LlmCallLog): Promise<void> {
    const logs = await this.ensureLoaded()
    logs.unshift(entry)
    if (logs.length > MAX_LOGS) logs.length = MAX_LOGS
    // Persist asynchronously without blocking the LLM response
    setState(STATE_KEY, logs).catch(() => {})
    this.broadcast("log", entry)
  }

  async clear(): Promise<void> {
    this.logs = []
    await setState(STATE_KEY, [])
    this.broadcast("clear", {})
  }

  addClient(res: Response): void {
    this.clients.add(res)
  }

  removeClient(res: Response): void {
    this.clients.delete(res)
  }

  private broadcast(event: string, data: unknown): void {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const client of this.clients) {
      try {
        client.write(msg)
      } catch {
        this.clients.delete(client)
      }
    }
  }

  /**
   * Infer call source from system message content keywords.
   */
  static inferSource(
    messages: Array<{ role: string; content: string }>,
  ): LlmCallLog["source"] {
    const sys = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content.toLowerCase())
      .join(" ")

    if (
      sys.includes("wiki") &&
      (sys.includes("generate") ||
        sys.includes("ingest") ||
        sys.includes("file:") ||
        sys.includes("---file"))
    )
      return "ingest"
    if (sys.includes("lint") || sys.includes("structural issue")) return "lint"
    if (
      sys.includes("research") ||
      sys.includes("deep research") ||
      sys.includes("web search")
    )
      return "research"
    if (sys.includes("enrich") || sys.includes("wikilink")) return "enrich"
    // Anything with a non-system user turn is likely chat
    if (messages.some((m) => m.role === "user")) return "chat"
    return "other"
  }
}

export const llmDebugLogger = new LlmDebugLogger()

export function inferLlmCallSource(
  messages: Array<{ role: string; content: string }>,
): LlmCallLog["source"] {
  return LlmDebugLogger.inferSource(messages)
}
