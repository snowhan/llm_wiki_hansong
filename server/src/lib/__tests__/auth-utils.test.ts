/**
 * TDD tests for auth utility functions (pure, no DB dependency).
 * RED phase: these tests define the expected API contract for auth-utils.ts
 */
import { describe, it, expect } from "vitest"
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
  type JwtPayload,
} from "../auth-utils.js"

const TEST_SECRET = "test-jwt-secret-at-least-32-chars-long!!"

describe("hashPassword / verifyPassword", () => {
  it("应当对密码进行哈希处理，哈希值不等于原密码", async () => {
    const hash = await hashPassword("StrongPass123!", 4)
    expect(hash).not.toBe("StrongPass123!")
    expect(hash.length).toBeGreaterThan(20)
  })

  it("应当能正确验证匹配的密码", async () => {
    const hash = await hashPassword("MyPassword!99", 4)
    const result = await verifyPassword("MyPassword!99", hash)
    expect(result).toBe(true)
  })

  it("错误密码验证应返回 false", async () => {
    const hash = await hashPassword("correct-password", 4)
    const result = await verifyPassword("wrong-password", hash)
    expect(result).toBe(false)
  })

  it("空字符串密码不应通过正确密码验证", async () => {
    const hash = await hashPassword("real-password", 4)
    const result = await verifyPassword("", hash)
    expect(result).toBe(false)
  })
})

describe("signAccessToken / verifyAccessToken", () => {
  it("应当签发并成功验证 access token", async () => {
    const payload: JwtPayload = { userId: "user-001", role: "member" }
    const token = await signAccessToken(payload, TEST_SECRET, "15m")
    expect(typeof token).toBe("string")
    expect(token.split(".").length).toBe(3) // JWT 结构验证
    const decoded = await verifyAccessToken(token, TEST_SECRET)
    expect(decoded.userId).toBe("user-001")
    expect(decoded.role).toBe("member")
  })

  it("admin 角色应当被正确编码到 token 中", async () => {
    const token = await signAccessToken({ userId: "admin-1", role: "admin" }, TEST_SECRET, "15m")
    const decoded = await verifyAccessToken(token, TEST_SECRET)
    expect(decoded.role).toBe("admin")
  })

  it("使用错误密钥验证应抛出异常", async () => {
    const token = await signAccessToken({ userId: "u1", role: "member" }, TEST_SECRET, "15m")
    await expect(verifyAccessToken(token, "wrong-secret-key-32-chars-padding!!")).rejects.toThrow()
  })

  it("篡改 token 内容应抛出异常", async () => {
    const token = await signAccessToken({ userId: "u1", role: "member" }, TEST_SECRET, "15m")
    const [h, , s] = token.split(".")
    const tampered = `${h}.eyJ1c2VySWQiOiJoYWNrZXIifQ.${s}`
    await expect(verifyAccessToken(tampered, TEST_SECRET)).rejects.toThrow()
  })
})

describe("generateRefreshToken", () => {
  it("应当返回字符串", () => {
    const token = generateRefreshToken()
    expect(typeof token).toBe("string")
  })

  it("应当返回足够长的随机字符串（>=32字符）", () => {
    const token = generateRefreshToken()
    expect(token.length).toBeGreaterThanOrEqual(32)
  })

  it("每次调用应返回不同的 token", () => {
    const tokens = new Set(Array.from({ length: 10 }, generateRefreshToken))
    expect(tokens.size).toBe(10)
  })
})

describe("hashToken", () => {
  it("相同输入应返回相同哈希", () => {
    const h1 = hashToken("my-refresh-token")
    const h2 = hashToken("my-refresh-token")
    expect(h1).toBe(h2)
  })

  it("哈希值不应等于原始 token", () => {
    const raw = "my-refresh-token"
    expect(hashToken(raw)).not.toBe(raw)
  })

  it("不同 token 应返回不同哈希", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"))
  })
})
