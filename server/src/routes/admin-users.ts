import { Router } from "express"
import type { Request, Response, NextFunction } from "express"
import { z } from "zod"
import { requireAdmin } from "../middleware/auth-guards.js"
import { listUsers, updateUser } from "../db/queries.js"
import type { User } from "../db/schema.js"

const router = Router()

router.use(requireAdmin)

function toPublicUser(user: User) {
  const { passwordHash: _, ...rest } = user
  return rest
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await listUsers()
    res.json({ users: rows.map(toPublicUser) })
  } catch (err) {
    next(err)
  }
})

// ── PATCH /api/admin/users/:id/status ────────────────────────────────────────
const statusSchema = z.object({
  status: z.enum(["pending", "active", "suspended"]),
})

router.patch("/:id/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = statusSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid status. Must be: pending, active, or suspended" })
      return
    }
    const { id } = req.params as { id: string }
    const user = await updateUser(id, { status: parsed.data.status })
    res.json({ user: toPublicUser(user) })
  } catch (err) {
    next(err)
  }
})

// ── PATCH /api/admin/users/:id/role ──────────────────────────────────────────
const roleSchema = z.object({
  role: z.enum(["member", "admin"]),
})

router.patch("/:id/role", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = roleSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid role. Must be: member or admin" })
      return
    }
    const { id } = req.params as { id: string }
    const user = await updateUser(id, { role: parsed.data.role })
    res.json({ user: toPublicUser(user) })
  } catch (err) {
    next(err)
  }
})

export default router
