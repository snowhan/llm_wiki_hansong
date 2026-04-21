/**
 * TDD tests for /api/auth/* routes using supertest.
 * auth-service is fully mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

// ── Mock auth-service ────────────────────────────────────────────────────────
vi.mock("../../services/auth-service.js", () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  refreshAccessToken: vi.fn(),
  logoutUser: vi.fn(),
  getMe: vi.fn(),
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
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  signAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  hashToken: vi.fn(),
}))

import cookieParser from "cookie-parser"
import * as authService from "../../services/auth-service.js"
import * as authUtils from "../../lib/auth-utils.js"
import authRouter from "../auth.js"

const mockUser = {
  id: "user-001",
  username: "alice",
  role: "member" as const,
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use("/api/auth", authRouter)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/auth/register", () => {
  it("注册成功应返回 201 和用户信息", async () => {
    vi.mocked(authService.registerUser).mockResolvedValue({ user: mockUser })

    const res = await request(buildApp())
      .post("/api/auth/register")
      .send({ username: "alice", password: "Password123!" })

    expect(res.status).toBe(201)
    expect(res.body.user.username).toBe("alice")
    expect(res.body.user.passwordHash).toBeUndefined()
  })

  it("缺少 username 应返回 400", async () => {
    const res = await request(buildApp())
      .post("/api/auth/register")
      .send({ password: "Password123!" })

    expect(res.status).toBe(400)
  })

  it("用户名已存在应返回 409", async () => {
    vi.mocked(authService.registerUser).mockRejectedValue(
      Object.assign(new Error("Username already exists"), { statusCode: 409 }),
    )

    const res = await request(buildApp())
      .post("/api/auth/register")
      .send({ username: "alice", password: "Password123!" })

    expect(res.status).toBe(409)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  it("登录成功应返回 accessToken 并设置 refreshToken cookie", async () => {
    vi.mocked(authService.loginUser).mockResolvedValue({
      user: mockUser,
      accessToken: "access-token-xyz",
      refreshToken: "refresh-token-abc",
    })

    const res = await request(buildApp())
      .post("/api/auth/login")
      .send({ username: "alice", password: "Password123!" })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe("access-token-xyz")
    expect(res.body.user.username).toBe("alice")
    const setCookie = res.headers["set-cookie"] as unknown as string[]
    expect(setCookie?.some((c: string) => c.includes("refresh_token"))).toBe(true)
    expect(setCookie?.some((c: string) => c.includes("HttpOnly"))).toBe(true)
  })

  it("凭据错误应返回 401", async () => {
    vi.mocked(authService.loginUser).mockRejectedValue(
      Object.assign(new Error("Invalid credentials"), { statusCode: 401 }),
    )

    const res = await request(buildApp())
      .post("/api/auth/login")
      .send({ username: "alice", password: "wrong" })

    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/auth/refresh", () => {
  it("有效 refresh token cookie 应返回新的 accessToken", async () => {
    vi.mocked(authService.refreshAccessToken).mockResolvedValue({
      accessToken: "new-access-token",
      newRefreshToken: "new-refresh-token",
    })

    const res = await request(buildApp())
      .post("/api/auth/refresh")
      .set("Cookie", "refresh_token=valid-refresh-token")

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe("new-access-token")
  })

  it("缺少 refresh token cookie 应返回 204（静默无操作）", async () => {
    const res = await request(buildApp()).post("/api/auth/refresh")
    expect(res.status).toBe(204)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/auth/logout", () => {
  it("登出应清除 cookie 并返回 204", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockResolvedValue({
      userId: "user-001",
      role: "member",
    })
    vi.mocked(authService.logoutUser).mockResolvedValue(undefined)

    const res = await request(buildApp())
      .post("/api/auth/logout")
      .set("Authorization", "Bearer valid-token")
      .set("Cookie", "refresh_token=some-token")

    expect(res.status).toBe(204)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/auth/me", () => {
  it("有效 token 应返回用户信息", async () => {
    vi.mocked(authUtils.verifyAccessToken).mockResolvedValue({
      userId: "user-001",
      role: "member",
    })
    vi.mocked(authService.getMe).mockResolvedValue(mockUser)

    const res = await request(buildApp())
      .get("/api/auth/me")
      .set("Authorization", "Bearer valid-token")

    expect(res.status).toBe(200)
    expect(res.body.username).toBe("alice")
  })

  it("无 token 应返回 401", async () => {
    const res = await request(buildApp()).get("/api/auth/me")
    expect(res.status).toBe(401)
  })
})
