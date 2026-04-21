import { Router } from "express"
import type { Request, Response, NextFunction } from "express"
import { z } from "zod"
import { registerUser, loginUser, refreshAccessToken, logoutUser, getMe } from "../services/auth-service.js"
import { requireAuth } from "../middleware/auth-guards.js"

const router = Router()

const REFRESH_TOKEN_COOKIE = "refresh_token"

function setCookieRefreshToken(res: Response, token: string, expiresInDays: number): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: expiresInDays * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  })
}

function clearCookieRefreshToken(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/api/auth" })
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
const registerSchema = z.object({
  username: z.string().min(1, "Username is required").max(50),
  password: z.string().min(1, "Password is required"),
})

router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" })
      return
    }
    const { username, password } = parsed.data
    const result = await registerUser(username, password)
    res.status(201).json(result)
  } catch (err) {
    const e = err as { statusCode?: number; message: string }
    if (e.statusCode) {
      res.status(e.statusCode).json({ error: e.message })
      return
    }
    next(err)
  }
})

// ── POST /api/auth/login ──────────────────────────────────────────────────────
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: "Username and password are required" })
      return
    }
    const { username, password } = parsed.data
    const { user, accessToken, refreshToken } = await loginUser(username, password)
    const expiresInDays = parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS ?? "30", 10)
    setCookieRefreshToken(res, refreshToken, expiresInDays)
    res.json({ user, accessToken })
  } catch (err) {
    const e = err as { statusCode?: number; message: string }
    if (e.statusCode) {
      res.status(e.statusCode).json({ error: e.message })
      return
    }
    next(err)
  }
})

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
router.post("/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined
    if (!rawToken) {
      res.status(204).end()
      return
    }
    const { accessToken, newRefreshToken } = await refreshAccessToken(rawToken)
    const expiresInDays = parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS ?? "30", 10)
    setCookieRefreshToken(res, newRefreshToken, expiresInDays)
    res.json({ accessToken })
  } catch (err) {
    const e = err as { statusCode?: number; message: string }
    if (e.statusCode) {
      res.status(e.statusCode).json({ error: e.message })
      return
    }
    next(err)
  }
})

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post("/logout", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined
    if (rawToken && req.user) {
      await logoutUser(req.user.userId, rawToken)
    }
    clearCookieRefreshToken(res)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await getMe(req.user!.userId)
    res.json(user)
  } catch (err) {
    const e = err as { statusCode?: number; message: string }
    if (e.statusCode) {
      res.status(e.statusCode).json({ error: e.message })
      return
    }
    next(err)
  }
})

export default router
