import { Router } from "express"
import {
  vectorUpsert,
  vectorSearch,
  vectorDelete,
  vectorCount,
} from "../services/vector-service.js"
import {
  vectorUpsertSchema,
  vectorSearchSchema,
  vectorDeleteSchema,
  vectorCountQuerySchema,
} from "../lib/schemas.js"

const router = Router()

/**
 * Vector routes use projectId as the storage namespace.
 * The server uses the projectId directly as the vector store identifier,
 * so vectors remain associated with the project even if its path changes.
 */

router.post("/upsert", async (req, res, next) => {
  try {
    const parsed = vectorUpsertSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    const { projectId, pageId, embedding } = parsed.data
    await vectorUpsert(projectId, pageId, embedding)
    res.status(204).end()
  } catch (err) { next(err) }
})

router.post("/search", async (req, res, next) => {
  try {
    const parsed = vectorSearchSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    const { projectId, queryEmbedding, topK } = parsed.data
    const results = await vectorSearch(projectId, queryEmbedding, topK ?? 10)
    res.json(results)
  } catch (err) { next(err) }
})

router.post("/delete", async (req, res, next) => {
  try {
    const parsed = vectorDeleteSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    const { projectId, pageId } = parsed.data
    await vectorDelete(projectId, pageId)
    res.status(204).end()
  } catch (err) { next(err) }
})

router.get("/count", async (req, res, next) => {
  try {
    const parsed = vectorCountQuerySchema.safeParse(req.query)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    const count = await vectorCount(parsed.data.projectId)
    res.json(count)
  } catch (err) { next(err) }
})

export default router
