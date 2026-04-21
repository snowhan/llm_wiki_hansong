import { useAuthStore } from "@/stores/auth-store"

// In production (base: '/wiki/'), import.meta.env.BASE_URL = '/wiki/' → '/wiki'
// In development (no base), import.meta.env.BASE_URL = '/' → ''
const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "")

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().accessToken
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

/**
 * Execute a fetch request with automatic 401 → silent refresh → retry logic.
 * If refresh also fails, clears auth state (user will see login prompt).
 * If the user has no active session (no accessToken), skip the refresh attempt
 * entirely — this avoids noisy refresh failures for unauthenticated visitors.
 */
async function fetchWithRefresh(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, { credentials: "include", ...init })

  if (res.status !== 401) return res

  // Skip refresh when the user is not authenticated (guest / visitor).
  if (!useAuthStore.getState().accessToken) return res

  // Try silent token refresh
  const refreshed = await useAuthStore.getState().refreshToken()
  if (!refreshed) {
    useAuthStore.getState().clearAuth()
    return res // return the 401 for callers to handle
  }

  // Retry with the new token
  const newHeaders = {
    ...(init?.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${useAuthStore.getState().accessToken}`,
  }
  return fetch(input, { credentials: "include", ...init, headers: newHeaders })
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ─────────────────────────────────────────────────────────────────────────────

export async function apiPost<T = void>(url: string, body?: unknown): Promise<T> {
  const res = await fetchWithRefresh(`${BASE_URL}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return parseResponse<T>(res)
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetchWithRefresh(`${BASE_URL}${url}`, {
    headers: authHeaders(),
  })
  return parseResponse<T>(res)
}

export async function apiPatch<T = void>(url: string, body?: unknown): Promise<T> {
  const res = await fetchWithRefresh(`${BASE_URL}${url}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return parseResponse<T>(res)
}

export async function apiPut(url: string, body?: unknown): Promise<void> {
  const res = await fetchWithRefresh(`${BASE_URL}${url}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  await parseResponse<void>(res)
}

export async function apiDelete(url: string, body?: unknown): Promise<void> {
  const res = await fetchWithRefresh(`${BASE_URL}${url}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  await parseResponse<void>(res)
}

export async function apiUpload(url: string, formData: FormData): Promise<{ paths: string[] }> {
  const res = await fetchWithRefresh(`${BASE_URL}${url}`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  })
  return parseResponse<{ paths: string[] }>(res)
}

export async function apiStream(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetchWithRefresh(`${BASE_URL}${url}`, {
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

export function mediaUrl(projectId: string, relativePath: string): string {
  return `${BASE_URL}/api/media?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(relativePath)}`
}
