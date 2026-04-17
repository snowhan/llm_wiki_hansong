import { Router } from "express"
import {
  createProject,
  openProject,
  listProjects,
} from "../services/project-service.js"
import { browsePath } from "../services/fs-service.js"

const router = Router()

router.get("/list", async (_req, res, next) => {
  try {
    const projects = await listProjects()
    res.json(projects)
  } catch (err) { next(err) }
})

router.post("/create", async (req, res, next) => {
  try {
    const { name, parentPath } = req.body as { name: string; parentPath?: string }
    const project = await createProject(name, parentPath)
    res.json(project)
  } catch (err) { next(err) }
})

router.post("/open", async (req, res, next) => {
  try {
    const { path: projectPath } = req.body as { path: string }
    const project = await openProject(projectPath)
    res.json(project)
  } catch (err) { next(err) }
})

router.get("/browse", async (req, res, next) => {
  try {
    const dirPath = req.query.path as string
    if (!dirPath) {
      res.status(400).json({ error: "path query required" })
      return
    }
    const result = await browsePath(dirPath)
    res.json(result)
  } catch (err) { next(err) }
})

export default router
