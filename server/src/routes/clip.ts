import { Router } from "express"
import { clipUrl } from "../services/clip-service.js"

const router = Router()

router.post("/url", async (req, res, next) => {
  try {
    const { url, projectPath } = req.body as { url: string; projectPath: string }
    if (!url || !projectPath) {
      res.status(400).json({ error: "url and projectPath are required" })
      return
    }
    const result = await clipUrl(url, projectPath)
    res.json(result)
  } catch (err) { next(err) }
})

router.get("/status", (_req, res) => {
  res.json({ status: "running" })
})

export default router
