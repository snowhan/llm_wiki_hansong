import { Router } from "express"
import fs from "node:fs"
import mime from "mime-types"
import { resolveProjectPath } from "../middleware/path-sandbox.js"

const router = Router()

/**
 * GET /api/media?projectId=<id>&path=<relativePath>
 * Serves a media file (image, video, etc.) from within a project's sandbox.
 */
router.get("/", async (req, res, next) => {
  try {
    const projectId = req.query.projectId as string | undefined
    const relativePath = req.query.path as string | undefined

    if (!projectId || !relativePath) {
      res.status(400).json({ error: "projectId and path query params are required" })
      return
    }

    const absPath = await resolveProjectPath(projectId, relativePath)

    if (!fs.existsSync(absPath)) {
      res.status(404).json({ error: "File not found" })
      return
    }

    const mimeType = mime.lookup(absPath) || "application/octet-stream"
    res.setHeader("Content-Type", mimeType)
    res.setHeader("Cache-Control", "public, max-age=3600")
    fs.createReadStream(absPath).pipe(res)
  } catch (err) { next(err) }
})

export default router
