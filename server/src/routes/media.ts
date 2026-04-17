import { Router } from "express"
import fs from "node:fs"
import mime from "mime-types"

const router = Router()

router.get("/", (req, res, next) => {
  try {
    const filePath = req.query.path as string
    if (!filePath) {
      res.status(400).json({ error: "path query required" })
      return
    }

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found" })
      return
    }

    const mimeType = mime.lookup(filePath) || "application/octet-stream"
    res.setHeader("Content-Type", mimeType)
    res.setHeader("Cache-Control", "public, max-age=3600")
    fs.createReadStream(filePath).pipe(res)
  } catch (err) { next(err) }
})

export default router
