import fs from "node:fs/promises"
import { eq } from "drizzle-orm"
import { getDb } from "../db/client.js"
import { appSettings } from "../db/schema.js"
import { config } from "../config.js"

// ── PostgreSQL-backed key-value state ─────────────────────────────────────────

export async function getState(key: string): Promise<unknown> {
  if (!process.env.DATABASE_URL) return getFileFallback(key)
  try {
    const db = getDb()
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
    return rows[0]?.value ?? null
  } catch {
    return getFileFallback(key)
  }
}

export async function setState(key: string, value: unknown): Promise<void> {
  if (!process.env.DATABASE_URL) { await setFileFallback(key, value); return }
  try {
    const db = getDb()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonValue = value as any
    await db
      .insert(appSettings)
      .values({ key, value: jsonValue, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: jsonValue, updatedAt: new Date() },
      })
  } catch {
    await setFileFallback(key, value)
  }
}

// ── One-time migration from app-state.json → PostgreSQL ──────────────────────
// Called once after migrations run. Reads the legacy JSON file and upserts each
// key into app_settings. Leaves the file in place as a backup.

export async function migrateFileStateToDb(): Promise<void> {
  if (!process.env.DATABASE_URL) return
  try {
    const raw = await fs.readFile(config.appStatePath, "utf-8")
    const legacy = JSON.parse(raw) as Record<string, unknown>
    const keys = Object.keys(legacy)
    if (keys.length === 0) return

    const db = getDb()
    // Only migrate keys not yet present in the DB (non-destructive)
    for (const key of keys) {
      const existing = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
      if (existing.length === 0 && legacy[key] !== null && legacy[key] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.insert(appSettings).values({ key, value: legacy[key] as any })
      }
    }
    console.log(`[state] Migrated ${keys.length} key(s) from app-state.json → PostgreSQL`)
  } catch {
    // File doesn't exist or is invalid — nothing to migrate
  }
}

// ── File-based fallback (dev / no-DB environments) ───────────────────────────

let fileCache: Record<string, unknown> | null = null

async function ensureDir() {
  const nodePath = await import("node:path")
  await fs.mkdir(nodePath.dirname(config.appStatePath), { recursive: true })
}

async function loadFile(): Promise<Record<string, unknown>> {
  if (fileCache) return fileCache
  try {
    const raw = await fs.readFile(config.appStatePath, "utf-8")
    fileCache = JSON.parse(raw) as Record<string, unknown>
  } catch {
    fileCache = {}
  }
  return fileCache
}

async function saveFile() {
  await ensureDir()
  await fs.writeFile(config.appStatePath, JSON.stringify(fileCache, null, 2), "utf-8")
}

async function getFileFallback(key: string): Promise<unknown> {
  const state = await loadFile()
  return state[key] ?? null
}

async function setFileFallback(key: string, value: unknown): Promise<void> {
  const state = await loadFile()
  state[key] = value
  await saveFile()
}
