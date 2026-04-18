/**
 * Normalize a path to use forward slashes (works on both macOS and Windows).
 * Windows APIs accept forward slashes, so normalizing to / is safe everywhere.
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/")
}

/**
 * Join path segments with forward slashes.
 */
export function joinPath(...segments: string[]): string {
  return segments
    .map((s) => s.replace(/\\/g, "/"))
    .join("/")
    .replace(/\/+/g, "/")
}

/**
 * Get the filename from a path (handles both / and \).
 */
export function getFileName(p: string): string {
  const normalized = p.replace(/\\/g, "/")
  return normalized.split("/").pop() ?? p
}

/**
 * Get the file stem (filename without extension).
 */
export function getFileStem(p: string): string {
  const name = getFileName(p)
  const lastDot = name.lastIndexOf(".")
  return lastDot > 0 ? name.slice(0, lastDot) : name
}

/**
 * Split YAML frontmatter from markdown body.
 * Handles:
 *   - LF (\n) and CRLF (\r\n) line endings
 *   - Optional trailing whitespace on the --- delimiters
 *   - Missing closing --- (YAML-like lines at the start followed by a blank line)
 * Returns { frontmatter, body } where frontmatter includes the delimiter lines.
 */
export function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  if (!content) return { frontmatter: "", body: "" }

  // Normalize CRLF → LF for matching, keep track of offset in original
  const normalized = content.replace(/\r\n/g, "\n")

  // Case 1: standard --- delimited frontmatter (with optional trailing spaces on ---)
  const closed = normalized.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(\n|$)/)
  if (closed) {
    const len = closed[0].length
    // Re-map length back to original (CRLF adds 1 byte per \n replaced)
    // Use normalized offsets since we'll work with normalized content
    return { frontmatter: closed[0], body: normalized.slice(len) }
  }

  // Case 2: unclosed frontmatter – YAML-like key:value lines at start, optionally followed by blank line
  // Requires at least 2 consecutive YAML lines to avoid false positives on regular markdown
  const unclosed = normalized.match(/^((?:[a-z_][a-z0-9_]*[ \t]*:[ \t]*[^\n]*\n){2,})/)
  if (unclosed) {
    const rawYaml = unclosed[1]
    const len = rawYaml.length
    // Skip optional blank line(s) separator between frontmatter and body
    const rest = normalized.slice(len).replace(/^\n+/, "")
    const synth = `---\n${rawYaml}---\n`
    return { frontmatter: synth, body: rest }
  }

  return { frontmatter: "", body: normalized }
}

/**
 * Get relative path from base.
 */
export function getRelativePath(fullPath: string, basePath: string): string {
  const normalFull = normalizePath(fullPath)
  const normalBase = normalizePath(basePath).replace(/\/$/, "")
  if (normalFull.startsWith(normalBase + "/")) {
    return normalFull.slice(normalBase.length + 1)
  }
  return normalFull
}
