/**
 * LLM prompt builders for wiki ingestion, analysis, and maintenance tasks.
 * All functions are pure and return plain strings (or string[]).
 */

// ── Language rule ──────────────────────────────────────────────────────────

const LANGUAGE_RULE =
  "## Language Rule\n- ALWAYS match the language of the source document. " +
  "If the source is in Chinese, write in Chinese. If in English, write in English. " +
  "Wiki page titles, content, and descriptions should all be in the same language as the source material."

// ── Analysis prompt ────────────────────────────────────────────────────────

export function buildAnalysisPrompt(purpose: string, existingSourcePaths: string): string {
  return [
    "You are an expert research analyst. Read the source document and produce a structured analysis.",
    "",
    LANGUAGE_RULE,
    "",
    "Your analysis should cover:",
    "",
    "## Key Entities",
    "List people, organizations, products, datasets, tools mentioned. For each:",
    "- Name and type",
    "- Role in the source (central vs. peripheral)",
    "- Common aliases or alternative names (e.g. abbreviations, short forms)",
    "- Whether it likely already exists as a page for this source (check existing pages below)",
    "",
    "## Key Concepts",
    "List theories, methods, techniques, phenomena. For each:",
    "- Name and brief definition",
    "- Why it matters in this source",
    "- Whether it likely already exists as a page for this source",
    "",
    "## Main Arguments & Findings",
    "- What are the core claims or results?",
    "- What evidence supports them?",
    "- How strong is the evidence?",
    "",
    "## Connections to Existing Pages",
    "- What existing pages for this source does the new content relate to?",
    "- Does it strengthen, challenge, or extend existing knowledge?",
    "",
    "## Contradictions & Tensions",
    "- Are there internal tensions or caveats within this source?",
    "",
    "## Recommendations",
    "- What wiki pages should be created or updated for this source?",
    "- What should be emphasized vs. de-emphasized?",
    "- Any open questions worth flagging for the user?",
    "",
    "Be thorough but concise. Focus on what's genuinely important.",
    "",
    "If a folder context is provided, use it as a hint for categorization.",
    "",
    purpose ? `## Wiki Purpose (for context)\n${purpose}` : "",
    existingSourcePaths ? `## Existing pages for this source\n${existingSourcePaths}` : "",
  ].filter(Boolean).join("\n")
}

// ── Generation prompt ──────────────────────────────────────────────────────

export function buildGenerationPrompt(
  schema: string,
  purpose: string,
  existingSourcePaths: string,
  sourceFileName: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _overview?: string,
): string {
  const base = sourceFileName.replace(/\.[^.]+$/, "")
  return [
    "You are a wiki maintainer. Based on the analysis provided, generate wiki files.",
    "",
    LANGUAGE_RULE,
    "",
    `## IMPORTANT: Source File`,
    `The original source file is: **${sourceFileName}**`,
    `All wiki pages generated from this source MUST include this filename in their frontmatter \`sources\` field.`,
    "",
    "## Output Format",
    "",
    "Output each wiki file in this exact format:",
    "",
    "---FILE: wiki/sources/filename.md---",
    `(or: ---FILE: wiki/sources/${base}/entities/entity-name.md---)`,
    "(complete file content with YAML frontmatter)",
    "---END FILE---",
    "",
    "Generate:",
    `1. A source summary page at **wiki/sources/${base}.md** (MUST use this exact path)`,
    `2. Entity pages in **wiki/sources/${base}/entities/** for key entities identified in the analysis (MUST use this exact prefix, e.g. wiki/sources/${base}/entities/entity-name.md)`,
    `3. Concept pages in **wiki/sources/${base}/concepts/** for key concepts identified in the analysis (MUST use this exact prefix, e.g. wiki/sources/${base}/concepts/concept-name.md)`,
    "4. A log entry for wiki/log.md (just the new entry to append, format: ## [YYYY-MM-DD] ingest | Title)",
    "",
    "## Frontmatter Rules (CRITICAL)",
    "",
    "Every page MUST have YAML frontmatter with these fields:",
    "```yaml",
    "---",
    "type: source | entity | concept | comparison | query | synthesis",
    "title: Human-readable title",
    "description: \"One-sentence summary of this page (≤80 chars)\"",
    "aliases: []",
    "created: YYYY-MM-DD",
    "updated: YYYY-MM-DD",
    "tags: []",
    "related: []",
    `sources: ["${sourceFileName}"]  # MUST contain the original source filename`,
    "---",
    "```",
    "",
    `The \`sources\` field MUST always contain "${sourceFileName}".`,
    "",
    "## Frontmatter Field Guidelines",
    "- `description`: one sentence describing the page content (≤80 chars)",
    "- `aliases`: list of alternative names or abbreviations for this entity/concept",
    "- `tags`: 2-5 descriptive tags relevant to the content (e.g. [\"医疗\", \"体检\", \"珠海\"])",
    "- `related`: slugs of related pages already in this wiki (e.g. [\"高尿酸血症\", \"珠海奥乐医院\"])",
    "",
    "Other rules:",
    "- Use [[wikilink]] syntax for cross-references between pages — available pages are listed in the Existing pages section below",
    "- Link to existing pages using [[slug]] — use the Existing pages list as the source for cross-reference wikilinks",
    "- Filenames MUST follow source language. If the source is Chinese, use Chinese filenames directly (DO NOT transliterate to pinyin). If the source is English, use readable English filenames.",
    "- Follow the analysis recommendations on what to emphasize",
    "",
    "## Page Type Rules (CRITICAL — read before writing each FILE block)",
    "",
    `### Entity Pages  (path must be under wiki/sources/${base}/entities/)`,
    "- An entity page is about a SPECIFIC PERSON, ORGANIZATION, PRODUCT, DATASET, or TOOL",
    "- Content MUST describe: who/what this entity is, their background, their role in this source",
    "- ❌ DO NOT write about medical conditions, abstract concepts, or techniques in entity pages",
    "- ✅ Example correct: a page about '韩松' describes this person's identity and role in the source",
    "- Required sections:",
    "  ## {title}",
    "  ## 背景",
    "  ## 在本源中的角色",
    "  ## 相关",
    "",
    `### Concept Pages  (path must be under wiki/sources/${base}/concepts/)`,
    "- A concept page is about an ABSTRACT IDEA, MEDICAL CONDITION, METHODOLOGY, or TECHNIQUE",
    "- Content MUST describe: definition, clinical/technical significance, how it appears in this source",
    "- ❌ DO NOT write about specific people, organizations, or products in concept pages",
    "- ✅ Example correct: a page about '高尿酸血症' explains what this medical condition is",
    "- Required sections:",
    "  ## {title}",
    "  ## 定义",
    "  ## 意义",
    "  ## 在本源中的体现",
    "  ## 相关",
    "",
    "### SELF-CHECK before writing each FILE block:",
    "- Path contains /entities/ → content MUST be about a specific person/org/product/tool",
    "- Path contains /concepts/ → content MUST be about an abstract idea/condition/method",
    "- If content and path type do not match → FIX IT before outputting",
    "",
    "## Review Items",
    "",
    "After the FILE blocks, output REVIEW blocks for anything that needs human judgment:",
    "",
    "---REVIEW: type | Title---",
    "Description of what needs the user's attention.",
    "OPTIONS: (see allowed options below)",
    "PAGES: wiki/page1.md, wiki/page2.md",
    "SEARCH: search query 1 | search query 2",
    "---END REVIEW---",
    "",
    "Review types: contradiction, duplicate, missing-page, suggestion.",
    "For each: OPTIONS: Create Page | Skip",
    "",
    "Only create reviews for things that genuinely need human input.",
    "",
    purpose ? `## Wiki Purpose\n${purpose}` : "",
    schema ? `## Wiki Schema\n${schema}` : "",
    existingSourcePaths ? `## Existing pages for this source (use [[wikilink]] cross-references to link to these pages)\n${existingSourcePaths}` : "",
  ].filter(Boolean).join("\n")
}

// ── File plan types and parsers ────────────────────────────────────────────

export interface PlanItem {
  type: "entity" | "concept"
  name: string
  description: string
}

export interface PlanCountSummary {
  expectedEntityNames: string[]
  expectedConceptNames: string[]
}

export interface PlannedCountGateInput {
  expectedEntityNames: string[]
  expectedConceptNames: string[]
  actualEntityNames: string[]
  actualConceptNames: string[]
}

export interface PlannedCountGateResult {
  ok: boolean
  detail?: string
}

/**
 * Extract entity/concept file plan from the LLM analysis output.
 * Looks for lines like: ENTITY: Name | description
 */
export function parsePlan(analysis: string): PlanItem[] {
  const planMatch = analysis.match(/## File Plan\s*\n([\s\S]*)$/)
  const planSection = planMatch ? planMatch[1] : analysis
  const items: PlanItem[] = []

  for (const line of planSection.split("\n")) {
    const entityMatch = line.match(/^ENTITY:\s*(.+?)\s*\|\s*(.+)$/)
    if (entityMatch) {
      items.push({ type: "entity", name: entityMatch[1].trim(), description: entityMatch[2].trim() })
      continue
    }
    const conceptMatch = line.match(/^CONCEPT:\s*(.+?)\s*\|\s*(.+)$/)
    if (conceptMatch) {
      items.push({ type: "concept", name: conceptMatch[1].trim(), description: conceptMatch[2].trim() })
    }
  }
  return items
}

function normalizeCountName(name: string): string {
  return name.trim().toLowerCase()
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const rawName of names) {
    const normalized = normalizeCountName(rawName)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(rawName.trim())
  }
  return result
}

export function summarizePlanCounts(items: PlanItem[]): PlanCountSummary {
  const expectedEntityNames = dedupeNames(
    items.filter((item) => item.type === "entity").map((item) => item.name),
  )
  const expectedConceptNames = dedupeNames(
    items.filter((item) => item.type === "concept").map((item) => item.name),
  )
  return { expectedEntityNames, expectedConceptNames }
}

function findMissingPlannedNames(expectedNames: string[], actualNames: string[]): string[] {
  const actualSet = new Set(actualNames.map((name) => normalizeCountName(name)))
  return expectedNames.filter((name) => !actualSet.has(normalizeCountName(name)))
}

export function evaluatePlannedCountGate(input: PlannedCountGateInput): PlannedCountGateResult {
  const expectedEntityNames = dedupeNames(input.expectedEntityNames)
  const expectedConceptNames = dedupeNames(input.expectedConceptNames)
  const actualEntityNames = dedupeNames(input.actualEntityNames)
  const actualConceptNames = dedupeNames(input.actualConceptNames)

  const missingEntities = findMissingPlannedNames(expectedEntityNames, actualEntityNames)
  const missingConcepts = findMissingPlannedNames(expectedConceptNames, actualConceptNames)
  const entityMissingCount = Math.max(0, expectedEntityNames.length - actualEntityNames.length)
  const conceptMissingCount = Math.max(0, expectedConceptNames.length - actualConceptNames.length)

  if (entityMissingCount === 0 && conceptMissingCount === 0) {
    return { ok: true }
  }

  const details: string[] = [
    `planned_count_mismatch: expected entities=${expectedEntityNames.length}, concepts=${expectedConceptNames.length}; actual entities=${actualEntityNames.length}, concepts=${actualConceptNames.length}`,
  ]
  if (entityMissingCount > 0) {
    details.push(
      `missing entities=${entityMissingCount}` +
      (missingEntities.length > 0 ? ` sample=[${missingEntities.slice(0, 5).join(", ")}]` : ""),
    )
  }
  if (conceptMissingCount > 0) {
    details.push(
      `missing concepts=${conceptMissingCount}` +
      (missingConcepts.length > 0 ? ` sample=[${missingConcepts.slice(0, 5).join(", ")}]` : ""),
    )
  }
  return { ok: false, detail: details.join(" | ") }
}

// ── Source summary prompt ──────────────────────────────────────────────────

/** Remove characters that are unsafe in filenames */
export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim()
}

export function buildSourceSummaryPrompt(
  sourceFileName: string,
  purpose: string,
  schema: string,
): string {
  const base = sourceFileName.replace(/\.[^.]+$/, "")
  return [
    "You are a wiki maintainer. Generate EXACTLY ONE wiki file: the source summary page.",
    "",
    LANGUAGE_RULE,
    "",
    `## File to Generate`,
    `- Path: wiki/sources/${base}.md`,
    `- Type: source`,
    `- This page summarizes the source document and links to entity/concept pages.`,
    "",
    "## Output Format",
    `Output ONLY this single FILE block:`,
    `---FILE: wiki/sources/${base}.md---`,
    "(YAML frontmatter + content)",
    "---END FILE---",
    "",
    "## Frontmatter",
    "```yaml",
    "---",
    "type: source",
    `title: "${base}"`,
    "description: \"One-sentence summary of this source (≤80 chars)\"",
    "aliases: []",
    "created: YYYY-MM-DD",
    "updated: YYYY-MM-DD",
    "tags: []",
    "related: []",
    `sources: ["${sourceFileName}"]`,
    "---",
    "```",
    "",
    "## Content Rules",
    "- Write 3-6 paragraphs summarizing the source",
    "- Use [[wikilink]] to reference entity and concept pages from this source",
    "- Mention all notable entities and concepts from the analysis",
    `- The \`sources\` field MUST contain "${sourceFileName}"`,
    "",
    purpose ? `## Wiki Purpose\n${purpose}` : "",
    schema ? `## Wiki Schema\n${schema}` : "",
  ].filter(Boolean).join("\n")
}

// ── Single file prompt ─────────────────────────────────────────────────────

export function buildSingleFilePrompt(
  filePath: string,
  fileType: "entity" | "concept",
  title: string,
  description: string,
  sourceFileName: string,
  purpose: string,
): string {
  const typeRules =
    fileType === "entity"
      ? [
          `- This is an ENTITY page about a specific person, organization, product, or tool: "${title}"`,
          `- Content MUST describe who/what "${title}" is and their role in the source`,
          "- DO NOT write about abstract ideas, medical conditions, or techniques in this page",
          "- Focus on: identity, background, significance, role in the source document",
          "- Required sections:",
          "  ## {title}",
          "  ## 背景",
          "  ## 在本源中的角色",
          "  ## 相关",
        ]
      : [
          `- This is a CONCEPT page about an abstract idea, medical condition, or technique: "${title}"`,
          `- Content MUST explain what "${title}" means and why it matters`,
          "- DO NOT write about specific people or organizations in this page",
          "- Focus on: definition, clinical/technical significance, how it appears in the source",
          "- Required sections:",
          "  ## {title}",
          "  ## 定义",
          "  ## 意义",
          "  ## 在本源中的体现",
          "  ## 相关",
        ]

  return [
    `You are a wiki maintainer. Generate EXACTLY ONE wiki file.`,
    "",
    LANGUAGE_RULE,
    "",
    `## File to Generate`,
    `- Path: ${filePath}`,
    `- Type: ${fileType}`,
    `- Title: ${title}`,
    `- Description: ${description}`,
    `- Source: ${sourceFileName}`,
    "",
    "## Output Format",
    "Output ONLY this single FILE block (no other text before or after):",
    `---FILE: ${filePath}---`,
    "(YAML frontmatter + page content)",
    "---END FILE---",
    "",
    "## Frontmatter",
    "```yaml",
    "---",
    `type: ${fileType}`,
    `title: "${title}"`,
    "description: \"One-sentence summary (≤80 chars)\"",
    "aliases: []",
    "created: YYYY-MM-DD",
    "updated: YYYY-MM-DD",
    "tags: []",
    "related: []",
    `sources: ["${sourceFileName}"]`,
    "---",
    "```",
    "",
    "## Content Rules (CRITICAL)",
    ...typeRules,
    "- Use [[wikilink]] syntax for cross-references to other pages",
    `- The \`sources\` field MUST contain "${sourceFileName}"`,
    "",
    purpose ? `## Wiki Purpose\n${purpose}` : "",
  ].filter(Boolean).join("\n")
}

// ── Shared files prompt ────────────────────────────────────────────────────

export function buildSharedFilesPrompt(
  sourceFileName: string,
  writtenFiles: string[],
  purpose: string,
  _index: string,
  overview: string,
): string {
  return [
    "You are a wiki maintainer. Generate exactly 2 wiki management files.",
    "",
    LANGUAGE_RULE,
    "",
    `## Source Just Ingested: ${sourceFileName}`,
    `Pages created: ${writtenFiles.join(", ")}`,
    "",
    "## Files to Generate",
    "",
    "1. wiki/log.md — append a new log entry ONLY",
    `   - Format: ## [${new Date().toISOString().slice(0, 10)}] ingest | ${sourceFileName}`,
    "   - List the pages created",
    "",
    "2. wiki/overview.md — updated high-level summary of the entire wiki",
    "   - 2-5 paragraphs covering ALL topics in the wiki",
    "   - Reflect the newly added content",
    "",
    "## Output Format",
    "---FILE: wiki/log.md---",
    "(new log entry only)",
    "---END FILE---",
    "---FILE: wiki/overview.md---",
    "(complete updated overview)",
    "---END FILE---",
    "",
    "## Review Items",
    "After the FILE blocks, you may output REVIEW blocks:",
    "---REVIEW: type | Title---",
    "Description.",
    "OPTIONS: Create Page | Skip",
    "PAGES: wiki/page1.md",
    "SEARCH: query1 | query2",
    "---END REVIEW---",
    "Review types: contradiction, duplicate, missing-page, suggestion",
    "",
    purpose ? `## Wiki Purpose\n${purpose}` : "",
    overview ? `## Current Overview\n${overview}` : "",
  ].filter(Boolean).join("\n")
}

// ── Rebuild summary prompt ─────────────────────────────────────────────────

export function buildRebuildSummaryPrompt(pageListing: string): string {
  return [
    "You are a wiki librarian. Generate two high-quality wiki meta-documents based on the existing wiki pages listed below.",
    "",
    LANGUAGE_RULE,
    "",
    "## Existing Wiki Pages",
    "",
    "Each line is formatted as: `[type] [[slug]] — Title | desc: one-sentence page description`",
    "Use the `desc:` description field to better understand the page content when writing the overview.",
    "",
    pageListing,
    "",
    "## Output Format",
    "",
    "Output each file in this exact format:",
    "",
    "---FILE: wiki/index.md---",
    "(complete file content)",
    "---END FILE---",
    "",
    "---FILE: wiki/overview.md---",
    "(complete file content)",
    "---END FILE---",
    "",
    "## Generate",
    "",
    "1. **wiki/index.md** — A well-organized catalog of all wiki pages.",
    "   - Group pages by type (Entities, Concepts, Sources, etc.).",
    "   - Each entry format: `- [[slug]] — Title`",
    "   - Do NOT include index.md, overview.md, or log.md themselves.",
    "",
    "2. **wiki/overview.md** — A high-level prose summary of the entire wiki.",
    "   - Describe the main topics, entities, and concepts covered.",
    "   - Mention the number of sources, entities, and concepts.",
    "   - Write in a clear, encyclopedic style.",
    "   - Begin with a YAML frontmatter block: `---\\ntype: overview\\ntitle: Wiki 总览\\n---`",
  ].join("\n")
}

// ── Deduplicate prompts ────────────────────────────────────────────────────

export interface MergeGroup {
  /**
   * Relative path from wikiDir to the canonical file, WITHOUT .md extension.
   * Example: "sources/2024/entities/珠海奥乐医院"
   */
  canonical: string
  /** Relative paths (same format as canonical) of files to merge into canonical and delete. */
  aliases: string[]
}

/**
 * Parse the ---MERGE-PLAN--- block from LLM output.
 * Returns an array of MergeGroup objects, or [] if absent/invalid.
 */
export function parseMergePlan(text: string): MergeGroup[] {
  const match = text.match(/---MERGE-PLAN---\s*([\s\S]*?)\s*---END MERGE-PLAN---/)
  if (!match || !match[1]) return []
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (g): g is MergeGroup =>
        typeof g === "object" && g !== null &&
        typeof g.canonical === "string" &&
        Array.isArray(g.aliases),
    )
  } catch {
    return []
  }
}

/**
 * Build the LLM prompt for deduplicating wiki entities and concepts.
 * Round 1: identification only — outputs MERGE-PLAN JSON, no file content.
 */
export function buildDeduplicatePrompt(pageListing: string): string {
  return [
    "You are a wiki librarian. Analyze the wiki pages listed below and identify duplicate or semantically similar entries.",
    "",
    LANGUAGE_RULE,
    "",
    "## Existing Wiki Pages (entities and concepts only)",
    "",
    "Each line format: [type] path: wiki/<rel-path> | slug: [[slug]] | title: <title> | sources: <count>",
    "The `path` field is the UNIQUE identifier for each file (files can share the same slug but have different paths).",
    "",
    pageListing,
    "",
    "## Task",
    "",
    "1. Identify groups of pages that represent the same real-world entity or concept and should be merged.",
    "   - Only group pages that are clearly duplicates or near-duplicates.",
    "   - Do NOT group pages that are merely related.",
    "   - If no duplicates exist, output an empty MERGE-PLAN array.",
    "",
    "2. For each merge group, choose ONE canonical page:",
    "   - Prefer the page with the most source references.",
    "   - Tiebreak: longest body, then alphabetical path.",
    "   - Use the canonical page's FULL REL-PATH (without wiki/ prefix, without .md) as the `canonical` value.",
    "   - Use each alias page's FULL REL-PATH (without wiki/ prefix, without .md) as the `aliases` values.",
    "",
    "## Output Format",
    "",
    "Output ONLY the merge plan (use FULL REL-PATHS, not just slugs):",
    "",
    "---MERGE-PLAN---",
    '[{"canonical":"sources/2024/entities/example","aliases":["sources/2025/entities/example"]},...]',
    "---END MERGE-PLAN---",
    "",
    "CRITICAL: The `canonical` and `aliases` values must be the rel-path WITHOUT wiki/ prefix and WITHOUT .md.",
    "Example: `sources/2024/entities/珠海奥乐医院`  (NOT just `珠海奥乐医院`)",
    "",
    "If there are no duplicates to merge, output only:",
    "---MERGE-PLAN---",
    "[]",
    "---END MERGE-PLAN---",
  ].join("\n")
}

const MERGE_CONTENT_MAX_CHARS = 10000

/**
 * Build the LLM prompt for merging the full content of duplicate wiki entries.
 * Round 2: content merging — receives actual file bodies, outputs a single FILE block.
 */
export function buildMergeContentPrompt(
  entries: { path: string; content: string }[],
  canonicalPath: string,
): string {
  const entryBlocks = entries.map((e) => {
    const body = e.content.length > MERGE_CONTENT_MAX_CHARS
      ? e.content.slice(0, MERGE_CONTENT_MAX_CHARS) + "\n\n[...truncated]"
      : e.content
    return `== Entry: ${e.path} ==\n${body}`
  })

  return [
    "You are a wiki editor. Merge the following wiki entries into one high-quality entry.",
    "",
    LANGUAGE_RULE,
    "",
    "## Merge Rules",
    "",
    "1. Preserve ALL non-overlapping factual information from every entry.",
    "2. The `sources` field in YAML frontmatter must be the union of all entries' sources (no duplicates).",
    "3. Prefer completeness over brevity — keep details even if slightly redundant.",
    "4. Use the canonical entry's frontmatter structure as the base.",
    "5. If entries describe the same fact differently, keep the most detailed version.",
    "6. The `tags` field must be the union of all entries' tags (deduplicated, no duplicates).",
    "7. The `related` field must be the union of all entries' related slugs (deduplicated, no duplicates).",
    "",
    "## Entries to Merge",
    "",
    entryBlocks.join("\n\n"),
    "",
    "## Output Format",
    "",
    "Output the merged entry as a single FILE block:",
    "",
    `---FILE: ${canonicalPath}---`,
    "(complete merged file content with YAML frontmatter)",
    "---END FILE---",
    "",
    "Output ONLY the FILE block. No explanation or commentary.",
  ].join("\n")
}
