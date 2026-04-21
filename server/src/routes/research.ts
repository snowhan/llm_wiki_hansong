import { Router } from "express"
import type { Request, Response, NextFunction } from "express"
import {
  startResearchTask,
  getResearchTask,
  getAllResearchTasks,
  registerResearchSseClient,
  unregisterResearchSseClient,
  cancelResearchTask,
} from "../services/research-service.js"
const router = Router()

/**
 * POST /api/research/start
 * Body: { projectId, topic, searchQueries? }
 * Returns: { taskId }
 */
router.post("/start", (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, topic, searchQueries } = req.body ?? {}
    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({ error: "projectId is required" })
      return
    }
    if (!topic || typeof topic !== "string") {
      res.status(400).json({ error: "topic is required" })
      return
    }
    const taskId = startResearchTask(
      projectId,
      topic,
      Array.isArray(searchQueries) ? searchQueries : undefined,
    )
    res.json({ taskId })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/research/status/:taskId
 */
router.get("/status/:taskId", (req: Request, res: Response) => {
  const task = getResearchTask(req.params["taskId"] as string)
  if (!task) {
    res.status(404).json({ error: "Task not found" })
    return
  }
  res.json({ task })
})

/**
 * GET /api/research/tasks?projectId=xxx
 * Returns all research tasks, optionally filtered by projectId.
 */
router.get("/tasks", (_req: Request, res: Response) => {
  const projectId = _req.query.projectId as string | undefined
  const tasks = getAllResearchTasks(projectId)
  res.json({ tasks })
})

/**
 * DELETE /api/research/tasks/:taskId
 * Cancels a running task or removes a completed one.
 */
router.delete("/tasks/:taskId", (req: Request, res: Response) => {
  const taskId = req.params["taskId"] as string
  const task = getResearchTask(taskId)
  if (!task) {
    res.status(404).json({ error: "Task not found" })
    return
  }
  cancelResearchTask(taskId)
  res.json({ ok: true })
})

/**
 * GET /api/research/stream/:taskId
 * Server-Sent Events stream for real-time progress.
 * Supports ?token=<jwt> for EventSource connections (which can't send headers).
 */
router.get("/stream/:taskId", (req: Request, res: Response) => {
  const taskId = req.params["taskId"] as string

  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.flushHeaders()

  const task = getResearchTask(taskId)
  if (!task) {
    res.write(`data: ${JSON.stringify({ type: "error", message: "Task not found" })}\n\n`)
    res.end()
    return
  }

  registerResearchSseClient(taskId, res)

  if (task.status === "done" || task.status === "error") {
    const type = task.status === "done" ? "done" : "error"
    res.write(`data: ${JSON.stringify({ type, task, message: task.error })}\n\n`)
    unregisterResearchSseClient(taskId, res)
    res.end()
    return
  }

  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n") } catch { clearInterval(heartbeat) }
  }, 20_000)

  req.on("close", () => {
    clearInterval(heartbeat)
    unregisterResearchSseClient(taskId, res)
  })
})

export default router
