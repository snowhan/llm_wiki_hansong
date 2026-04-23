/**
 * PostgreSQL-backed ingest task store.
 * Replaces the in-memory Map<string, ServerIngestTask> in ingest-service.ts.
 * All operations are idempotent and safe for concurrent use.
 */

import { randomUUID } from "node:crypto"
import { eq, and, inArray } from "drizzle-orm"
import { getDb } from "../db/client.js"
import { ingestTasks } from "../db/schema.js"
import type { ServerIngestTask } from "../types.js"

// ── Type mapping ───────────────────────────────────────────────────────────

function toMs(val: Date | number): number {
  return val instanceof Date ? val.getTime() : val
}

function rowToTask(row: typeof ingestTasks.$inferSelect): ServerIngestTask {
  return {
    id: row.id,
    projectId: row.projectId,
    sourcePath: row.sourcePath,
    folderContext: row.folderContext,
    force: row.force,
    status: row.status as ServerIngestTask["status"],
    detail: row.detail,
    filesWritten: row.filesWritten ?? [],
    error: row.error ?? null,
    createdAt: toMs(row.createdAt as Date | number),
    updatedAt: toMs(row.updatedAt as Date | number),
  }
}

// ── CRUD operations ────────────────────────────────────────────────────────

export async function createIngestTask(
  projectId: string,
  sourcePath: string,
  folderContext = "",
  force = false,
): Promise<ServerIngestTask> {
  const db = getDb()
  const id = randomUUID()
  const now = new Date()
  const [row] = await db
    .insert(ingestTasks)
    .values({
      id,
      projectId,
      sourcePath,
      folderContext,
      force,
      status: "pending",
      detail: "Queued",
      filesWritten: [],
      error: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return rowToTask(row)
}

export async function getIngestTask(taskId: string): Promise<ServerIngestTask | null> {
  const db = getDb()
  const rows = await db
    .select()
    .from(ingestTasks)
    .where(eq(ingestTasks.id, taskId))
  return rows.length > 0 ? rowToTask(rows[0]) : null
}

export async function updateIngestTask(
  taskId: string,
  patch: Partial<Pick<ServerIngestTask, "status" | "detail" | "filesWritten" | "error">>,
): Promise<ServerIngestTask | null> {
  const db = getDb()
  const updateValues: Partial<typeof ingestTasks.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (patch.status !== undefined) updateValues.status = patch.status
  if (patch.detail !== undefined) updateValues.detail = patch.detail
  if (patch.filesWritten !== undefined) updateValues.filesWritten = patch.filesWritten
  if (patch.error !== undefined) updateValues.error = patch.error

  const rows = await db
    .update(ingestTasks)
    .set(updateValues)
    .where(eq(ingestTasks.id, taskId))
    .returning()
  return rows.length > 0 ? rowToTask(rows[0]) : null
}

/**
 * Find a task in "pending" or "running" state for the given project + source path.
 * Used for deduplication: if a task is already active, return it instead of creating a new one.
 */
export async function findActiveIngestTask(
  projectId: string,
  sourcePath: string,
): Promise<ServerIngestTask | null> {
  const db = getDb()
  const rows = await db
    .select()
    .from(ingestTasks)
    .where(
      and(
        eq(ingestTasks.projectId, projectId),
        eq(ingestTasks.sourcePath, sourcePath),
        inArray(ingestTasks.status, ["pending", "running"]),
      ),
    )
  return rows.length > 0 ? rowToTask(rows[0]) : null
}

export async function getAllIngestTasks(projectId?: string): Promise<ServerIngestTask[]> {
  const db = getDb()
  const rows = projectId
    ? await db.select().from(ingestTasks).where(eq(ingestTasks.projectId, projectId))
    : await db.select().from(ingestTasks)
  return rows.map(rowToTask)
}
