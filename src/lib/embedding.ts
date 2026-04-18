import { readFile, listDirectory } from "@/commands/fs"
import { apiPost, apiGet } from "@/lib/api-client"
import type { EmbeddingConfig } from "@/stores/wiki-store"
import type { FileNode } from "@/types/wiki"

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

async function vectorUpsert(projectId: string, pageId: string, embedding: number[]): Promise<void> {
  await apiPost("/api/vector/upsert", {
    projectId,
    pageId,
    embedding: embedding.map((v) => Math.fround(v)),
  })
}

async function vectorSearchLance(
  projectId: string,
  queryEmbedding: number[],
  topK: number,
): Promise<Array<{ page_id: string; score: number }>> {
  return apiPost<Array<{ page_id: string; score: number }>>("/api/vector/search", {
    projectId,
    queryEmbedding: queryEmbedding.map((v) => Math.fround(v)),
    topK,
  })
}

async function vectorDelete(projectId: string, pageId: string): Promise<void> {
  await apiPost("/api/vector/delete", { projectId, pageId })
}

async function vectorCount(projectId: string): Promise<number> {
  return apiGet<number>(`/api/vector/count?projectId=${encodeURIComponent(projectId)}`)
}

// ── Public API ────────────────────────────────────────────────────────────

export async function embedPage(
  projectId: string,
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
    await vectorUpsert(projectId, pageId, emb)
    console.log(
      `[Embedding] Indexed "${pageId}" (${emb.length}d) in ${Math.round(performance.now() - t0)}ms`,
    )
  } else {
    console.log(`[Embedding] Failed to embed "${pageId}"`)
  }
}

export async function embedAllPages(
  projectId: string,
  embeddingConfig: EmbeddingConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (!embeddingConfig.enabled || !embeddingConfig.model) return 0

  let tree: FileNode[]
  try {
    tree = await listDirectory(projectId, "wiki")
  } catch {
    return 0
  }

  const mdFiles: { id: string; relativePath: string }[] = []
  function walk(nodes: FileNode[]) {
    for (const node of nodes) {
      if (node.is_dir && node.children) {
        walk(node.children)
      } else if (!node.is_dir && node.name.endsWith(".md")) {
        const id = node.name.replace(/\.md$/, "")
        if (!["index", "log", "overview", "purpose", "schema"].includes(id)) {
          mdFiles.push({ id, relativePath: node.relativePath })
        }
      }
    }
  }
  walk(tree)

  let done = 0
  for (const file of mdFiles) {
    try {
      const content = await readFile(projectId, file.relativePath)
      const titleMatch = content.match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m)
      const title = titleMatch ? titleMatch[1].trim() : file.id

      const text = `${title}\n${content.slice(0, 1500)}`
      const emb = await fetchEmbedding(text, embeddingConfig)
      if (emb) {
        await vectorUpsert(projectId, file.id, emb)
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
  projectId: string,
  query: string,
  embeddingConfig: EmbeddingConfig,
  topK: number = 10,
): Promise<Array<{ id: string; score: number }>> {
  if (!embeddingConfig.enabled || !embeddingConfig.model) return []

  const queryEmb = await fetchEmbedding(query, embeddingConfig)
  if (!queryEmb) return []

  try {
    const t0 = performance.now()
    const results = await vectorSearchLance(projectId, queryEmb, topK)
    console.log(
      `[Embedding] Vector search: ${results.length} results in ${Math.round(performance.now() - t0)}ms`,
    )
    return results.map((r) => ({ id: r.page_id, score: r.score }))
  } catch (err) {
    console.log(
      `[Embedding] Vector search failed: ${err instanceof Error ? err.message : err}`,
    )
    return []
  }
}

export async function removePageEmbedding(projectId: string, pageId: string): Promise<void> {
  try {
    await vectorDelete(projectId, pageId)
  } catch {
    // non-critical
  }
}

export async function getEmbeddingCount(projectId: string): Promise<number> {
  try {
    return await vectorCount(projectId)
  } catch {
    return 0
  }
}
