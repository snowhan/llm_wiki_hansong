import { apiPost, apiGet, apiUpload } from "@/lib/api-client"
import { getStoredToken } from "@/lib/auth"
import type { FileNode, WikiProject } from "@/types/wiki"

// ── File operations ────────────────────────────────────────────────────────

export async function readFile(projectId: string, relativePath: string): Promise<string> {
  const res = await apiPost<{ content: string | null }>("/api/fs/read", {
    projectId,
    path: relativePath,
  })
  if (res.content === null) throw new Error(`File not found: ${relativePath}`)
  return res.content
}

export async function writeFile(
  projectId: string,
  relativePath: string,
  contents: string,
  options?: { writer?: string },
): Promise<void> {
  await apiPost("/api/fs/write", { projectId, path: relativePath, contents, writer: options?.writer })
}

export async function listDirectory(
  projectId: string,
  relativePath?: string,
): Promise<FileNode[]> {
  return apiPost<FileNode[]>("/api/fs/list", { projectId, path: relativePath })
}

export async function copyFile(
  projectId: string,
  source: string,
  destination: string,
): Promise<void> {
  await apiPost("/api/fs/copy", { projectId, source, dest: destination })
}

export async function copyDirectory(
  projectId: string,
  source: string,
  destination: string,
): Promise<string[]> {
  return apiPost<string[]>("/api/fs/copy-directory", { projectId, source, dest: destination })
}

export type PreprocessStage = "reading" | "extracting" | "cached" | "done" | "error"

export async function preprocessFile(
  projectId: string,
  relativePath: string,
  onStage?: (stage: PreprocessStage) => void,
): Promise<string> {
  const token = getStoredToken()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`

  const res = await fetch("/api/preprocess", {
    method: "POST",
    headers,
    body: JSON.stringify({ projectId, path: relativePath }),
  })
  if (!res.ok) throw new Error(await res.text())
  const reader = res.body?.getReader()
  if (!reader) throw new Error("No response body")

  const decoder = new TextDecoder()
  let result = ""
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith("data: ")) {
        try {
          const event = JSON.parse(trimmed.slice(6)) as {
            stage?: string; done?: boolean; content?: string; error?: string
          }
          if (event.stage) onStage?.(event.stage as PreprocessStage)
          if (event.done && event.content) result = event.content
        } catch { /* skip */ }
      }
    }
  }

  return result
}

export async function deleteFile(projectId: string, relativePath: string): Promise<void> {
  await apiPost("/api/fs/delete", { projectId, path: relativePath })
}

export async function findRelatedWikiPages(
  projectId: string,
  sourceName: string,
): Promise<string[]> {
  return apiPost<string[]>("/api/fs/find-related", { projectId, name: sourceName })
}

export async function createDirectory(projectId: string, relativePath: string): Promise<void> {
  await apiPost("/api/fs/mkdir", { projectId, path: relativePath })
}

export async function uploadFiles(
  projectId: string,
  destDir: string,
  formData: FormData,
): Promise<{ paths: string[] }> {
  formData.set("projectId", projectId)
  formData.set("destDir", destDir)
  return apiUpload("/api/fs/upload", formData)
}

// ── Project operations ─────────────────────────────────────────────────────

export async function createProject(name: string, parentPath: string): Promise<WikiProject> {
  return apiPost<WikiProject>("/api/project/create", { name, parentPath })
}

export async function openProject(path: string): Promise<WikiProject> {
  return apiPost<WikiProject>("/api/project/open", { path })
}

export async function listProjects(): Promise<WikiProject[]> {
  return apiGet<WikiProject[]>("/api/project/list")
}
