/**
 * fetchWithAuth — a drop-in replacement for fetch() that handles JWT expiry.
 *
 * On a 401 response the function:
 *  1. Calls refreshToken() once to silently renew the access token
 *  2. If refresh succeeds  → retries the original request with the new token
 *  3. If refresh fails     → calls clearAuth() (forces re-login) and throws
 *
 * This is intentionally framework-agnostic: it reads auth state from the
 * Zustand store directly so it can be called from any module without hooks.
 */

import { useAuthStore } from "@/stores/auth-store"

function buildHeaders(
  token: string,
  incoming: HeadersInit | undefined,
): Record<string, string> {
  const base: Record<string, string> = {}
  if (incoming) {
    if (incoming instanceof Headers) {
      incoming.forEach((v, k) => { base[k] = v })
    } else if (Array.isArray(incoming)) {
      for (const [k, v] of incoming) base[k] = v
    } else {
      Object.assign(base, incoming)
    }
  }
  if (token) base["Authorization"] = `Bearer ${token}`
  return base
}

/**
 * Perform a fetch with automatic JWT refresh on 401.
 *
 * @param input  - URL string (same as fetch's first argument)
 * @param init   - RequestInit options (headers will be augmented, not replaced)
 * @returns      - The Response from the (possibly retried) request
 * @throws       - "会话已过期，请重新登录" when refresh is unavailable
 */
export async function fetchWithAuth(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const { accessToken, refreshToken, clearAuth } = useAuthStore.getState()

  const firstResponse = await fetch(input, {
    ...init,
    headers: buildHeaders(accessToken ?? "", init.headers),
  })

  if (firstResponse.status !== 401) {
    return firstResponse
  }

  // ── 401: attempt a silent token refresh ───────────────────────────────
  let refreshed = false
  try {
    refreshed = await refreshToken()
  } catch {
    // network error during refresh — treat as failed
  }

  if (!refreshed) {
    clearAuth()
    throw new Error("会话已过期，请重新登录")
  }

  // Re-read token after refresh (store was updated by refreshToken())
  const { accessToken: newToken } = useAuthStore.getState()

  // Retry once with the new token; do NOT recurse to prevent infinite loops
  return fetch(input, {
    ...init,
    headers: buildHeaders(newToken ?? "", init.headers),
  })
}
