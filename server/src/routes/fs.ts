import { Router } from "express"
import multer from "multer"
import path from "node:path"
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

const router = Router()

const upload = multer({ storage: multer.diskStorage({}) })

router.post("/read", async (req, res, next) => {
  try {
    const { path: filePath } = req.body as { path: string }
    const content = await readFileContent(filePath)
    res.json({ content })
  } catch (err) { next(err) }
})

router.post("/write", async (req, res, next) => {
  try {
    const { path: filePath, contents } = req.body as { path: string; contents: string }
    await writeFileContent(filePath, contents)
    res.status(204).end()
  } catch (err) { next(err) }
})

router.post("/list", async (req, res, next) => {
  try {
    const { path: dirPath } = req.body as { path: string }
    const tree = await listDirectoryTree(dirPath)
    res.json(tree)
  } catch (err) { next(err) }
})

router.post("/copy", async (req, res, next) => {
  try {
    const { source, dest } = req.body as { source: string; dest: string }
    await copyFileService(source, dest)
    res.status(204).end()
  } catch (err) { next(err) }
})

router.post("/copy-directory", async (req, res, next) => {
  try {
    const { source, dest } = req.body as { source: string; dest: string }
    const files = await copyDirectoryService(source, dest)
    res.json(files)
  } catch (err) { next(err) }
})

router.post("/delete", async (req, res, next) => {
  try {
    const { path: filePath } = req.body as { path: string }
    await deleteFileOrDir(filePath)
    res.status(204).end()
  } catch (err) { next(err) }
})

router.post("/mkdir", async (req, res, next) => {
  try {
    const { path: dirPath } = req.body as { path: string }
    await createDir(dirPath)
    res.status(204).end()
  } catch (err) { next(err) }
})

router.post("/upload", upload.array("files"), async (req, res, next) => {
  try {
    const destDir = req.body.destDir as string
    const files = req.files as Express.Multer.File[]
    if (!destDir || !files?.length) {
      res.status(400).json({ error: "destDir and files required" })
      return
    }

    const savedPaths: string[] = []
    for (const file of files) {
      // multer reads originalname as Latin-1; re-decode to UTF-8 to fix CJK mojibake
      const rawName = (file as Express.Multer.File & { originalname: string }).originalname
      const originalName = Buffer.from(rawName, "latin1").toString("utf8")
      const destPath = path.join(destDir, originalName)
      await writeFileContent(destPath, "")
      const fsModule = await import("node:fs/promises")
      await fsModule.copyFile(file.path, destPath)
      savedPaths.push(destPath)
    }

    res.json({ paths: savedPaths })
  } catch (err) { next(err) }
})

router.post("/find-related", async (req, res, next) => {
  try {
    const { projectPath, name } = req.body as { projectPath: string; name: string }
    const pages = await findRelatedWikiPages(projectPath, name)
    res.json(pages)
  } catch (err) { next(err) }
})

export default router
