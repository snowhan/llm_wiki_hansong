/**
 * TDD tests for fetchWithAuth.
 *
 * Behaviour contract:
 *  1. Normal flow  → attaches Bearer token, returns response as-is
 *  2. 401 + refresh succeeds → silently retries with new token, returns retried response
 *  3. 401 + refresh fails    → calls clearAuth(), throws "Session expired" error
 *  4. No token available     → sends request without Authorization header (public endpoint)
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock auth-store ───────────────────────────────────────────────────────
const mockRefreshToken = vi.fn()
const mockClearAuth = vi.fn()
let mockAccessToken = "valid-token-123"

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: {
    getState: () => ({
      get accessToken() { return mockAccessToken },
      refreshToken: mockRefreshToken,
      clearAuth: mockClearAuth,
    }),
  },
}))

// Import after mocking
const { fetchWithAuth } = await import("../fetch-with-auth")

// ── Helpers ───────────────────────────────────────────────────────────────

function makeResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("fetchWithAuth", () => {
  beforeEach(() => {
    // resetAllMocks clears both call history AND the one-time implementation
    // queue — prevents leftover mockImplementationOnce entries from leaking
    // between tests.
    vi.resetAllMocks()
    mockAccessToken = "valid-token-123"
  })

  it("attaches Bearer token to the request", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(makeResponse(200, { ok: true }))
    vi.stubGlobal("fetch", mockFetch)

    await fetchWithAuth("/api/test")

    expect(mockFetch).toHaveBeenCalledOnce()
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((options.headers as Record<string, string>)["Authorization"]).toBe("Bearer valid-token-123")
  })

  it("returns response directly on success (non-401)", async () => {
    const okResponse = makeResponse(200, { data: "hello" })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(okResponse))

    const result = await fetchWithAuth("/api/test")

    expect(result.status).toBe(200)
  })

  it("passes through request options (method, body, headers)", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(makeResponse(200))
    vi.stubGlobal("fetch", mockFetch)

    await fetchWithAuth("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    })

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(options.method).toBe("POST")
    expect(options.body).toBe(JSON.stringify({ foo: "bar" }))
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json")
  })

  it("on 401: refreshes token and retries once with new token", async () => {
    // Single implementation that updates mockAccessToken and returns true
    mockRefreshToken.mockImplementationOnce(async () => {
      mockAccessToken = "new-token-456"
      return true
    })

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeResponse(401, { error: "Invalid or expired token" }))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }))

    vi.stubGlobal("fetch", mockFetch)

    const result = await fetchWithAuth("/api/ingest/start", { method: "POST" })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockRefreshToken).toHaveBeenCalledOnce()
    expect(mockClearAuth).not.toHaveBeenCalled()
    expect(result.status).toBe(200)

    // Verify that the retry used the refreshed token
    const [, retryOptions] = mockFetch.mock.calls[1] as [string, RequestInit]
    expect((retryOptions.headers as Record<string, string>)["Authorization"]).toBe("Bearer new-token-456")
  })

  it("on 401 + refresh success: retry uses the refreshed token", async () => {
    let storedToken = "expired-token"
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(makeResponse(200, { taskId: "t1" }))

    vi.stubGlobal("fetch", mockFetch)

    mockRefreshToken.mockImplementationOnce(async () => {
      storedToken = "fresh-token-789"
      mockAccessToken = "fresh-token-789"
      return true
    })
    mockAccessToken = storedToken

    await fetchWithAuth("/api/test")

    const [, secondOptions] = mockFetch.mock.calls[1] as [string, RequestInit]
    expect((secondOptions.headers as Record<string, string>)["Authorization"]).toBe("Bearer fresh-token-789")
  })

  it("on 401 + refresh fails: calls clearAuth and throws", async () => {
    mockRefreshToken.mockResolvedValueOnce(false)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(makeResponse(401)))

    await expect(fetchWithAuth("/api/test")).rejects.toThrow("会话已过期，请重新登录")

    expect(mockClearAuth).toHaveBeenCalledOnce()
  })

  it("on 401 + refresh throws: calls clearAuth and rethrows wrapped error", async () => {
    mockRefreshToken.mockRejectedValueOnce(new Error("network error"))
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(makeResponse(401)))

    await expect(fetchWithAuth("/api/test")).rejects.toThrow("会话已过期，请重新登录")

    expect(mockClearAuth).toHaveBeenCalledOnce()
  })

  it("does not retry a second 401 after refresh (prevents infinite loop)", async () => {
    mockRefreshToken.mockImplementationOnce(async () => {
      mockAccessToken = "new-token"
      return true
    })

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(makeResponse(401)) // retry also returns 401

    vi.stubGlobal("fetch", mockFetch)

    const result = await fetchWithAuth("/api/test")

    // Should return the 401 response from retry — no further refresh or throw
    expect(result.status).toBe(401)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockRefreshToken).toHaveBeenCalledOnce()
  })

  it("sends request without Authorization header when no token", async () => {
    mockAccessToken = ""
    const mockFetch = vi.fn().mockResolvedValueOnce(makeResponse(200))
    vi.stubGlobal("fetch", mockFetch)

    await fetchWithAuth("/api/public")

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers["Authorization"]).toBeUndefined()
  })
})
