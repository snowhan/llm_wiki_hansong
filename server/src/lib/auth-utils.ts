import bcrypt from "bcryptjs"
import { SignJWT, jwtVerify } from "jose"
import { createHash, randomBytes } from "node:crypto"

export type UserRole = "member" | "admin"

export interface JwtPayload {
  userId: string
  role: UserRole
}

// ── Password hashing ──────────────────────────────────────────────────────────

export async function hashPassword(password: string, rounds = 12): Promise<string> {
  return bcrypt.hash(password, rounds)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password) return false
  return bcrypt.compare(password, hash)
}

// ── JWT ───────────────────────────────────────────────────────────────────────

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

export async function signAccessToken(
  payload: JwtPayload,
  secret: string,
  expiresIn: string,
): Promise<string> {
  return new SignJWT({ userId: payload.userId, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey(secret))
}

export async function verifyAccessToken(token: string, secret: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secretKey(secret))
  return {
    userId: payload.userId as string,
    role: payload.role as UserRole,
  }
}

// ── Refresh token ─────────────────────────────────────────────────────────────

export function generateRefreshToken(): string {
  return randomBytes(48).toString("hex")
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}
