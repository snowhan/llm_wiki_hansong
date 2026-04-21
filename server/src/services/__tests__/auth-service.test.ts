/**
 * TDD tests for auth-service business logic.
 * DB layer is fully mocked so no real PostgreSQL connection is needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock: DB queries ─────────────────────────────────────────────────────────
vi.mock("../../db/queries.js", () => ({
  findUserByUsername: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
  countUsers: vi.fn(),
  findRefreshToken: vi.fn(),
  createRefreshToken: vi.fn(),
  deleteRefreshToken: vi.fn(),
  listUsers: vi.fn(),
  updateUser: vi.fn(),
}))

// ── Mock: config ──────────────────────────────────────────────────────────────
vi.mock("../../config.js", () => ({
  config: {
    jwtSecret: "test-secret-at-least-32-characters-long!!",
    jwtAccessExpiresIn: "15m",
    jwtRefreshExpiresInDays: 30,
    bcryptRounds: 4,
  },
}))

import * as queries from "../../db/queries.js"
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  getMe,
} from "../auth-service.js"

const mockMember = {
  id: "user-001",
  username: "alice",
  passwordHash: "$2b$04$hashedpassword",
  role: "member" as const,
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockAdmin = { ...mockMember, id: "admin-001", username: "firstuser", role: "admin" as const }

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
describe("registerUser", () => {
  it("第一位注册用户应自动成为 admin 且状态为 active", async () => {
    vi.mocked(queries.findUserByUsername).mockResolvedValue(null)
    vi.mocked(queries.countUsers).mockResolvedValue(0)
    vi.mocked(queries.createUser).mockResolvedValue(mockAdmin)

    const result = await registerUser("firstuser", "Password123!")

    expect(queries.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: "admin", status: "active" }),
    )
    expect(result.user.role).toBe("admin")
  })

  it("后续注册用户应为 member 且状态为 pending", async () => {
    vi.mocked(queries.findUserByUsername).mockResolvedValue(null)
    vi.mocked(queries.countUsers).mockResolvedValue(5)
    vi.mocked(queries.createUser).mockResolvedValue(mockMember)

    await registerUser("alice", "Password123!")

    expect(queries.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: "member", status: "pending" }),
    )
  })

  it("用户名已存在时应抛出包含 'already exists' 的错误", async () => {
    vi.mocked(queries.findUserByUsername).mockResolvedValue(mockMember)

    await expect(registerUser("alice", "Password123!")).rejects.toThrow(/already exists/i)
  })

  it("密码不足 8 位时应抛出验证错误", async () => {
    await expect(registerUser("bob", "short")).rejects.toThrow(/password/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("loginUser", () => {
  it("正确凭据应返回 accessToken 和 refreshToken", async () => {
    // 先哈希一个真实密码用于测试
    const { hashPassword } = await import("../../lib/auth-utils.js")
    const hash = await hashPassword("Password123!", 4)
    const userWithHash = { ...mockMember, passwordHash: hash }

    vi.mocked(queries.findUserByUsername).mockResolvedValue(userWithHash)
    vi.mocked(queries.createRefreshToken).mockResolvedValue(undefined)

    const result = await loginUser("alice", "Password123!")

    expect(result.accessToken).toBeDefined()
    expect(typeof result.accessToken).toBe("string")
    expect(result.refreshToken).toBeDefined()
    expect(typeof result.refreshToken).toBe("string")
    expect(result.user.username).toBe("alice")
  })

  it("用户名不存在时应抛出认证错误", async () => {
    vi.mocked(queries.findUserByUsername).mockResolvedValue(null)
    await expect(loginUser("unknown", "Password123!")).rejects.toThrow(/invalid credentials/i)
  })

  it("密码错误时应抛出认证错误（不透露具体原因）", async () => {
    const { hashPassword } = await import("../../lib/auth-utils.js")
    const hash = await hashPassword("correct-password", 4)
    vi.mocked(queries.findUserByUsername).mockResolvedValue({ ...mockMember, passwordHash: hash })

    await expect(loginUser("alice", "wrong-password")).rejects.toThrow(/invalid credentials/i)
  })

  it("pending 状态用户登录应抛出审批错误", async () => {
    const { hashPassword } = await import("../../lib/auth-utils.js")
    const hash = await hashPassword("Password123!", 4)
    vi.mocked(queries.findUserByUsername).mockResolvedValue({
      ...mockMember,
      status: "pending",
      passwordHash: hash,
    })

    await expect(loginUser("alice", "Password123!")).rejects.toThrow(/pending/i)
  })

  it("suspended 状态用户登录应抛出禁用错误", async () => {
    const { hashPassword } = await import("../../lib/auth-utils.js")
    const hash = await hashPassword("Password123!", 4)
    vi.mocked(queries.findUserByUsername).mockResolvedValue({
      ...mockMember,
      status: "suspended",
      passwordHash: hash,
    })

    await expect(loginUser("alice", "Password123!")).rejects.toThrow(/suspended/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("refreshAccessToken", () => {
  it("有效的 refresh token 应返回新的 accessToken 和旋转后的 refreshToken", async () => {
    const { hashToken } = await import("../../lib/auth-utils.js")
    const rawToken = "valid-refresh-token-abc123"
    const tokenHash = hashToken(rawToken)

    vi.mocked(queries.findRefreshToken).mockResolvedValue({
      id: "rt-001",
      userId: "user-001",
      tokenHash,
      expiresAt: new Date(Date.now() + 86400_000),
      createdAt: new Date(),
    })
    vi.mocked(queries.findUserById).mockResolvedValue(mockMember)
    vi.mocked(queries.deleteRefreshToken).mockResolvedValue(undefined)
    vi.mocked(queries.createRefreshToken).mockResolvedValue(undefined)

    const result = await refreshAccessToken(rawToken)

    expect(result.accessToken).toBeDefined()
    expect(result.newRefreshToken).toBeDefined()
    expect(result.newRefreshToken).not.toBe(rawToken) // 旋转：新旧 token 不同
    expect(queries.deleteRefreshToken).toHaveBeenCalledWith(tokenHash)
  })

  it("不存在的 refresh token 应抛出错误", async () => {
    vi.mocked(queries.findRefreshToken).mockResolvedValue(null)
    await expect(refreshAccessToken("nonexistent-token")).rejects.toThrow()
  })

  it("已过期的 refresh token 应抛出错误", async () => {
    vi.mocked(queries.findRefreshToken).mockResolvedValue({
      id: "rt-002",
      userId: "user-001",
      tokenHash: "any",
      expiresAt: new Date(Date.now() - 1000), // 已过期
      createdAt: new Date(),
    })

    await expect(refreshAccessToken("expired-token")).rejects.toThrow(/expired/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("logoutUser", () => {
  it("应当删除对应的 refresh token", async () => {
    const { hashToken } = await import("../../lib/auth-utils.js")
    vi.mocked(queries.deleteRefreshToken).mockResolvedValue(undefined)

    await logoutUser("user-001", "some-raw-token")

    expect(queries.deleteRefreshToken).toHaveBeenCalledWith(hashToken("some-raw-token"))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("getMe", () => {
  it("应返回不含密码哈希的用户信息", async () => {
    vi.mocked(queries.findUserById).mockResolvedValue(mockMember)
    const user = await getMe("user-001")
    expect(user.id).toBe("user-001")
    expect((user as Record<string, unknown>).passwordHash).toBeUndefined()
  })

  it("用户不存在时应抛出错误", async () => {
    vi.mocked(queries.findUserById).mockResolvedValue(null)
    await expect(getMe("nonexistent")).rejects.toThrow()
  })
})
