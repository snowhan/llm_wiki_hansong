/**
 * Run database migrations on startup.
 * Uses raw SQL to avoid drizzle-kit dependency at runtime.
 */
import { Pool } from "pg"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.warn("[migrate] DATABASE_URL not set, skipping migrations")
    return
  }

  const pool = new Pool({ connectionString: databaseUrl })
  try {
    const sqlPath = path.join(__dirname, "migrations", "0001_create_auth_tables.sql")
    const sql = readFileSync(sqlPath, "utf-8")
    await pool.query(sql)
    console.log("[migrate] Auth tables ready")
  } catch (err) {
    console.error("[migrate] Migration failed:", err)
    throw err
  } finally {
    await pool.end()
  }
}
