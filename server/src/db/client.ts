import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema.js"

let _db: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (_db) return _db
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("[llm-wiki] DATABASE_URL is not set. Cannot connect to PostgreSQL.")
  }
  const pool = new Pool({ connectionString: databaseUrl })
  _db = drizzle(pool, { schema })
  return _db
}
