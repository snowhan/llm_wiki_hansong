import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

// ── Vision helpers ────────────────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
}

/**
 * Read an image file and return a data URI string suitable for multimodal LLM messages.
 * Format: "data:<mime>;base64,<base64data>"
 */
export async function readImageAsBase64DataUri(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase().replace(".", "")
  const mime = MIME_MAP[ext] ?? "image/png"
  const data = await fs.readFile(filePath)
  return `data:${mime};base64,${data.toString("base64")}`
}

/**
 * Returns the directory where embedded images extracted from a document are stored.
 * e.g. "/project/paper.pdf" → "/project/paper.pdf.images"
 */
export function getEmbeddedImageDir(sourceFilePath: string): string {
  return sourceFilePath + ".images"
}

/** Path to the Python image extraction script. */
const EXTRACT_IMAGES_SCRIPT = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "../../../scripts/extract_images.py",
)

/**
 * Extract embedded images from a PDF/DOCX/PPTX file using the Python script.
 * Returns the list of extracted image file paths (absolute).
 * Results are cached in a <file>.images/ directory — won't re-extract if already done.
 */
export async function extractEmbeddedImages(filePath: string): Promise<string[]> {
  const outputDir = getEmbeddedImageDir(filePath)

  // Return cached results if dir already exists and is non-empty
  try {
    const entries = await fs.readdir(outputDir)
    const images = entries
      .filter((e) => /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(e))
      .map((e) => path.join(outputDir, e))
      .sort()
    if (images.length > 0) return images
  } catch { /* dir doesn't exist yet */ }

  // Run Python extraction script
  return new Promise((resolve) => {
    const proc = spawn("python3", [EXTRACT_IMAGES_SCRIPT, filePath, outputDir], {
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
    proc.on("close", () => {
      try {
        const result = JSON.parse(stdout) as { images: string[]; error: string | null }
        if (result.error) {
          console.warn(`[preprocess] Image extraction warning: ${result.error}`)
        }
        resolve(result.images ?? [])
      } catch {
        resolve([])
      }
    })
    proc.on("error", () => resolve([]))
  })
}

export interface PreprocessProgress {
  stage: string
  progress: number
  done?: boolean
  content?: string
  error?: string
}

interface MarkitdownCommand {
  command: string
  argsPrefix: string[]
  label: string
}

/** Candidate commands where markitdown might be available. */
const MARKITDOWN_CANDIDATES: MarkitdownCommand[] = [
  { command: "markitdown", argsPrefix: [], label: "markitdown" }, // in PATH
  // Docker venv (installed via requirements.txt in /opt/venv)
  { command: "/opt/venv/bin/markitdown", argsPrefix: [], label: "/opt/venv/bin/markitdown" },
  {
    command: path.join(os.homedir(), "Library/Python/3.12/bin/markitdown"),
    argsPrefix: [],
    label: "~/Library/Python/3.12/bin/markitdown",
  },
  {
    command: path.join(os.homedir(), "Library/Python/3.11/bin/markitdown"),
    argsPrefix: [],
    label: "~/Library/Python/3.11/bin/markitdown",
  },
  {
    command: path.join(os.homedir(), "Library/Python/3.10/bin/markitdown"),
    argsPrefix: [],
    label: "~/Library/Python/3.10/bin/markitdown",
  },
  {
    command: path.join(os.homedir(), ".local/bin/markitdown"),
    argsPrefix: [],
    label: "~/.local/bin/markitdown",
  },
  { command: "/opt/homebrew/bin/markitdown", argsPrefix: [], label: "/opt/homebrew/bin/markitdown" },
  { command: "/usr/local/bin/markitdown", argsPrefix: [], label: "/usr/local/bin/markitdown" },
  // Fallback: module invocation works even when the CLI script is not on PATH.
  { command: "/opt/venv/bin/python3", argsPrefix: ["-m", "markitdown"], label: "/opt/venv/bin/python3 -m markitdown" },
  { command: "python3", argsPrefix: ["-m", "markitdown"], label: "python3 -m markitdown" },
]

/**
 * Find a runnable markitdown command. Returns null when unavailable.
 */
async function findMarkitdown(): Promise<MarkitdownCommand | null> {
  for (const candidate of MARKITDOWN_CANDIDATES) {
    const found = await new Promise<boolean>((resolve) => {
      const proc = spawn(candidate.command, [...candidate.argsPrefix, "--help"], { stdio: "pipe" })
      proc.on("error", () => resolve(false))
      proc.on("close", (code) => resolve(code === 0 || code === 1))
    })
    if (found) return candidate
  }
  return null
}

let _markitdownCommand: MarkitdownCommand | null | undefined = undefined

/**
 * Check if markitdown Python CLI is available (cached after first check).
 */
export async function checkMarkitdown(): Promise<boolean> {
  if (_markitdownCommand === undefined) {
    _markitdownCommand = await findMarkitdown()
  }
  return _markitdownCommand !== null
}

/**
 * Preprocess a file using markitdown CLI.
 * Yields progress events as the file is processed.
 */
export async function preprocessFile(
  filePath: string,
  onProgress: (event: PreprocessProgress) => void,
): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  const cachePath = filePath + ".cache.txt"
  const isFallbackCache = (content: string) =>
    content.startsWith("[Binary file:") && content.includes("markitdown is not installed")

  try {
    const cached = await fs.readFile(cachePath, "utf-8")
    // A previous fallback cache means extraction never succeeded; retry with current environment.
    if (isFallbackCache(cached)) throw new Error("stale fallback cache")
    onProgress({ stage: "cached", progress: 1, done: true, content: cached })
    return cached
  } catch { /* no cache */ }

  const textExts = new Set([".txt", ".md", ".json", ".csv", ".tsv", ".xml", ".html", ".htm", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".log", ".js", ".ts", ".py", ".java", ".c", ".cpp", ".h", ".rs", ".go", ".rb", ".sh", ".bat", ".ps1", ".css", ".scss", ".sql"])

  if (textExts.has(ext)) {
    onProgress({ stage: "reading", progress: 0.5 })
    const content = await fs.readFile(filePath, "utf-8")
    await fs.writeFile(cachePath, content, "utf-8")
    onProgress({ stage: "done", progress: 1, done: true, content })
    return content
  }

  onProgress({ stage: "extracting", progress: 0.1 })

  if (_markitdownCommand === undefined) {
    _markitdownCommand = await findMarkitdown()
  }
  const markitdownCommand = _markitdownCommand
  if (!markitdownCommand) {
    const fallback = `[Binary file: ${path.basename(filePath)}]\n\n(markitdown is not installed; install it with: pip install markitdown)`
    try { await fs.writeFile(cachePath, fallback, "utf-8") } catch { /* non-critical */ }
    onProgress({ stage: "done", progress: 1, done: true, content: fallback })
    return fallback
  }

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(markitdownCommand.command, [...markitdownCommand.argsPrefix, filePath], { stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
      onProgress({ stage: "extracting", progress: 0.5 })
    })
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    proc.on("close", async (code) => {
      if (code !== 0) {
        const errMsg = `markitdown failed via ${markitdownCommand.label} (code ${code}): ${stderr}`
        onProgress({ stage: "error", progress: 1, done: true, error: errMsg })
        // Resolve with an empty string so the SSE stream closes cleanly.
        // The caller receives the error via the onProgress "error" event;
        // rejecting here would propagate to the route and cause a second
        // response write → ERR_INCOMPLETE_CHUNKED_ENCODING.
        resolve("")
        return
      }
      try {
        await fs.writeFile(cachePath, stdout, "utf-8")
      } catch { /* cache write failure is non-critical */ }
      onProgress({ stage: "done", progress: 1, done: true, content: stdout })
      resolve(stdout)
    })
    proc.on("error", (err) => {
      onProgress({ stage: "error", progress: 1, done: true, error: err.message })
      resolve("")
    })
  })
}
