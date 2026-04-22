/**
 * Centralized Zod schemas for all API route bodies / query params.
 * Import the relevant schema in each route and call `.safeParse()` or `.parse()`.
 *
 * Usage:
 *   router.post("/start", requireMember, validate(ingestStartSchema), handler)
 *   // handler receives typed req.body
 */
import { z } from "zod"
import type { Request, Response, NextFunction } from "express"

// ── Shared primitives ──────────────────────────────────────────────────────────
export const projectIdSchema = z.string().min(1, "projectId is required")
export const relativePathSchema = z.string().min(1, "path is required")

// ── /api/fs ────────────────────────────────────────────────────────────────────
export const fsReadSchema = z.object({
  projectId: projectIdSchema,
  path: relativePathSchema,
})

export const fsWriteSchema = z.object({
  projectId: projectIdSchema,
  path: relativePathSchema,
  contents: z.string(),
  writer: z.string().optional(),
})

export const fsListSchema = z.object({
  projectId: projectIdSchema,
  path: z.string().optional(),
})

export const fsCopySchema = z.object({
  projectId: projectIdSchema,
  source: z.string().min(1, "source is required"),
  dest: z.string().min(1, "dest is required"),
})

export const fsDeleteSchema = z.object({
  projectId: projectIdSchema,
  path: relativePathSchema,
})

export const fsMkdirSchema = z.object({
  projectId: projectIdSchema,
  path: relativePathSchema,
})

export const fsUploadBodySchema = z.object({
  projectId: projectIdSchema,
  destDir: z.string().min(1, "destDir is required"),
})

export const fsFindRelatedSchema = z.object({
  projectId: projectIdSchema,
  name: z.string().min(1, "name is required"),
})

// ── /api/project ───────────────────────────────────────────────────────────────
export const projectCreateSchema = z.object({
  name: z.string().min(1, "name is required"),
  parentPath: z.string().optional(),
})

export const projectOpenSchema = z.object({
  path: z.string().min(1, "path is required"),
})

export const projectBrowseQuerySchema = z.object({
  path: z.string().min(1, "path query is required"),
})

// ── /api/llm ───────────────────────────────────────────────────────────────────
const contentPartSchema = z.union([
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({
      url: z.string(),
      detail: z.enum(["auto", "low", "high"]).optional(),
    }),
  }),
])

const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.union([z.string(), z.array(contentPartSchema)]),
})

export const llmStreamSchema = z.object({
  messages: z.array(chatMessageSchema).min(1, "messages must not be empty"),
})

// ── /api/ingest ────────────────────────────────────────────────────────────────
export const ingestStartSchema = z.object({
  projectId: projectIdSchema,
  sourcePath: z.string().min(1, "sourcePath is required"),
  folderContext: z.string().optional(),
  force: z.boolean().optional(),
})

// ── /api/state ─────────────────────────────────────────────────────────────────
export const stateSetSchema = z.object({
  value: z.unknown(),
})

// ── /api/vector ────────────────────────────────────────────────────────────────
export const vectorUpsertSchema = z.object({
  projectId: projectIdSchema,
  pageId: z.string().min(1, "pageId is required"),
  embedding: z.array(z.number()).min(1, "embedding must not be empty"),
})

export const vectorSearchSchema = z.object({
  projectId: projectIdSchema,
  queryEmbedding: z.array(z.number()).min(1, "queryEmbedding must not be empty"),
  topK: z.number().int().positive().optional(),
})

export const vectorDeleteSchema = z.object({
  projectId: projectIdSchema,
  pageId: z.string().min(1, "pageId is required"),
})

export const vectorCountQuerySchema = z.object({
  projectId: z.string().min(1, "projectId query is required"),
})

// ── StartIngestSchema alias (matches plan convention) ──────────────────────
export const StartIngestSchema = ingestStartSchema

// ── Generic validate middleware ────────────────────────────────────────────

/**
 * Express middleware that validates `req.body` against a Zod schema.
 * Returns 400 with structured error details on failure.
 * On success, replaces req.body with the parsed (typed) value and calls next().
 *
 * Usage:
 *   router.post("/start", requireMember, validate(ingestStartSchema), handler)
 */
export function validate<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      })
      return
    }
    req.body = result.data
    next()
  }
}
