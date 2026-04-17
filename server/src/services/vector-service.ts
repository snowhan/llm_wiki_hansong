import path from "node:path"
import fs from "node:fs/promises"

/**
 * Lightweight JSON-file-based vector store.
 * Stores embeddings in {projectPath}/.llm-wiki/vectors.json
 * For production, swap to LanceDB Node.js bindings when available.
 */

interface VectorRecord {
  page_id: string
  embedding: number[]
}

async function getStorePath(projectPath: string): Promise<string> {
  const dir = path.join(projectPath, ".llm-wiki")
  await fs.mkdir(dir, { recursive: true })
  return path.join(dir, "vectors.json")
}

async function loadVectors(projectPath: string): Promise<VectorRecord[]> {
  const filePath = await getStorePath(projectPath)
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    return JSON.parse(raw) as VectorRecord[]
  } catch {
    return []
  }
}

async function saveVectors(projectPath: string, records: VectorRecord[]): Promise<void> {
  const filePath = await getStorePath(projectPath)
  await fs.writeFile(filePath, JSON.stringify(records), "utf-8")
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export async function vectorUpsert(
  projectPath: string,
  pageId: string,
  embedding: number[],
): Promise<void> {
  const records = await loadVectors(projectPath)
  const idx = records.findIndex((r) => r.page_id === pageId)
  if (idx >= 0) {
    records[idx].embedding = embedding
  } else {
    records.push({ page_id: pageId, embedding })
  }
  await saveVectors(projectPath, records)
}

export async function vectorSearch(
  projectPath: string,
  queryEmbedding: number[],
  topK: number,
): Promise<Array<{ page_id: string; score: number }>> {
  const records = await loadVectors(projectPath)
  const scored = records.map((r) => ({
    page_id: r.page_id,
    score: cosineSimilarity(queryEmbedding, r.embedding),
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

export async function vectorDelete(projectPath: string, pageId: string): Promise<void> {
  const records = await loadVectors(projectPath)
  const filtered = records.filter((r) => r.page_id !== pageId)
  await saveVectors(projectPath, filtered)
}

export async function vectorCount(projectPath: string): Promise<number> {
  const records = await loadVectors(projectPath)
  return records.length
}
