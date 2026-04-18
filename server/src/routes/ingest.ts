import { Router } from "express"
import type { Request, Response, NextFunction } from "express"
import {
  startIngestTask,
  getTask,
  getAllTasks,
  registerSseClient,
  unregisterSseClient,
} from "../services/ingest-service.js"
import type { LlmConfig } from "../services/ingest-service.js"

const router = Router()

/**
 * POST /api/ingest/start
 * Body: { projectPath, sourcePath, llmConfig, folderContext? }
 * Returns: { taskId }
 */
router.post("/start", (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectPath, sourcePath, llmConfig, folderContext } = req.body as {
      projectPath: string
      sourcePath: string
      llmConfig: LlmConfig
      folderContext?: string
    }

    if (!projectPath || !sourcePath || !llmConfig) {
      res.status(400).json({ error: "projectPath, sourcePath and llmConfig are required" })
      return
    }

    const taskId = startIngestTask(projectPath, sourcePath, llmConfig, folderContext ?? "")
    res.json({ taskId })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/ingest/status/:taskId
 * Returns current task state.
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
 * Returns all known tasks (used by frontend to reconnect on refresh).
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

  // If task is already terminal, send final event and close
  if (task.status === "done" || task.status === "error") {
    res.write(`data: ${JSON.stringify({ type: "done", task })}\n\n`)
    res.end()
    return
  }

  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n") } catch { clearInterval(heartbeat) }
  }, 20_000)

  req.on("close", () => {
    clearInterval(heartbeat)
    unregisterSseClient(taskId as string, res)
  })
})

export default router
