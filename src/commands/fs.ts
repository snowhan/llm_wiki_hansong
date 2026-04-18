import { apiPost } from "@/lib/api-client"
import type { FileNode, WikiProject } from "@/types/wiki"

export async function readFile(path: string): Promise<string> {
  const res = await apiPost<{ content: string }>("/api/fs/read", { path })
  return res.content
}

export async function writeFile(path: string, contents: string): Promise<void> {
  await apiPost("/api/fs/write", { path, contents })
}

export async function listDirectory(path: string): Promise<FileNode[]> {
  return apiPost<FileNode[]>("/api/fs/list", { path })
}

export async function copyFile(
  source: string,
  destination: string
): Promise<void> {
  await apiPost("/api/fs/copy", { source, dest: destination })
}

export async function copyDirectory(
  source: string,
  destination: string
): Promise<string[]> {
  return apiPost<string[]>("/api/fs/copy-directory", { source, dest: destination })
}

export type PreprocessStage = "reading" | "extracting" | "cached" | "done" | "error"

export async function preprocessFile(
  path: string,
  onStage?: (stage: PreprocessStage) => void,
): Promise<string> {
  const res = await fetch("/api/preprocess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
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
          const event = JSON.parse(trimmed.slice(6)) as { stage?: string; done?: boolean; content?: string; error?: string }
          if (event.stage) onStage?.(event.stage as PreprocessStage)
          if (event.done && event.content) result = event.content
        } catch { /* skip */ }
      }
    }
  }

  return result
}

export async function deleteFile(path: string): Promise<void> {
  await apiPost("/api/fs/delete", { path })
}

export async function findRelatedWikiPages(
  projectPath: string,
  sourceName: string
): Promise<string[]> {
  return apiPost<string[]>("/api/fs/find-related", { projectPath, name: sourceName })
}

export async function createDirectory(path: string): Promise<void> {
  await apiPost("/api/fs/mkdir", { path })
}

export async function createProject(
  name: string,
  path: string,
): Promise<WikiProject> {
  return apiPost<WikiProject>("/api/project/create", { name, parentPath: path })
}

export async function openProject(path: string): Promise<WikiProject> {
  return apiPost<WikiProject>("/api/project/open", { path })
}

export async function clipServerStatus(): Promise<string> {
  try {
    const res = await fetch("/api/clip/status")
    if (!res.ok) return "error"
    const data = await res.json() as { status: string }
    return data.status
  } catch {
    return "error"
  }
}
