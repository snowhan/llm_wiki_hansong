import { Router } from "express"
import type { Request, Response, NextFunction } from "express"
import { getProviderConfig } from "../lib/llm-providers.js"
import type { ChatMessage } from "../lib/llm-providers.js"
import { getState } from "../services/state-service.js"
import type { LlmConfig } from "../types.js"
import { llmStreamSchema } from "../lib/schemas.js"
import { llmDebugLogger, inferLlmCallSource } from "../services/llm-debug-logger.js"
import { randomUUID } from "node:crypto"

const router = Router()

/**
 * POST /api/llm/stream
 * Body: { messages: ChatMessage[], stream?: boolean }
 *
 * The server reads the stored LLM configuration from app-state and uses it
 * to proxy the request to the actual LLM provider.
 * The frontend never needs to send API keys or provider URLs.
 */
router.post("/stream", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = llmStreamSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message })
      return
    }
    const { messages } = parsed.data as { messages: ChatMessage[] }

    const llmConfig = await getState("llmConfig") as LlmConfig | null
    if (!llmConfig?.provider) {
      res.status(400).json({ error: "LLM is not configured. Please set up your LLM in Settings." })
      return
    }

    const providerConfig = getProviderConfig(llmConfig)

    const upstream = await fetch(providerConfig.url, {
      method: "POST",
      headers: { ...providerConfig.headers, "Content-Type": "application/json" },
      body: JSON.stringify(providerConfig.buildBody(messages)),
    })

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "")
      res.status(upstream.status).send(
        `LLM API error: ${upstream.status} ${upstream.statusText} — ${errText}`,
      )
      return
    }

    res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()

    if (!upstream.body) {
      res.status(502).send("Upstream response body is null")
      return
    }

    const startMs = Date.now()
    const reader = upstream.body.getReader()
    const onClose = () => { reader.cancel().catch(() => {}) }
    req.on("close", onClose)

    // Tee: collect tokens for debug logging while proxying to client
    const outputChunks: Uint8Array[] = []

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        outputChunks.push(value)
        res.write(value)
      }
    } finally {
      req.off("close", onClose)
    }

    res.end()

    // Parse full output text for debug logging (non-blocking)
    try {
      const rawText = new TextDecoder().decode(
        outputChunks.reduce<Uint8Array>((acc, chunk) => {
          const merged = new Uint8Array(acc.length + chunk.length)
          merged.set(acc)
          merged.set(chunk, acc.length)
          return merged
        }, new Uint8Array(0)),
      )
      // Extract token text from SSE lines using provider's parseStream
      const lines = rawText.split("\n")
      let outputText = ""
      for (const line of lines) {
        const token = providerConfig.parseStream(line.trim())
        if (token !== null) outputText += token
      }

      llmDebugLogger.append({
        id: randomUUID(),
        timestamp: startMs,
        source: inferLlmCallSource(messages as Array<{ role: string; content: string }>),
        provider: llmConfig.provider,
        model: llmConfig.model ?? "",
        messages: messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
        output: outputText,
        durationMs: Date.now() - startMs,
        status: "done",
      }).catch(() => {})
    } catch {
      // Debug logging is non-critical; never block the response
    }
  } catch (err) { next(err) }
})

export default router
