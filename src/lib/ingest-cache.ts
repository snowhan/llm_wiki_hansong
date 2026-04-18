import { readFile, writeFile } from "@/commands/fs"

/**
 * SHA256-based ingest cache.
 * Stores hash of source file content → skips re-ingest if unchanged.
 * Cache file: .llm-wiki/ingest-cache.json
 */

interface CacheEntry {
  hash: string
  timestamp: number
  filesWritten: string[]
}

interface CacheData {
  entries: Record<string, CacheEntry> // keyed by source filename
}

const CACHE_RELATIVE_PATH = ".llm-wiki/ingest-cache.json"

async function sha256(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function loadCache(projectId: string): Promise<CacheData> {
  try {
    const raw = await readFile(projectId, CACHE_RELATIVE_PATH)
    return JSON.parse(raw) as CacheData
  } catch {
    return { entries: {} }
  }
}

async function saveCache(projectId: string, cache: CacheData): Promise<void> {
  try {
    await writeFile(projectId, CACHE_RELATIVE_PATH, JSON.stringify(cache, null, 2))
  } catch {
    // non-critical
  }
}

/**
 * Check if a source file has already been ingested with the same content.
 * Returns the list of previously written files if cached, or null if ingest is needed.
 */
export async function checkIngestCache(
  projectId: string,
  sourceFileName: string,
  sourceContent: string,
): Promise<string[] | null> {
  const cache = await loadCache(projectId)
  const entry = cache.entries[sourceFileName]
  if (!entry) return null

  const currentHash = await sha256(sourceContent)
  if (entry.hash === currentHash) {
    return entry.filesWritten
  }
  return null
}

/**
 * Save ingest result to cache after successful ingest.
 */
export async function saveIngestCache(
  projectId: string,
  sourceFileName: string,
  sourceContent: string,
  filesWritten: string[],
): Promise<void> {
  const cache = await loadCache(projectId)
  const hash = await sha256(sourceContent)
  const newEntries = { ...cache.entries }
  newEntries[sourceFileName] = {
    hash,
    timestamp: Date.now(),
    filesWritten,
  }
  await saveCache(projectId, { entries: newEntries })
}

/**
 * Remove a source file entry from cache (e.g., when source is deleted).
 */
export async function removeFromIngestCache(
  projectId: string,
  sourceFileName: string,
): Promise<void> {
  const cache = await loadCache(projectId)
  const newEntries = { ...cache.entries }
  delete newEntries[sourceFileName]
  await saveCache(projectId, { entries: newEntries })
}
