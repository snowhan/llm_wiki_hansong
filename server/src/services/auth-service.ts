import { config } from "../config.js"
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  hashToken,
} from "../lib/auth-utils.js"
import {
  findUserByUsername,
  findUserById,
  createUser,
  countUsers,
  findRefreshToken,
  createRefreshToken,
  deleteRefreshToken,
} from "../db/queries.js"
import type { User } from "../db/schema.js"

export type PublicUser = Omit<User, "passwordHash">

function toPublicUser(user: User): PublicUser {
  const { passwordHash: _, ...rest } = user
  return rest
}

class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
  ) {
    super(message)
    this.name = "AuthError"
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function registerUser(
  username: string,
  password: string,
): Promise<{ user: PublicUser }> {
  if (password.length < 8) {
    throw new AuthError("Password must be at least 8 characters", 400)
  }

  const existing = await findUserByUsername(username)
  if (existing) {
    throw new AuthError("Username already exists", 409)
  }

  const userCount = await countUsers()
  const isFirstUser = userCount === 0

  const passwordHash = await hashPassword(password, config.bcryptRounds)
  const user = await createUser({
    username,
    passwordHash,
    role: isFirstUser ? "admin" : "member",
    status: isFirstUser ? "active" : "pending",
  })

  return { user: toPublicUser(user) }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function loginUser(
  username: string,
  password: string,
): Promise<{ user: PublicUser; accessToken: string; refreshToken: string }> {
  const user = await findUserByUsername(username)

  // Constant-time check to prevent username enumeration
  const dummyHash = "$2b$04$dummyhashforpreventingtimingattacks123456"
  const isValid = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, dummyHash).then(() => false)

  if (!user || !isValid) {
    throw new AuthError("Invalid credentials", 401)
  }

  if (user.status === "pending") {
    throw new AuthError("Account pending admin approval", 403)
  }
  if (user.status === "suspended") {
    throw new AuthError("Account suspended", 403)
  }

  const accessToken = await signAccessToken(
    { userId: user.id, role: user.role as "member" | "admin" },
    config.jwtSecret,
    config.jwtAccessExpiresIn,
  )

  const rawRefreshToken = generateRefreshToken()
  const tokenHash = hashToken(rawRefreshToken)
  const expiresAt = new Date(Date.now() + config.jwtRefreshExpiresInDays * 86400_000)

  await createRefreshToken({ userId: user.id, tokenHash, expiresAt })

  return { user: toPublicUser(user), accessToken, refreshToken: rawRefreshToken }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function refreshAccessToken(
  rawToken: string,
): Promise<{ accessToken: string; newRefreshToken: string }> {
  const tokenHash = hashToken(rawToken)
  const stored = await findRefreshToken(tokenHash)

  if (!stored) {
    throw new AuthError("Invalid refresh token", 401)
  }
  if (stored.expiresAt < new Date()) {
    await deleteRefreshToken(tokenHash)
    throw new AuthError("Refresh token expired", 401)
  }

  const user = await findUserById(stored.userId)
  if (!user) {
    throw new AuthError("User not found", 401)
  }

  // Rotate refresh token
  await deleteRefreshToken(tokenHash)

  const newRawToken = generateRefreshToken()
  const newTokenHash = hashToken(newRawToken)
  const expiresAt = new Date(Date.now() + config.jwtRefreshExpiresInDays * 86400_000)
  await createRefreshToken({ userId: user.id, tokenHash: newTokenHash, expiresAt })

  const accessToken = await signAccessToken(
    { userId: user.id, role: user.role as "member" | "admin" },
    config.jwtSecret,
    config.jwtAccessExpiresIn,
  )

  return { accessToken, newRefreshToken: newRawToken }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function logoutUser(userId: string, rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken)
  await deleteRefreshToken(tokenHash)
}

// ─────────────────────────────────────────────────────────────────────────────

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await findUserById(userId)
  if (!user) {
    throw new AuthError("User not found", 404)
  }
  return toPublicUser(user)
}
