import { Router } from "express"
import type { Request, Response, NextFunction } from "express"

const router = Router()

router.post("/stream", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url, headers, body } = req.body as {
      url: string
      headers: Record<string, string>
      body: unknown
    }

    if (!url) {
      res.status(400).json({ error: "url is required" })
      return
    }

    const upstream = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "")
      res.status(upstream.status).send(`LLM API error: ${upstream.status} ${upstream.statusText} — ${errText}`)
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
