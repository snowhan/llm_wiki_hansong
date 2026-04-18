/**
 * Parses the YAML-like inner content of a markdown frontmatter block into
 * a flat key-value / key-array record.
 *
 * Accepts the raw output of `splitFrontmatter` (i.e. the string still wrapped
 * in `---` delimiters).  Handles:
 *   - String values (with optional surrounding quotes stripped)
 *   - Array values in the form `[a, b, c]` or `[]`
 *   - Key-only lines with no value (e.g. `key:`)
 *   - Values that contain colons (e.g. URLs, timestamps)
 */
export interface FrontmatterFields {
  type?: string
  title?: string
  created?: string
  updated?: string
  tags?: string[]
  related?: string[]
  sources?: string[]
  [key: string]: string | string[] | undefined
}

export function parseFrontmatter(frontmatter: string): FrontmatterFields {
  if (!frontmatter) return {}
  const inner = frontmatter.replace(/^---\n/, "").replace(/\n---\n?$/, "")
  const result: FrontmatterFields = {}
  for (const line of inner.split("\n")) {
    // Split on FIRST ": " (colon + space) so values containing colons are preserved
    const sepIdx = line.indexOf(": ")
    if (sepIdx < 0) {
      // Handle key-only lines with no value (e.g. `key:`)
      const colonIdx = line.indexOf(":")
      if (colonIdx > 0 && colonIdx === line.length - 1) {
        const key = line.slice(0, colonIdx).trim()
        if (key) result[key] = ""
      }
      continue
    }
    const key = line.slice(0, sepIdx).trim()
    const rawVal = line.slice(sepIdx + 2).trim()  // skip ": "
    // Array: [a, b, c] or []
    if (rawVal === "[]") {
      result[key] = []
    } else {
      const arrMatch = rawVal.match(/^\[(.+)\]$/)
      if (arrMatch) {
        result[key] = arrMatch[1]
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean)
      } else {
        result[key] = rawVal.replace(/^["']|["']$/g, "")
      }
    }
  }
  return result
}
