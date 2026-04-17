import type { Request, Response, NextFunction } from "express"

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(`[Error] ${err.message}`, err.stack)
  const status = (err as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500
  res.status(status).json({ error: err.message })
}
