import { Router } from "express"
import {
  vectorUpsert,
  vectorSearch,
  vectorDelete,
  vectorCount,
} from "../services/vector-service.js"

const router = Router()

router.post("/upsert", async (req, res, next) => {
  try {
    const { projectPath, pageId, embedding } = req.body as {
      projectPath: string; pageId: string; embedding: number[]
    }
    await vectorUpsert(projectPath, pageId, embedding)
    res.status(204).end()
  } catch (err) { next(err) }
})

router.post("/search", async (req, res, next) => {
  try {
    const { projectPath, queryEmbedding, topK } = req.body as {
      projectPath: string; queryEmbedding: number[]; topK: number
    }
    const results = await vectorSearch(projectPath, queryEmbedding, topK ?? 10)
    res.json(results)
  } catch (err) { next(err) }
})

router.post("/delete", async (req, res, next) => {
  try {
    const { projectPath, pageId } = req.body as { projectPath: string; pageId: string }
    await vectorDelete(projectPath, pageId)
    res.status(204).end()
  } catch (err) { next(err) }
})

router.get("/count", async (req, res, next) => {
  try {
    const projectPath = req.query.projectPath as string
    if (!projectPath) {
      res.status(400).json({ error: "projectPath query required" })
      return
    }
    const count = await vectorCount(projectPath)
    res.json(count)
  } catch (err) { next(err) }
})

export default router
