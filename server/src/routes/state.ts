import { Router } from "express"
import { getState, setState } from "../services/state-service.js"
import { stateSetSchema } from "../lib/schemas.js"

const router = Router()

router.get("/:key", async (req, res, next) => {
  try {
    const value = await getState(req.params.key)
    res.json(value)
  } catch (err) { next(err) }
})

router.put("/:key", async (req, res, next) => {
  try {
    const parsed = stateSetSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
    await setState(req.params.key, parsed.data.value)
    res.status(204).end()
  } catch (err) { next(err) }
})

export default router
