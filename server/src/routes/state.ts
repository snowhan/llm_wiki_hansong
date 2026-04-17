import { Router } from "express"
import { getState, setState } from "../services/state-service.js"

const router = Router()

router.get("/:key", async (req, res, next) => {
  try {
    const value = await getState(req.params.key)
    res.json(value)
  } catch (err) { next(err) }
})

router.put("/:key", async (req, res, next) => {
  try {
    await setState(req.params.key, req.body.value)
    res.status(204).end()
  } catch (err) { next(err) }
})

export default router
