import { cpSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")
const src = resolve(root, "node_modules/vditor/dist")
const dest = resolve(root, "public/vditor/dist")

if (!existsSync(src)) {
  console.warn("[sync-vditor] vditor/dist not found, skipping.")
  process.exit(0)
}

cpSync(src, dest, { recursive: true })
console.log("[sync-vditor] Copied vditor/dist → public/vditor/dist/")
