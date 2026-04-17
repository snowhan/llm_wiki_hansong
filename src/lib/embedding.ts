import { readFile, listDirectory } from "@/commands/fs"
import { apiPost, apiGet } from "@/lib/api-client"
import type { EmbeddingConfig } from "@/stores/wiki-store"
import type { FileNode } from "@/types/wiki"
import { normalizePath } from "@/lib/path-utils"

// ── Embedding API ─────────────────────────────────────────────────────────

async function fetchEmbedding(
  text: string,
  embeddingConfig: EmbeddingConfig,
): Promise<number[] | null> {
  if (!embeddingConfig.endpoint) return null

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (embeddingConfig.apiKey) {
    headers["Authorization"] = `Bearer ${embeddingConfig.apiKey}`
  }

  try {
    const resp = await fetch(embeddingConfig.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: embeddingConfig.model,
        input: text.slice(0, 2000),
      }),
    })
    if (!resp.ok) {
      console.warn(`[Embedding] API error: ${resp.status} ${resp.statusText}`)
      return null
    }
    const data = await resp.json()
    return data?.data?.[0]?.embedding ?? null
  } catch {
    return null
  }
}

// ── Vector operations via backend API ─────────────────────────────────────

async function vectorUpsert(projectPath: string, pageId: string, embedding: number[]): Promise<void> {
  await apiPost("/api/vector/upsert", {
    projectPath: normalizePath(projectPath),
    pageId,
    embedding: embedding.map((v) => Math.fround(v)),
  })
}

async function vectorSearchLance(projectPath: string, queryEmbedding: number[], topK: number): Promise<Array<{ page_id: string; score: number }>> {
  return await apiPost<Array<{ page_id: string; score: number }>>("/api/vector/search", {
    projectPath: normalizePath(projectPath),
    queryEmbedding: queryEmbedding.map((v) => Math.fround(v)),
    topK,
  })
}

async function vectorDelete(projectPath: string, pageId: string): Promise<void> {
  await apiPost("/api/vector/delete", {
    projectPath: normalizePath(projectPath),
    pageId,
  })
}

async function vectorCount(projectPath: string): Promise<number> {
  return await apiGet<number>(`/api/vector/count?projectPath=${encodeURIComponent(normalizePath(projectPath))}`)
}

// ── Public API ────────────────────────────────────────────────────────────

export async function embedPage(
  projectPath: string,
  pageId: string,
  title: string,
  content: string,
  embeddingConfig: EmbeddingConfig,
): Promise<void> {
  if (!embeddingConfig.enabled || !embeddingConfig.model) return

  const t0 = performance.now()
  const text = `${title}\n${content.slice(0, 1500)}`
  const emb = await fetchEmbedding(text, embeddingConfig)
  if (emb) {
    await vectorUpsert(projectPath, pageId, emb)
    console.log(`[Embedding] Indexed "${pageId}" (${emb.length}d) in ${Math.round(performance.now() - t0)}ms`)
  } else {
    console.log(`[Embedding] Failed to embed "${pageId}"`)
  }
}

export async function embedAllPages(
  projectPath: string,
  embeddingConfig: EmbeddingConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (!embeddingConfig.enabled || !embeddingConfig.model) return 0

  const pp = normalizePath(projectPath)

  let tree: FileNode[]
  try {
    tree = await listDirectory(`${pp}/wiki`)
  } catch {
    return 0
  }

  const mdFiles: { id: string; path: string }[] = []
  function walk(nodes: FileNode[]) {
    for (const node of nodes) {
      if (node.is_dir && node.children) {
        walk(node.children)
      } else if (!node.is_dir && node.name.endsWith(".md")) {
        const id = node.name.replace(/\.md$/, "")
        if (!["index", "log", "overview", "purpose", "schema"].includes(id)) {
          mdFiles.push({ id, path: node.path })
        }
      }
    }
  }
  walk(tree)

  let done = 0
  for (const file of mdFiles) {
    try {
      const content = await readFile(file.path)
      const titleMatch = content.match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m)
      const title = titleMatch ? titleMatch[1].trim() : file.id

      const text = `${title}\n${content.slice(0, 1500)}`
      const emb = await fetchEmbedding(text, embeddingConfig)
      if (emb) {
        await vectorUpsert(pp, file.id, emb)
      }
    } catch {
      // skip
    }

    done++
    if (onProgress) onProgress(done, mdFiles.length)
  }

  return done
}

export async function searchByEmbedding(
  projectPath: string,
  query: string,
  embeddingConfig: EmbeddingConfig,
  topK: number = 10,
): Promise<Array<{ id: string; score: number }>> {
  if (!embeddingConfig.enabled || !embeddingConfig.model) return []

  const queryEmb = await fetchEmbedding(query, embeddingConfig)
  if (!queryEmb) return []

  try {
    const t0 = performance.now()
    const results = await vectorSearchLance(projectPath, queryEmb, topK)
    console.log(`[Embedding] Vector search: ${results.length} results in ${Math.round(performance.now() - t0)}ms`)
    return results.map((r) => ({ id: r.page_id, score: r.score }))
  } catch (err) {
    console.log(`[Embedding] Vector search failed: ${err instanceof Error ? err.message : err}`)
    return []
  }
}

export async function removePageEmbedding(
  projectPath: string,
  pageId: string,
): Promise<void> {
  try {
    await vectorDelete(projectPath, pageId)
  } catch {
    // non-critical
  }
}

export async function getEmbeddingCount(
  projectPath: string,
): Promise<number> {
  try {
    return await vectorCount(projectPath)
  } catch {
    return 0
  }
}
