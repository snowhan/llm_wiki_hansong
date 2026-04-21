/**
 * Run database migrations on startup.
 * Uses raw SQL to avoid drizzle-kit dependency at runtime.
 */
import { Pool } from "pg"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const MIGRATIONS = [
  { file: "0001_create_auth_tables.sql", label: "Auth tables ready" },
  { file: "0002_create_app_settings.sql", label: "App settings table ready" },
]

export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.warn("[migrate] DATABASE_URL not set, skipping migrations")
    return
  }

  const pool = new Pool({ connectionString: databaseUrl })
  try {
    for (const migration of MIGRATIONS) {
      const sqlPath = path.join(__dirname, "migrations", migration.file)
      const sql = readFileSync(sqlPath, "utf-8")
      await pool.query(sql)
      console.log(`[migrate] ${migration.label}`)
    }
  } catch (err) {
    console.error("[migrate] Migration failed:", err)
    throw err
  } finally {
    await pool.end()
  }
}
