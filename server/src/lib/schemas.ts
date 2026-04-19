/**
 * Centralized Zod schemas for all API route bodies / query params.
 * Import the relevant schema in each route and call `.safeParse()` or `.parse()`.
 */
import { z } from "zod"

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
const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
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
