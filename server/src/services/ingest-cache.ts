/**
 * File-based ingest cache for skipping unchanged sources.
 * Stores SHA-256 hashes of source content and the wiki files produced.
 */

import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"

export interface CacheEntry {
  hash: string
  timestamp: number
  filesWritten: string[]
}

export interface CacheData {
  entries: Record<string, CacheEntry>
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

export async function loadCache(projectPath: string): Promise<CacheData> {
  try {
    const raw = await fs.readFile(
      path.join(projectPath, ".llm-wiki", "ingest-cache.json"),
      "utf-8",
    )
    return JSON.parse(raw) as CacheData
  } catch { return { entries: {} } }
}

export async function saveCache(projectPath: string, data: CacheData): Promise<void> {
  try {
    const p = path.join(projectPath, ".llm-wiki", "ingest-cache.json")
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, JSON.stringify(data, null, 2))
  } catch { /* non-critical */ }
}

export async function checkCache(
  projectPath: string,
  fileName: string,
  content: string,
): Promise<string[] | null> {
  const cache = await loadCache(projectPath)
  const entry = cache.entries[fileName]
  if (!entry) return null
  return entry.hash === sha256(content) ? entry.filesWritten : null
}

export async function persistCache(
  projectPath: string,
  fileName: string,
  content: string,
  files: string[],
): Promise<void> {
  const cache = await loadCache(projectPath)
  cache.entries[fileName] = { hash: sha256(content), timestamp: Date.now(), filesWritten: files }
  await saveCache(projectPath, cache)
}
