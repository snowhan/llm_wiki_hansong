import type { Request, Response, NextFunction } from "express"
import { verifyAccessToken, type JwtPayload } from "../lib/auth-utils.js"
import { config } from "../config.js"

declare module "express-serve-static-core" {
  interface Request {
    user?: JwtPayload
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization ?? ""
  if (header.startsWith("Bearer ")) return header.slice(7)
  // Fallback for EventSource (SSE) which doesn't support custom headers
  const queryToken = req.query.token as string | undefined
  return queryToken ?? null
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req)
  if (!token) {
    res.status(401).json({ error: "Authentication required" })
    return
  }
  try {
    const payload = await verifyAccessToken(token, config.jwtSecret)
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: "Invalid or expired token" })
  }
}

export async function requireMember(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await requireAuth(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" })
      return
    }
    next()
  })
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" })
      return
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" })
      return
    }
    next()
  })
}
