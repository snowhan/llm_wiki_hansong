import { eq, count } from "drizzle-orm"
import { getDb } from "./client.js"
import { users, refreshTokens, type User, type RefreshToken } from "./schema.js"

export type CreateUserData = {
  username: string
  passwordHash: string
  role: "member" | "admin"
  status: "pending" | "active" | "suspended"
}

export type UpdateUserData = Partial<Pick<User, "role" | "status">>

export async function findUserByUsername(username: string): Promise<User | null> {
  const db = getDb()
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1)
  return rows[0] ?? null
}

export async function findUserById(id: string): Promise<User | null> {
  const db = getDb()
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return rows[0] ?? null
}

export async function createUser(data: CreateUserData): Promise<User> {
  const db = getDb()
  const rows = await db.insert(users).values(data).returning()
  return rows[0]!
}

export async function countUsers(): Promise<number> {
  const db = getDb()
  const result = await db.select({ value: count() }).from(users)
  return result[0]?.value ?? 0
}

export async function listUsers(): Promise<User[]> {
  const db = getDb()
  return db.select().from(users).orderBy(users.createdAt)
}

export async function updateUser(id: string, data: UpdateUserData): Promise<User> {
  const db = getDb()
  const rows = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning()
  if (!rows[0]) throw new Error(`User ${id} not found`)
  return rows[0]
}

export async function findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
  const db = getDb()
  const rows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1)
  return rows[0] ?? null
}

export async function createRefreshToken(data: {
  userId: string
  tokenHash: string
  expiresAt: Date
}): Promise<void> {
  const db = getDb()
  await db.insert(refreshTokens).values(data)
}

export async function deleteRefreshToken(tokenHash: string): Promise<void> {
  const db = getDb()
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash))
}

export async function deleteExpiredRefreshTokens(): Promise<void> {
  const db = getDb()
  const now = new Date()
  await db.delete(refreshTokens).where(eq(refreshTokens.expiresAt, now))
}
