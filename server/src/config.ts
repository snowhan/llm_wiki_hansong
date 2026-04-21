import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import { readFileSync } from "node:fs"

// Load .env from workspace root (one level up from server/)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, "../../.env")
try {
  const lines = readFileSync(envPath, "utf-8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (key && !(key in process.env)) process.env[key] = val
  }
} catch {
  // .env not found — ignore
}

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  projectsRoot: process.env.PROJECTS_ROOT ?? path.join(os.homedir(), "llm-wiki-projects"),
  appStatePath: process.env.APP_STATE_PATH ?? path.join(os.homedir(), ".llm-wiki", "app-state.json"),
  uploadSizeLimit: parseInt(process.env.UPLOAD_SIZE_LIMIT ?? "104857600", 10), // 100MB
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  /** PostgreSQL connection string */
  databaseUrl: process.env.DATABASE_URL ?? "",
  /** JWT secret for signing access tokens. Must be set in production. */
  jwtSecret: process.env.JWT_SECRET ?? "dev-insecure-secret-change-in-production-32chars",
  /** Access token lifetime (jose format, e.g. '15m', '1h') */
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  /** Refresh token lifetime in days */
  jwtRefreshExpiresInDays: parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS ?? "30", 10),
  /** bcrypt rounds for password hashing (lower = faster, use 4 in tests) */
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10),
  /** WPS AI Gateway – read from VITE_WPS_GATEWAY_* env vars as fallback */
  wpsGateway: {
    url: process.env.WPS_GATEWAY_URL ?? process.env.VITE_WPS_GATEWAY_URL ?? "",
    token: process.env.WPS_GATEWAY_TOKEN ?? process.env.VITE_WPS_GATEWAY_TOKEN ?? "",
    uid: process.env.WPS_GATEWAY_UID ?? process.env.VITE_WPS_GATEWAY_UID ?? "",
    productName: process.env.WPS_GATEWAY_PRODUCT_NAME ?? process.env.VITE_WPS_GATEWAY_PRODUCT_NAME ?? "",
    model: process.env.WPS_GATEWAY_MODEL ?? process.env.VITE_WPS_GATEWAY_MODEL ?? "azure/gpt-5.4",
  },
}

if (!process.env.JWT_SECRET) {
  console.warn(
    "[llm-wiki-server] WARNING: JWT_SECRET is not set. " +
    "Using insecure default. Set JWT_SECRET in your environment for production.",
  )
}
if (!config.databaseUrl) {
  console.warn(
    "[llm-wiki-server] WARNING: DATABASE_URL is not set. " +
    "PostgreSQL features (auth) will not be available.",
  )
}
