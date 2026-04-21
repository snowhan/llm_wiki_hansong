import express from "express"
import type { Request, Response, NextFunction } from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "./config.js"
import { runMigrations } from "./db/migrate.js"
import { errorHandler } from "./middleware/error-handler.js"
import { requireMember, requireAdmin } from "./middleware/auth-guards.js"
import authRouter from "./routes/auth.js"
import adminUsersRouter from "./routes/admin-users.js"
import fsRouter from "./routes/fs.js"
import projectRouter from "./routes/project.js"
import stateRouter from "./routes/state.js"
import mediaRouter from "./routes/media.js"
import llmRouter from "./routes/llm.js"
import vectorRouter from "./routes/vector.js"
import preprocessRouter from "./routes/preprocess.js"
import ingestRouter from "./routes/ingest.js"
import adminRouter from "./routes/admin.js"
import mappingCheckRouter from "./routes/mapping-check.js"
import llmDebugRouter from "./routes/llm-debug.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(cors({ origin: config.corsOrigin, credentials: true }))
app.use(express.json({ limit: "50mb" }))
app.use(cookieParser())

// ── 1. Auth routes (always public) ───────────────────────────────────────────
app.use("/api/auth", authRouter)

// ── 2. Media — always public (wiki images, attachments) ──────────────────────
app.use("/api/media", mediaRouter)

// ── 3. /api/fs — read operations are public, mutations require member auth ────
//    Public  : list, read, find-related  (anyone can browse a wiki)
//    Member+ : write, copy, delete, mkdir, upload  (require login)
const FS_PUBLIC_OPS = new Set(["/read", "/list", "/find-related"])
function wikiReadPublicGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "POST" && FS_PUBLIC_OPS.has(req.path)) {
    next()
    return
  }
  requireMember(req, res, next)
}
app.use("/api/fs", wikiReadPublicGuard, fsRouter)

// ── 4. Project listing — public (needed to show wiki without login) ───────────
app.get("/api/project", projectRouter)
app.use("/api/project", requireMember, projectRouter)

// ── 5. Member routes ──────────────────────────────────────────────────────────
app.use("/api/ingest", requireMember, ingestRouter)
app.use("/api/preprocess", requireMember, preprocessRouter)
app.use("/api/vector", requireMember, vectorRouter)

// ── 6. Admin-only routes ──────────────────────────────────────────────────────
app.use("/api/llm/debug", requireAdmin, llmDebugRouter)
app.use("/api/llm", requireAdmin, llmRouter)

// /api/state has mixed access:
//   Public keys  : recentProjects, lastProject, language (app preferences)
//   Admin-only   : llmConfig, searchApiConfig, embeddingConfig, etc.
const PUBLIC_STATE_KEYS = new Set(["recentProjects", "lastProject", "language"])
function stateAccessGuard(req: Request, res: Response, next: NextFunction): void {
  const key = req.path.replace(/^\//, "").split("/")[0]
  if (PUBLIC_STATE_KEYS.has(key)) { next(); return }
  requireAdmin(req, res, next)
}
app.use("/api/state", stateAccessGuard, stateRouter)
app.use("/api/admin/users", adminUsersRouter) // already has requireAdmin internally
app.use("/api/admin", requireAdmin, adminRouter)
app.use("/api/mapping-check", requireAdmin, mappingCheckRouter)

// ── SPA static files ──────────────────────────────────────────────────────────
const distDir = process.env.STATIC_DIR ?? path.resolve(__dirname, "../../../../dist")
app.use(express.static(distDir))
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"))
})

app.use(errorHandler)

process.on("SIGTERM", () => {
  console.log("[llm-wiki-server] SIGTERM received → exit(0)")
  process.exit(0)
})
process.on("SIGINT", () => {
  console.log("[llm-wiki-server] SIGINT received → exit(0)")
  process.exit(0)
})

runMigrations()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`[llm-wiki-server] running on http://localhost:${config.port}`)
      console.log(`[llm-wiki-server] PROJECTS_ROOT = ${config.projectsRoot}`)
      console.log(`[llm-wiki-server] Auth: JWT + PostgreSQL`)
    })
  })
  .catch((err) => {
    console.error("[llm-wiki-server] Failed to run migrations, exiting:", err)
    process.exit(1)
  })

export { app }
