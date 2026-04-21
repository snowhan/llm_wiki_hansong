import path from "node:path"
import { Router } from "express"
import {
  createProject,
  openProject,
  listProjects,
} from "../services/project-service.js"
import { browsePath } from "../services/fs-service.js"
import {
  projectCreateSchema,
  projectOpenSchema,
  projectBrowseQuerySchema,
} from "../lib/schemas.js"
import { config } from "../config.js"

const router = Router()

router.get("/root", (_req, res) => {
  res.json({ projectsRoot: config.projectsRoot })
})

router.get("/list", async (_req, res, next) => {
  try {
    const projects = await listProjects()
    res.json(projects)
  } catch (err) { next(err) }
})

router.post("/create", async (req, res, next) => {
  try {
    const parsed = projectCreateSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    const project = await createProject(parsed.data.name, parsed.data.parentPath)
    res.json(project)
  } catch (err) { next(err) }
})

router.post("/open", async (req, res, next) => {
  try {
    const parsed = projectOpenSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    const project = await openProject(parsed.data.path)
    res.json(project)
  } catch (err) { next(err) }
})

router.get("/browse", async (req, res, next) => {
  try {
    const parsed = projectBrowseQuerySchema.safeParse(req.query)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }

    const { path: dirPath } = parsed.data
    const root = path.normalize(config.projectsRoot)
    const normalized = path.normalize(dirPath)

    // Clamp to projectsRoot — never expose filesystem outside persistent storage
    const safePath = normalized === root || normalized.startsWith(root + path.sep)
      ? normalized
      : root

    const result = await browsePath(safePath)
    res.json({ path: safePath, ...result })
  } catch (err) { next(err) }
})

export default router
