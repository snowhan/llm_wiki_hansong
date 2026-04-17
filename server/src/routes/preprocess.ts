import { Router } from "express"
import { preprocessFile } from "../services/preprocess-service.js"
import type { Request, Response, NextFunction } from "express"

const router = Router()

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { path: filePath } = req.body as { path: string }
    if (!filePath) {
      res.status(400).json({ error: "path is required" })
      return
    }

    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()

    await preprocessFile(filePath, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    })

    res.end()
  } catch (err) { next(err) }
})

export default router
