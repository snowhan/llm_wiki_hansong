/**
 * Unified LLM streaming client.
 * All LLM calls (ingest, research, rebuild, deduplicate) should use
 * callLlmStreaming() instead of inline fetch() with provider-specific logic.
 *
 * Benefits:
 *   - Single place for debug logging (llmDebugLogger)
 *   - Consistent error handling and abort signal support
 *   - maxOutputTokens forwarded to provider config
 */

import { randomUUID } from "node:crypto"
import type { LlmConfig } from "../types.js"
import { getProviderConfig } from "./llm-providers.js"
import type { ChatMessage } from "./llm-providers.js"
import { llmDebugLogger, inferLlmCallSource } from "../services/llm-debug-logger.js"

/**
 * Call an LLM provider with streaming output.
 * Calls `onToken` for each text chunk received from the stream.
 *
 * @param llmConfig - Provider configuration from app state
 * @param messages  - Conversation messages to send
 * @param onToken   - Called with each text token as it arrives
 * @param signal    - Optional AbortSignal to cancel the request
 */
export async function callLlmStreaming(
  llmConfig: LlmConfig,
  messages: ChatMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const pc = getProviderConfig(llmConfig)
  const body = pc.buildBody(messages, llmConfig.maxOutputTokens)
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
