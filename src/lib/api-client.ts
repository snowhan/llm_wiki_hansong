import { getStoredToken } from "@/lib/auth"

const BASE_URL = ""

function authHeaders(): Record<string, string> {
  const token = getStoredToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export async function apiPost<T = void>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: authHeaders(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function apiPut(url: string, body?: unknown): Promise<void> {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `HTTP ${res.status}`)
  }
}

export async function apiDelete(url: string, body?: unknown): Promise<void> {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `HTTP ${res.status}`)
  }
}

export async function apiUpload(url: string, formData: FormData): Promise<{ paths: string[] }> {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json() as Promise<{ paths: string[] }>
}

export async function apiStream(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res
}

/**
 * Build a media URL for a file within a project.
 * @param projectId - The project ID
 * @param relativePath - The relative path within the project
 */
export function mediaUrl(projectId: string, relativePath: string): string {
  return `${BASE_URL}/api/media?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(relativePath)}`
}
