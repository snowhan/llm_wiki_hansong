/**
 * ingest-audit-logger.ts
 *
 * Append-only audit log for ingest operations.
 * Writes two JSONL files under {projectPath}/logs/:
 *   - llm-calls.jsonl   — every LLM call with input/output/timing
 *   - file-changes.jsonl — every MD file write/skip/reject with content details
 *
 * Failures are silently ignored so they never affect the main ingest flow.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"

/**
 * Returns current time as ISO-8601 string with Beijing (+08:00) offset.
 * Accepts an optional Date argument for converting existing timestamps.
 */
export function nowBeijing(date: Date = new Date()): string {
  const offsetMs = 8 * 60 * 60 * 1000
  const local = new Date(date.getTime() + offsetMs)
  return local.toISOString().replace("Z", "+08:00")
}

async function appendJsonl(filePath: string, entry: object): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.appendFile(filePath, JSON.stringify(entry) + "\n", "utf8")
  } catch {
    // never throw
  }
}

// ─── LLM call log ─────────────────────────────────────────────────────────────

export interface LlmCallAuditEntry {
  ts: string                          // ISO8601
  taskId: string
  sourceFile: string                  // e.g. "2024体检报告.pdf"
  step: "1-analysis" | "2-generation"
  model: string
  durationMs: number
  status: "done" | "error"
  systemPrompt: string                // full system prompt
  userMessage: string                 // full user message
  output: string                      // full LLM output
  error?: string
}

export async function logLlmCall(projectPath: string, entry: LlmCallAuditEntry): Promise<void> {
  await appendJsonl(path.join(projectPath, "logs", "llm-calls.jsonl"), entry)
}

// ─── File change log ──────────────────────────────────────────────────────────

export interface FileChangeAuditEntry {
  ts: string
  taskId: string
  sourceFile: string
  operation: "written" | "skipped-empty" | "rejected-scope" | "rejected-semantic" | "rejected-title" | "direct-write"
  path: string
  titleInContent: string
  titleMatchesFilename: boolean
  sourcesField: string
  contentSnippet: string              // first 300 chars of content
  writer?: string                     // e.g. "editor-autosave", "ingest-service", "maintenance-script"
}

export async function logFileChange(projectPath: string, entry: FileChangeAuditEntry): Promise<void> {
  await appendJsonl(path.join(projectPath, "logs", "file-changes.jsonl"), entry)
}
