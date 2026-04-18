import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

export interface PreprocessProgress {
  stage: string
  progress: number
  done?: boolean
  content?: string
  error?: string
}

/** Candidate locations where markitdown CLI might live. */
const MARKITDOWN_CANDIDATES = [
  "markitdown", // in PATH
  path.join(os.homedir(), "Library/Python/3.12/bin/markitdown"),
  path.join(os.homedir(), "Library/Python/3.11/bin/markitdown"),
  path.join(os.homedir(), "Library/Python/3.10/bin/markitdown"),
  path.join(os.homedir(), ".local/bin/markitdown"),
  "/opt/homebrew/bin/markitdown",
  "/usr/local/bin/markitdown",
]

/**
 * Find the markitdown executable. Returns the path string if found, null otherwise.
 */
async function findMarkitdown(): Promise<string | null> {
  for (const candidate of MARKITDOWN_CANDIDATES) {
    const found = await new Promise<boolean>((resolve) => {
      const proc = spawn(candidate, ["--help"], { stdio: "pipe" })
      proc.on("error", () => resolve(false))
      proc.on("close", (code) => resolve(code === 0 || code === 1))
    })
    if (found) return candidate
  }
  return null
}

let _markitdownPath: string | null | undefined = undefined

/**
 * Check if markitdown Python CLI is available (cached after first check).
 */
export async function checkMarkitdown(): Promise<boolean> {
  if (_markitdownPath === undefined) {
    _markitdownPath = await findMarkitdown()
  }
  return _markitdownPath !== null
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

  try {
    const cached = await fs.readFile(cachePath, "utf-8")
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

  if (_markitdownPath === undefined) {
    _markitdownPath = await findMarkitdown()
  }
  const markitdownBin = _markitdownPath
  if (!markitdownBin) {
    const fallback = `[Binary file: ${path.basename(filePath)}]\n\n(markitdown is not installed; install it with: pip install markitdown)`
    try { await fs.writeFile(cachePath, fallback, "utf-8") } catch { /* non-critical */ }
    onProgress({ stage: "done", progress: 1, done: true, content: fallback })
    return fallback
  }

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(markitdownBin, [filePath], { stdio: ["pipe", "pipe", "pipe"] })
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
        const error = `markitdown failed (code ${code}): ${stderr}`
        onProgress({ stage: "error", progress: 1, done: true, error })
        reject(new Error(error))
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
      reject(err)
    })
  })
}
