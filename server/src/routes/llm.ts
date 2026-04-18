import { Router } from "express"
import type { Request, Response, NextFunction } from "express"
import { getProviderConfig } from "../lib/llm-providers.js"
import type { ChatMessage } from "../lib/llm-providers.js"
import { getState } from "../services/state-service.js"
import type { LlmConfig } from "../types.js"
import { llmStreamSchema } from "../lib/schemas.js"

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

    if (!upstream.body) {
      res.status(502).send("Upstream response body is null")
      return
    }

    const reader = upstream.body.getReader()
    const onClose = () => { reader.cancel().catch(() => {}) }
    req.on("close", onClose)

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
    } finally {
      req.off("close", onClose)
    }

    res.end()
  } catch (err) { next(err) }
})

export default router
