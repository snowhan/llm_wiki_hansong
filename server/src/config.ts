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
  /** Bearer token required for all /api/* requests. If empty, authentication is disabled (dev only). */
  accessToken: process.env.ACCESS_TOKEN ?? "",
  /** Admin token required for /api/admin/* requests. Defaults to accessToken if not set. */
  get adminToken() {
    return process.env.ADMIN_TOKEN ?? this.accessToken
  },
  /** WPS AI Gateway – read from VITE_WPS_GATEWAY_* env vars as fallback */
  wpsGateway: {
    url: process.env.WPS_GATEWAY_URL ?? process.env.VITE_WPS_GATEWAY_URL ?? "",
    token: process.env.WPS_GATEWAY_TOKEN ?? process.env.VITE_WPS_GATEWAY_TOKEN ?? "",
    uid: process.env.WPS_GATEWAY_UID ?? process.env.VITE_WPS_GATEWAY_UID ?? "",
    productName: process.env.WPS_GATEWAY_PRODUCT_NAME ?? process.env.VITE_WPS_GATEWAY_PRODUCT_NAME ?? "",
    model: process.env.WPS_GATEWAY_MODEL ?? process.env.VITE_WPS_GATEWAY_MODEL ?? "azure/gpt-5.4",
  },
}

if (!config.accessToken) {
  console.warn(
    "[llm-wiki-server] WARNING: ACCESS_TOKEN is not set. " +
    "All API endpoints are publicly accessible. " +
    "Set ACCESS_TOKEN in your environment or .env file for production use.",
  )
}
