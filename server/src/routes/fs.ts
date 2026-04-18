import { Router } from "express"
import multer from "multer"
import path from "node:path"
import fs from "node:fs/promises"
import {
  readFileContent,
  writeFileContent,
  listDirectoryTree,
  copyFile as copyFileService,
  copyDirectory as copyDirectoryService,
  deleteFileOrDir,
  createDir,
  findRelatedWikiPages,
} from "../services/fs-service.js"
import { resolveProjectPath, resolveSandboxed } from "../middleware/path-sandbox.js"
import { getProjectRoot } from "../services/project-service.js"
import {
  fsReadSchema,
  fsWriteSchema,
  fsListSchema,
  fsCopySchema,
  fsDeleteSchema,
  fsMkdirSchema,
  fsUploadBodySchema,
  fsFindRelatedSchema,
} from "../lib/schemas.js"

const router = Router()
const upload = multer({ storage: multer.diskStorage({}) })

router.post("/read", async (req, res, next) => {
  try {
    const parsed = fsReadSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    const { projectId, path: relativePath } = parsed.data
    const absPath = await resolveProjectPath(projectId, relativePath)
    try {
      const content = await readFileContent(absPath)
      res.json({ content })
    } catch (readErr) {
      // File not found: return 200 with null content so browser doesn't log network errors
      if ((readErr as NodeJS.ErrnoException).code === "ENOENT") {
        res.json({ content: null })
        return
      }
      throw readErr
    }
  } catch (err) { next(err) }
})

router.post("/write", async (req, res, next) => {
  try {
    const parsed = fsWriteSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    const { projectId, path: relativePath, contents } = parsed.data
    const absPath = await resolveProjectPath(projectId, relativePath)
    await writeFileContent(absPath, contents)
    res.status(204).end()
  } catch (err) { next(err) }
})

router.post("/list", async (req, res, next) => {
  try {
    const parsed = fsListSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    const { projectId, path: relativePath } = parsed.data
    const root = await getProjectRoot(projectId)
    const absPath = relativePath ? resolveSandboxed(root, relativePath) : root
    const tree = await listDirectoryTree(absPath, root)
    res.json(tree)
  } catch (err) { next(err) }
})

router.post("/copy", async (req, res, next) => {
  try {
    const parsed = fsCopySchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    const { projectId, source, dest } = parsed.data
    const root = await getProjectRoot(projectId)
    const absSrc = resolveSandboxed(root, source)
    const absDest = resolveSandboxed(root, dest)
    await copyFileService(absSrc, absDest)
    res.status(204).end()
  } catch (err) { next(err) }
})

router.post("/copy-directory", async (req, res, next) => {
  try {
    const parsed = fsCopySchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    const { projectId, source, dest } = parsed.data
    const root = await getProjectRoot(projectId)
    const absSrc = resolveSandboxed(root, source)
    const absDest = resolveSandboxed(root, dest)
    const files = await copyDirectoryService(absSrc, absDest)
    // Return relative paths
    const relFiles = files.map((f) => path.relative(root, f).replace(/\\/g, "/"))
    res.json(relFiles)
  } catch (err) { next(err) }
})

router.post("/delete", async (req, res, next) => {
  try {
    const parsed = fsDeleteSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    const { projectId, path: relativePath } = parsed.data
    const absPath = await resolveProjectPath(projectId, relativePath)
    await deleteFileOrDir(absPath)
    res.status(204).end()
  } catch (err) { next(err) }
})

router.post("/mkdir", async (req, res, next) => {
  try {
    const parsed = fsMkdirSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    const { projectId, path: relativePath } = parsed.data
    const absPath = await resolveProjectPath(projectId, relativePath)
    await createDir(absPath)
    res.status(204).end()
  } catch (err) { next(err) }
})

router.post("/upload", upload.array("files"), async (req, res, next) => {
  try {
    const parsed = fsUploadBodySchema.safeParse(req.body)
    const files = req.files as Express.Multer.File[]
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    if (!files?.length) { res.status(400).json({ error: "files are required" }); return }
    const { projectId, destDir } = parsed.data

    const root = await getProjectRoot(projectId)
    const absDestDir = resolveSandboxed(root, destDir)
    await createDir(absDestDir)

    const savedRelPaths: string[] = []
    for (const file of files) {
      const rawName = (file as Express.Multer.File & { originalname: string }).originalname
      const originalName = Buffer.from(rawName, "latin1").toString("utf8")
      const destPath = path.join(absDestDir, originalName)
      await fs.copyFile(file.path, destPath)
      savedRelPaths.push(path.relative(root, destPath).replace(/\\/g, "/"))
    }

    res.json({ paths: savedRelPaths })
  } catch (err) { next(err) }
})

router.post("/find-related", async (req, res, next) => {
  try {
    const parsed = fsFindRelatedSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    const { projectId, name } = parsed.data
    const root = await getProjectRoot(projectId)
    const pages = await findRelatedWikiPages(root, name)
    res.json(pages)
  } catch (err) { next(err) }
})

export default router
