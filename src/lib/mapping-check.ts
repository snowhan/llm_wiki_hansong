/**
 * Mapping risk detection utility.
 *
 * Checks whether a generated wiki file's path type (entity vs concept)
 * matches its frontmatter `type` field.
 */

export type RiskLevel = "high" | "ok"

export interface MappingRisk {
  riskLevel: RiskLevel
  reason?: string
}

export type PathType = "entity" | "concept" | "other"

/** Derive the expected type from the file path. */
export function getPathType(filePath: string): PathType {
  if (filePath.includes("/entities/")) return "entity"
  if (filePath.includes("/concepts/")) return "concept"
  return "other"
}

/**
 * Check whether the frontmatter `type` is consistent with the file path.
 *
 * Rules:
 *  - /entities/ path + frontmatter type === "concept"  → HIGH risk
 *  - /concepts/ path + frontmatter type === "entity"   → HIGH risk
 *  - All other combinations                            → OK
 */
export function checkMappingRisk(filePath: string, frontmatterType: string): MappingRisk {
  const pathType = getPathType(filePath)

  if (pathType === "entity" && frontmatterType === "concept") {
    return {
      riskLevel: "high",
      reason: "路径为 /entities/ 但 frontmatter type 是 concept",
    }
  }

  if (pathType === "concept" && frontmatterType === "entity") {
    return {
      riskLevel: "high",
      reason: "路径为 /concepts/ 但 frontmatter type 是 entity",
    }
  }

  return { riskLevel: "ok" }
}

/**
 * Parse frontmatter fields (type and title) from raw markdown content.
 * Returns empty strings if frontmatter is missing or malformed.
 */
export function parseFrontmatterFields(content: string): { type: string; title: string } {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fmMatch) return { type: "", title: "" }

  const fm = fmMatch[1]
  const typeMatch = fm.match(/^type:\s*(.+)$/m)
  const titleMatch = fm.match(/^title:\s*["']?(.+?)["']?\s*$/m)

  return {
    type: typeMatch?.[1]?.trim() ?? "",
    title: titleMatch?.[1]?.trim() ?? "",
  }
}

/**
 * Extract a preview of the body content (after frontmatter), up to maxLen chars.
 */
export function extractContentPreview(content: string, maxLen = 150): string {
  const afterFm = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "").trim()
  if (afterFm.length <= maxLen) return afterFm
  return afterFm.slice(0, maxLen) + "…"
}
