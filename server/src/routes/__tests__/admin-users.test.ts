/**
 * TDD tests for /api/admin/users route.
 * DB queries and auth are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"
import cookieParser from "cookie-parser"

vi.mock("../../db/queries.js", () => ({
  listUsers: vi.fn(),
  updateUser: vi.fn(),
  findUserById: vi.fn(),
}))

vi.mock("../../config.js", () => ({
  config: {
    jwtSecret: "test-secret-at-least-32-characters-long!!",
    jwtAccessExpiresIn: "15m",
    jwtRefreshExpiresInDays: 30,
    bcryptRounds: 4,
  },
}))

vi.mock("../../lib/auth-utils.js", () => ({
  verifyAccessToken: vi.fn(),
}))

import * as queries from "../../db/queries.js"
import * as authUtils from "../../lib/auth-utils.js"
import adminUsersRouter from "../admin-users.js"

const mockAdmin = {
  id: "admin-001",
  username: "admin",
  role: "admin" as const,
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
}
const mockMember = {
  id: "user-001",
  username: "alice",
  role: "member" as const,
  status: "pending" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use("/api/admin/users", adminUsersRouter)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/admin/users", () => {
  it("admin 用户应能获取用户列表（不含密码哈希）", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockResolvedValue({
      userId: "admin-001",
      role: "admin",
    })
    vi.mocked(queries.listUsers).mockResolvedValue([
      { ...mockAdmin, passwordHash: "hash1" },
      { ...mockMember, passwordHash: "hash2" },
    ] as any)

    const res = await request(buildApp())
      .get("/api/admin/users")
      .set("Authorization", "Bearer admin-token")

    expect(res.status).toBe(200)
    expect(res.body.users).toHaveLength(2)
    expect(res.body.users[0].passwordHash).toBeUndefined()
  })

  it("非 admin 用户应返回 403", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockResolvedValue({
      userId: "user-001",
      role: "member",
    })

    const res = await request(buildApp())
      .get("/api/admin/users")
      .set("Authorization", "Bearer member-token")

    expect(res.status).toBe(403)
  })

  it("未认证请求应返回 401", async () => {
    const res = await request(buildApp()).get("/api/admin/users")
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("PATCH /api/admin/users/:id/status", () => {
  it("admin 应能将 pending 用户审批为 active", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockResolvedValue({
      userId: "admin-001",
      role: "admin",
    })
    vi.mocked(queries.updateUser).mockResolvedValue({
      ...mockMember,
      passwordHash: "hash",
      status: "active",
    })

    const res = await request(buildApp())
      .patch("/api/admin/users/user-001/status")
      .set("Authorization", "Bearer admin-token")
      .send({ status: "active" })

    expect(res.status).toBe(200)
    expect(res.body.user.status).toBe("active")
    expect(res.body.user.passwordHash).toBeUndefined()
  })

  it("无效的 status 值应返回 400", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockResolvedValue({
      userId: "admin-001",
      role: "admin",
    })

    const res = await request(buildApp())
      .patch("/api/admin/users/user-001/status")
      .set("Authorization", "Bearer admin-token")
      .send({ status: "invalid-status" })

    expect(res.status).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("PATCH /api/admin/users/:id/role", () => {
  it("admin 应能将成员提升为 admin", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockResolvedValue({
      userId: "admin-001",
      role: "admin",
    })
    vi.mocked(queries.updateUser).mockResolvedValue({
      ...mockMember,
      passwordHash: "hash",
      role: "admin",
      status: "active",
    })

    const res = await request(buildApp())
      .patch("/api/admin/users/user-001/role")
      .set("Authorization", "Bearer admin-token")
      .send({ role: "admin" })

    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe("admin")
  })

  it("无效的 role 值应返回 400", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockResolvedValue({
      userId: "admin-001",
      role: "admin",
    })

    const res = await request(buildApp())
      .patch("/api/admin/users/user-001/role")
      .set("Authorization", "Bearer admin-token")
      .send({ role: "superuser" })

    expect(res.status).toBe(400)
  })
})
