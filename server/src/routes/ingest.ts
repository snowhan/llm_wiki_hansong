import { Router } from "express"
import type { Request, Response, NextFunction } from "express"
import {
  startIngestTask,
  getTask,
  getAllTasks,
  registerSseClient,
  unregisterSseClient,
  rebuildWikiIndex,
} from "../services/ingest-service.js"
import { ingestStartSchema } from "../lib/schemas.js"
import { getProjectRoot } from "../services/project-service.js"

const router = Router()

/**
 * POST /api/ingest/start
 * Body: { projectId, sourcePath (relative), folderContext? }
 * Returns: { taskId }
 */
router.post("/start", (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ingestStartSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message })
      return
    }
    const { projectId, sourcePath, folderContext, force } = parsed.data
    const taskId = startIngestTask(projectId, sourcePath, folderContext ?? "", force ?? false)
    res.json({ taskId })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/ingest/status/:taskId
 */
router.get("/status/:taskId", (req: Request, res: Response) => {
  const task = getTask(req.params["taskId"] as string)
  if (!task) {
    res.status(404).json({ error: "Task not found" })
    return
  }
  res.json({ task })
})

/**
 * GET /api/ingest/tasks
 * Returns all known tasks.
 */
router.get("/tasks", (_req: Request, res: Response) => {
  res.json({ tasks: getAllTasks() })
})

/**
 * GET /api/ingest/stream/:taskId
 * Server-Sent Events stream for real-time progress.
 */
router.get("/stream/:taskId", (req: Request, res: Response) => {
  const taskId = req.params["taskId"] as string

  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.flushHeaders()

  const task = getTask(taskId)
  if (!task) {
    res.write(`data: ${JSON.stringify({ type: "error", message: "Task not found" })}\n\n`)
    res.end()
    return
  }

  registerSseClient(taskId, res)

  if (task.status === "done" || task.status === "error") {
    const type = task.status === "done" ? "done" : "error"
    res.write(`data: ${JSON.stringify({ type, task, message: task.error })}\n\n`)
    unregisterSseClient(taskId, res)
    res.end()
    return
  }

  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n") } catch { clearInterval(heartbeat) }
  }, 20_000)

  req.on("close", () => {
    clearInterval(heartbeat)
    unregisterSseClient(taskId, res)
  })
})

/**
 * POST /api/ingest/rebuild-index
 * Body: { projectId }
 * Triggers a programmatic rebuild of wiki/index.md from frontmatter scanning.
 * Used by the client-side chat ingest path after writing wiki files.
 */
router.post("/rebuild-index", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.body?.projectId as string | undefined
    if (!projectId) {
      res.status(400).json({ error: "projectId is required" })
      return
    }
    const projectPath = await getProjectRoot(projectId)
    await rebuildWikiIndex(projectPath)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
