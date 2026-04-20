import { Router } from "express"
import type { Request, Response, NextFunction } from "express"
import { llmDebugLogger } from "../services/llm-debug-logger.js"

const router = Router()

/**
 * GET /api/llm/debug/logs
 * Returns all stored LLM call logs.
 */
router.get("/logs", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await llmDebugLogger.getLogs()
    res.json({ logs })
  } catch (err) { next(err) }
})

/**
 * DELETE /api/llm/debug/logs
 * Clears all stored logs and broadcasts a clear event to SSE clients.
 */
router.delete("/logs", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await llmDebugLogger.clear()
    res.json({ ok: true })
  } catch (err) { next(err) }
})

/**
 * GET /api/llm/debug/stream
 * SSE endpoint. Sends historical logs as `event: history` immediately,
 * then pushes `event: log` for each new LLM call and `event: clear` on clear.
 */
router.get("/stream", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.flushHeaders()

  // Send current history on connect
  try {
    const logs = await llmDebugLogger.getLogs()
    res.write(`event: history\ndata: ${JSON.stringify({ logs })}\n\n`)
  } catch {
    // Non-critical; continue with SSE connection
  }

  llmDebugLogger.addClient(res)

  req.on("close", () => {
    llmDebugLogger.removeClient(res)
  })
})

export default router
