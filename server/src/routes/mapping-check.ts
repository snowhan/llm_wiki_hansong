import { Router } from "express"
import { getState, setState } from "../services/state-service.js"

export interface MappingCheckItem {
  id: string
  projectId: string
  filePath: string
  pathType: "entity" | "concept" | "other"
  frontmatterType: string
  frontmatterTitle: string
  contentPreview: string
  riskLevel: "high" | "ok"
  riskReason?: string
  status: "pending" | "approved"
  ingestSession: string
  createdAt: number
}

const stateKey = (projectId: string) => `mapping-check:${projectId}`

const router = Router()

// GET /api/mapping-check/items?projectId=...
router.get("/items", async (req, res, next) => {
  try {
    const { projectId } = req.query
    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({ error: "projectId required" })
      return
    }
    const items = (await getState(stateKey(projectId))) as MappingCheckItem[] | null
    res.json({ items: items ?? [] })
  } catch (err) {
    next(err)
  }
})

// POST /api/mapping-check/items – batch upsert (replace all items for session)
router.post("/items", async (req, res, next) => {
  try {
    const { projectId, items, replaceSession } = req.body as {
      projectId: string
      items: MappingCheckItem[]
      replaceSession?: string
    }
    if (!projectId || !Array.isArray(items)) {
      res.status(400).json({ error: "projectId and items required" })
      return
    }
    const existing = ((await getState(stateKey(projectId))) as MappingCheckItem[] | null) ?? []
    const kept = replaceSession
      ? existing.filter((i) => i.ingestSession !== replaceSession)
      : existing
    const merged = [...kept, ...items]
    await setState(stateKey(projectId), merged)
    res.json({ items: merged })
  } catch (err) {
    next(err)
  }
})

// PATCH /api/mapping-check/items/:id
router.patch("/items/:id", async (req, res, next) => {
  try {
    const { id } = req.params
    const { projectId, status } = req.body as { projectId: string; status: "pending" | "approved" }
    if (!projectId || !status) {
      res.status(400).json({ error: "projectId and status required" })
      return
    }
    const items = ((await getState(stateKey(projectId))) as MappingCheckItem[] | null) ?? []
    const updated = items.map((item) => (item.id === id ? { ...item, status } : item))
    await setState(stateKey(projectId), updated)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/mapping-check/items?projectId=...
router.delete("/items", async (req, res, next) => {
  try {
    const { projectId } = req.query
    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({ error: "projectId required" })
      return
    }
    await setState(stateKey(projectId), [])
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
