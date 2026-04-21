import { Router } from "express"
import type { Request, Response, NextFunction } from "express"
import { requireAdmin } from "../middleware/auth-guards.js"
import { getRegistryEntries, deleteProjectFromRegistry } from "../services/project-service.js"
import { getAllTasks } from "../services/ingest-service.js"

const router = Router()

router.use(requireAdmin)

/**
 * GET /api/admin/status
 * Returns server status including task counts and memory usage.
 */
router.get("/status", (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tasks = getAllTasks()
    const mem = process.memoryUsage()

    res.json({
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        rss: Math.round(mem.rss / 1024 / 1024),
      },
      tasks: {
        total: tasks.length,
        pending: tasks.filter((t) => t.status === "pending").length,
        running: tasks.filter((t) => t.status === "running").length,
        done: tasks.filter((t) => t.status === "done").length,
        error: tasks.filter((t) => t.status === "error").length,
      },
    })
  } catch (err) { next(err) }
})

/**
 * GET /api/admin/projects
 * Returns all registered projects with their IDs and filesystem paths.
 */
router.get("/projects", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = await getRegistryEntries()
    res.json({ projects: entries })
  } catch (err) { next(err) }
})

/**
 * DELETE /api/admin/projects/:projectId
 * Removes a project from the registry (does NOT delete files from disk).
 */
router.delete("/projects/:projectId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params as { projectId: string }
    await deleteProjectFromRegistry(projectId)
    res.status(204).end()
  } catch (err) { next(err) }
})

/**
 * GET /api/admin/tasks
 * Returns all ingest tasks.
 */
router.get("/tasks", (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tasks = getAllTasks()
    res.json({ tasks })
  } catch (err) { next(err) }
})

export default router
