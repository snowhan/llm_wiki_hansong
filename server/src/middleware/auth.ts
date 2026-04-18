import type { Request, Response, NextFunction } from "express"
import { config } from "../config.js"

/**
 * Bearer token authentication middleware.
 *
 * If ACCESS_TOKEN is not configured the server runs in unauthenticated mode
 * (development convenience) and every request is allowed through.
 *
 * When ACCESS_TOKEN is set, every request to /api/* must carry:
 *   Authorization: Bearer <token>
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.accessToken) {
    next()
    return
  }

  const header = req.headers.authorization ?? ""
  const headerToken = header.startsWith("Bearer ") ? header.slice(7) : ""
  // Fallback for EventSource which doesn't support custom headers
  const queryToken = (req.query.token as string | undefined) ?? ""
  const token = headerToken || queryToken

  if (token !== config.accessToken) {
    res.status(401).json({ error: "Unauthorized" })
    return
  }

  next()
}

/**
 * Admin-only authentication middleware.
 * Must be used in addition to (not instead of) authMiddleware.
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.adminToken) {
    next()
    return
  }

  const header = req.headers.authorization ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""

  if (token !== config.adminToken) {
    res.status(403).json({ error: "Admin access required" })
    return
  }

  next()
}
