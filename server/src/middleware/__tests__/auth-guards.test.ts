/**
 * TDD tests for JWT-based auth guard middleware.
 * verifyAccessToken is mocked to avoid real JWT operations.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response, NextFunction } from "express"

vi.mock("../../lib/auth-utils.js", () => ({
  verifyAccessToken: vi.fn(),
}))

vi.mock("../../config.js", () => ({
  config: {
    jwtSecret: "test-secret-at-least-32-characters-long!!",
  },
}))

import * as authUtils from "../../lib/auth-utils.js"
import { requireAuth, requireMember, requireAdmin } from "../auth-guards.js"

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    query: {},
    ...overrides,
  } as unknown as Request
}

function makeRes(): { res: Response; statusMock: ReturnType<typeof vi.fn>; jsonMock: ReturnType<typeof vi.fn> } {
  const jsonMock = vi.fn()
  const statusMock = vi.fn().mockReturnValue({ json: jsonMock })
  return { res: { status: statusMock } as unknown as Response, statusMock, jsonMock }
}

const mockPayload = { userId: "user-001", role: "member" as const }
const mockAdminPayload = { userId: "admin-001", role: "admin" as const }

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
describe("requireAuth middleware", () => {
  it("有效 Bearer token 应通过验证并将 payload 挂载到 req.user", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockResolvedValue(mockPayload)
    const req = makeReq({ headers: { authorization: "Bearer valid-token" } })
    const { res } = makeRes()
    const next = vi.fn()

    await requireAuth(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect((req as Request & { user: unknown }).user).toEqual(mockPayload)
  })

  it("缺少 Authorization 头应返回 401", async () => {
    const req = makeReq()
    const { res, statusMock, jsonMock } = makeRes()
    const next = vi.fn()

    await requireAuth(req, res, next)

    expect(statusMock).toHaveBeenCalledWith(401)
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }))
    expect(next).not.toHaveBeenCalled()
  })

  it("token 验证失败应返回 401", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockRejectedValue(new Error("invalid"))
    const req = makeReq({ headers: { authorization: "Bearer bad-token" } })
    const { res, statusMock } = makeRes()
    const next = vi.fn()

    await requireAuth(req, res, next)

    expect(statusMock).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it("SSE query token 作为降级方案应被接受", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockResolvedValue(mockPayload)
    const req = makeReq({ headers: {}, query: { token: "query-token" } })
    const { res } = makeRes()
    const next = vi.fn()

    await requireAuth(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("requireMember middleware", () => {
  it("member 角色用户应通过", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockResolvedValue(mockPayload)
    const req = makeReq({ headers: { authorization: "Bearer token" } })
    const { res } = makeRes()
    const next = vi.fn()

    await requireMember(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it("admin 角色用户也应通过（admin ⊇ member）", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockResolvedValue(mockAdminPayload)
    const req = makeReq({ headers: { authorization: "Bearer token" } })
    const { res } = makeRes()
    const next = vi.fn()

    await requireMember(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it("未认证请求应返回 401", async () => {
    const req = makeReq()
    const { res, statusMock } = makeRes()
    const next = vi.fn()

    await requireMember(req, res, next)

    expect(statusMock).toHaveBeenCalledWith(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("requireAdmin middleware", () => {
  it("admin 角色应通过", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockResolvedValue(mockAdminPayload)
    const req = makeReq({ headers: { authorization: "Bearer admin-token" } })
    const { res } = makeRes()
    const next = vi.fn()

    await requireAdmin(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it("member 角色应返回 403", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockResolvedValue(mockPayload)
    const req = makeReq({ headers: { authorization: "Bearer member-token" } })
    const { res, statusMock, jsonMock } = makeRes()
    const next = vi.fn()

    await requireAdmin(req, res, next)

    expect(statusMock).toHaveBeenCalledWith(403)
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }))
    expect(next).not.toHaveBeenCalled()
  })

  it("未认证请求应返回 401", async () => {
    const req = makeReq()
    const { res, statusMock } = makeRes()
    const next = vi.fn()

    await requireAdmin(req, res, next)

    expect(statusMock).toHaveBeenCalledWith(401)
  })
})
