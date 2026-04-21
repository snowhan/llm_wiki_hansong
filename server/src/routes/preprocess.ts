import { Router } from "express"
import { preprocessFile } from "../services/preprocess-service.js"
import type { Request, Response, NextFunction } from "express"
import { resolveProjectPath } from "../middleware/path-sandbox.js"
import { fsReadSchema } from "../lib/schemas.js"

const router = Router()

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = fsReadSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message })
      return
    }
    const { projectId, path: relativePath } = parsed.data

    const absPath = await resolveProjectPath(projectId, relativePath)

    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()

    // Once SSE headers are flushed, errors must NOT be passed to next(err) —
    // Express would try to write a second response, aborting the chunked stream
    // and causing ERR_INCOMPLETE_CHUNKED_ENCODING in the browser.
    // Instead, surface any error as a final SSE event and close cleanly.
    try {
      await preprocessFile(absPath, (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      res.write(`data: ${JSON.stringify({ stage: "error", progress: 1, done: true, error: msg })}\n\n`)
    }

    res.end()
  } catch (err) { next(err) }
})

export default router
