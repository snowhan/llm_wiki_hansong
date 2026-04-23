/**
 * pgvector-based vector store.
 *
 * Stores embeddings in the `wiki_embeddings` PostgreSQL table using the
 * pgvector extension. Replaces the previous JSON file-based implementation.
 *
 * Requires: `CREATE EXTENSION vector;` and the migration in
 * `server/src/db/migrations/0004_add_pgvector.sql`.
 */
import { sql } from "drizzle-orm"
import { getDb } from "../db/client.js"

// ── helpers ────────────────────────────────────────────────────────────────

function embeddingLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`
}

// ── public API ─────────────────────────────────────────────────────────────

/**
 * Insert or update an embedding for a given (projectId, pageId) pair.
 * On conflict the embedding is overwritten (upsert semantics).
 */
export async function vectorUpsert(
  projectId: string,
  pageId: string,
  embedding: number[],
): Promise<void> {
  const vec = embeddingLiteral(embedding)
  await getDb().execute(
    sql`INSERT INTO wiki_embeddings (project_id, page_id, embedding, updated_at)
        VALUES (${projectId}, ${pageId}, ${vec}::vector, now())
        ON CONFLICT (project_id, page_id)
        DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = now()`,
  )
}

/**
 * Return the top-K most similar pages to `queryEmbedding` within `projectId`.
 * Results are ordered by cosine similarity descending (1 = identical, 0 = orthogonal).
 */
export async function vectorSearch(
  projectId: string,
  queryEmbedding: number[],
  topK: number,
): Promise<Array<{ page_id: string; score: number }>> {
  const vec = embeddingLiteral(queryEmbedding)
  const result = await getDb().execute(
    sql`SELECT page_id,
               1 - (embedding <=> ${vec}::vector) AS score
        FROM   wiki_embeddings
        WHERE  project_id = ${projectId}
        ORDER  BY score DESC
        LIMIT  ${topK}`,
  )
  return (result.rows as Array<{ page_id: string; score: string | number }>).map((r) => ({
    page_id: r.page_id,
    score: typeof r.score === "string" ? parseFloat(r.score) : r.score,
  }))
}

/**
 * Remove a page's embedding from the store.
 */
export async function vectorDelete(projectId: string, pageId: string): Promise<void> {
  await getDb().execute(
    sql`DELETE FROM wiki_embeddings
        WHERE project_id = ${projectId}
          AND page_id    = ${pageId}`,
  )
}

/**
 * Count the number of embeddings stored for a given project.
 */
export async function vectorCount(projectId: string): Promise<number> {
  const result = await getDb().execute(
    sql`SELECT COUNT(*) AS count
        FROM   wiki_embeddings
        WHERE  project_id = ${projectId}`,
  )
  const row = result.rows[0] as { count: string | number } | undefined
  if (!row) return 0
  return typeof row.count === "string" ? parseInt(row.count, 10) : row.count
}
