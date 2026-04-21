import { readFile, writeFile, listDirectory } from "@/commands/fs"
import { streamChat } from "@/lib/llm-client"
import type { LlmConfig } from "@/stores/wiki-store"
import { getFileCategory, needsVisionIngest } from "@/lib/file-types"
import { supportsVision } from "@/lib/vision-capability"
import { useWikiStore } from "@/stores/wiki-store"
import { useChatStore } from "@/stores/chat-store"
import { useActivityStore } from "@/stores/activity-store"
import { getFileName } from "@/lib/path-utils"
import { checkIngestCache, saveIngestCache } from "@/lib/ingest-cache"
import { needsPreprocess } from "@/lib/file-types"

/**
 * Parse FILE blocks from LLM output.
 *
 * A line-based parser that treats a new ---FILE: header as an implicit
 * terminator for any open block. This prevents missing ---END FILE---
 * markers from causing content bleed between files.
 */
function parseFileBlocks(text: string): Array<{ path: string; content: string }> {
  const results: Array<{ path: string; content: string }> = []
  const lines = text.split("\n")
  let currentPath: string | null = null
  const currentLines: string[] = []

  const flush = () => {
    if (currentPath !== null) {
      results.push({ path: currentPath, content: currentLines.join("\n") })
      currentLines.length = 0
      currentPath = null
    }
  }

  for (const line of lines) {
    const startMatch = line.match(/^---FILE:\s*(.+?)\s*---$/)
    if (startMatch) {
      flush()
      currentPath = startMatch[1]
    } else if (line === "---END FILE---") {
      flush()
    } else if (currentPath !== null) {
      currentLines.push(line)
    }
  }
  flush()
  return results
}

export const LANGUAGE_RULE = "## Language Rule\n- ALWAYS match the language of the source document. If the source is in Chinese, write in Chinese. If in English, write in English. Wiki page titles, content, and descriptions should all be in the same language as the source material."

/**
 * Ensure every wiki markdown file has proper YAML frontmatter delimiters.
 * Handles the case where the LLM omits the surrounding `---` markers.
 */
function normalizeFrontmatter(content: string): string {
  // Already has proper --- delimited frontmatter
  if (/^-{3}[ \t]*\r?\n/.test(content)) return content

  // Detect 2+ consecutive bare YAML key:value lines at the start of the file
  // (lowercase/underscore keys only — avoids treating markdown headings as YAML)
  const m = content.match(/^((?:[a-z_][a-z0-9_]*[ \t]*:[ \t]*[^\n]*\n){2,})/)
  if (m) {
    const yamlBlock = m[1]
    const rest = content.slice(yamlBlock.length).replace(/^\n+/, "") // strip leading blank lines from body
    return `---\n${yamlBlock}---\n\n${rest}`
  }

  return content
}

/**
 * Auto-ingest: reads source → LLM analyzes → LLM writes wiki pages, all in one go.
 * Used when importing new files.
 */
export async function autoIngest(
  projectId: string,
  sourcePath: string, // relative to project root
  _llmConfig?: LlmConfig,
  signal?: AbortSignal,
  folderContext?: string,
): Promise<string[]> {
  const activity = useActivityStore.getState()
  const fileName = getFileName(sourcePath)
  const activityId = activity.addItem({
    type: "ingest",
    projectId,
    sourcePath,
    title: fileName,
    status: "running",
    detail: "Reading source...",
    filesWritten: [],
  })

  // ── Guard: image files require vision-capable LLM ──────────────────────
  const fileCategory = getFileCategory(sourcePath)
  if (needsVisionIngest(fileCategory)) {
    const llmCfg = useWikiStore.getState().llmConfig
    if (!llmCfg || !supportsVision(llmCfg.provider, llmCfg.model ?? "")) {
      activity.updateItem(activityId, {
        status: "error",
        detail: `[Vision not supported] 当前模型不支持视觉识别，图片文件将被忽略。请切换到支持视觉的模型（如 gpt-4o、claude-3、gemini-1.5-pro）后重试。`,
      })
      return []
    }
  }

  const [sourceContent, schema, purpose, index, overview] = await Promise.all([
    readSourceForIngest(projectId, sourcePath),
    tryReadFile(projectId, "schema.md"),
    tryReadFile(projectId, "purpose.md"),
    tryReadFile(projectId, "wiki/index.md"),
    tryReadFile(projectId, "wiki/overview.md"),
  ])

  // ── Cache check: skip re-ingest if source content hasn't changed ──
  const cachedFiles = await checkIngestCache(projectId, fileName, sourceContent)
  if (cachedFiles !== null) {
    activity.updateItem(activityId, {
      status: "done",
      detail: `Skipped (unchanged) — ${cachedFiles.length} files from previous ingest`,
      filesWritten: cachedFiles,
    })
    return cachedFiles
  }

  const truncatedContent = sourceContent.length > 50000
    ? sourceContent.slice(0, 50000) + "\n\n[...truncated...]"
    : sourceContent

  // ── Step 1: Analysis ──────────────────────────────────────────
  activity.updateItem(activityId, { detail: "Step 1: Analyzing source..." })

  let analysis = ""

  await streamChat(
    [
      { role: "system", content: buildAnalysisPrompt(purpose, index) },
      { role: "user", content: `Analyze this source document:\n\n**File:** ${fileName}${folderContext ? `\n**Folder context:** ${folderContext}` : ""}\n\n---\n\n${truncatedContent}` },
    ],
    {
      onToken: (token) => { analysis += token },
      onDone: () => {},
      onError: (err) => {
        activity.updateItem(activityId, { status: "error", detail: `Analysis failed: ${err.message}` })
      },
    },
    signal,
  )

  if (useActivityStore.getState().items.find((i) => i.id === activityId)?.status === "error") {
    return []
  }

  // ── Parse file plan ───────────────────────────────────────────
  const base = fileName.replace(/\.[^.]+$/, "")

  // ── Step 2: Generation ────────────────────────────────────────
  activity.updateItem(activityId, { detail: "Step 2/2: Generating wiki pages..." })

  let generation = ""

  await streamChat(
    [
      { role: "system", content: buildGenerationPrompt(schema, purpose, index, fileName, overview) },
      {
        role: "user",
        content: [
          `Based on the following analysis of **${fileName}**, generate the wiki files.`,
          "",
          "## Source Analysis",
          "",
          analysis,
          "",
          "## Original Source Content",
          "",
          truncatedContent,
        ].join("\n"),
      },
    ],
    {
      onToken: (token) => { generation += token },
      onDone: () => {},
      onError: (err) => {
        activity.updateItem(activityId, { status: "error", detail: `Generation failed: ${err.message}` })
      },
    },
    signal,
  )

  if (useActivityStore.getState().items.find((i) => i.id === activityId)?.status === "error") {
    return []
  }

  // ── Step 3: Write files ───────────────────────────────────────
  activity.updateItem(activityId, { detail: "Writing files..." })
  const writtenPaths = await writeFileBlocks(projectId, generation)

  const sourceSummaryPath = `wiki/sources/${base}.md`
  if (!writtenPaths.includes(sourceSummaryPath)) {
    const date = new Date().toISOString().slice(0, 10)
    const fallbackContent = [
      "---",
      `type: source`,
      `title: "${base}"`,
      `created: ${date}`,
      `updated: ${date}`,
      `sources: ["${fileName}"]`,
      `tags: []`,
      `related: []`,
      "---",
      "",
      `# Source: ${fileName}`,
      "",
      analysis ? analysis.slice(0, 3000) : "(Analysis not available)",
      "",
    ].join("\n")
    try {
      await writeFile(projectId, sourceSummaryPath, fallbackContent)
      writtenPaths.push(sourceSummaryPath)
    } catch {
      // non-critical
    }
  }

  if (writtenPaths.length > 0) {
    try {
      const tree = await listDirectory(projectId)
      useWikiStore.getState().setFileTree(tree)
      useWikiStore.getState().bumpDataVersion()
    } catch {
      // ignore
    }
    // Trigger server-side index rebuild (non-blocking, best-effort)
    fetch("/api/ingest/rebuild-index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    }).catch(() => { /* non-critical */ })
  }

  // ── Step 4: Save to cache ───────────────────────────────────
  if (writtenPaths.length > 0) {
    await saveIngestCache(projectId, fileName, sourceContent, writtenPaths)
  }

  // ── Step 5: Generate embeddings (if enabled) ───────────────
  const embCfg = useWikiStore.getState().embeddingConfig
  if (embCfg.enabled && embCfg.model && writtenPaths.length > 0) {
    try {
      const { embedPage } = await import("@/lib/embedding")
      for (const wpath of writtenPaths) {
        const pageId = wpath.split("/").pop()?.replace(/\.md$/, "") ?? ""
        if (!pageId || ["index", "log", "overview"].includes(pageId)) continue
        try {
          const content = await readFile(projectId, wpath)
          const titleMatch = content.match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m)
          const title = titleMatch ? titleMatch[1].trim() : pageId
          await embedPage(projectId, pageId, title, content, embCfg)
        } catch {
          // non-critical
        }
      }
    } catch {
      // embedding module not available
    }
  }

  const detail = writtenPaths.length > 0
    ? `${writtenPaths.length} files written`
    : "No files generated"

  activity.updateItem(activityId, {
    status: writtenPaths.length > 0 ? "done" : "error",
    detail,
    filesWritten: writtenPaths,
  })

  return writtenPaths
}

async function writeFileBlocks(projectId: string, text: string): Promise<string[]> {
  const writtenPaths: string[] = []

  for (const { path: relativePath, content: rawContent } of parseFileBlocks(text)) {
    let content = rawContent
    if (!relativePath) continue

    // Normalize frontmatter format for markdown wiki pages
    if (relativePath.endsWith(".md") && !relativePath.endsWith("/log.md") && relativePath !== "wiki/log.md") {
      content = normalizeFrontmatter(content)
    }

    // Skip files with no substantive content (LLM sometimes generates empty FILE blocks)
    if (!relativePath.endsWith("/log.md") && relativePath !== "wiki/log.md" && !content.trim()) {
      console.warn(`[writeFileBlocks] Skipping empty content for ${relativePath}`)
      continue
    }

    try {
      if (relativePath === "wiki/log.md" || relativePath.endsWith("/log.md")) {
        const existing = await tryReadFile(projectId, relativePath)
        const appended = existing ? `${existing}\n\n${content.trim()}` : content.trim()
        await writeFile(projectId, relativePath, appended)
      } else {
        await writeFile(projectId, relativePath, content)
      }
      writtenPaths.push(relativePath)
    } catch (err) {
      console.error(`Failed to write ${relativePath}:`, err)
    }
  }

  return writtenPaths
}

/**
 * Step 1 prompt: AI reads the source and produces a structured analysis.
 * This is the "discussion" step — the AI reasons about the source before writing wiki pages.
 */
function buildAnalysisPrompt(purpose: string, index: string): string {
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
    "- Whether it likely already exists in the wiki (check the index)",
    "",
    "## Key Concepts",
    "List theories, methods, techniques, phenomena. For each:",
    "- Name and brief definition",
    "- Why it matters in this source",
    "- Whether it likely already exists in the wiki",
    "",
    "## Main Arguments & Findings",
    "- What are the core claims or results?",
    "- What evidence supports them?",
    "- How strong is the evidence?",
    "",
    "## Connections to Existing Wiki",
    "- What existing pages does this source relate to?",
    "- Does it strengthen, challenge, or extend existing knowledge?",
    "",
    "## Contradictions & Tensions",
    "- Does anything in this source conflict with existing wiki content?",
    "- Are there internal tensions or caveats?",
    "",
    "## Recommendations",
    "- What wiki pages should be created or updated?",
    "- What should be emphasized vs. de-emphasized?",
    "- Any open questions worth flagging for the user?",
    "",
    "Be thorough but concise. Focus on what's genuinely important.",
    "",
    "If a folder context is provided, use it as a hint for categorization — the folder structure often reflects the user's organizational intent (e.g., 'papers/energy' suggests the file is an energy-related paper).",
    "",
    purpose ? `## Wiki Purpose (for context)\n${purpose}` : "",
    index ? `## Current Wiki Index (for checking existing content)\n${index}` : "",
  ].filter(Boolean).join("\n")
}

/**
 * Step 2 prompt: AI takes its own analysis and generates wiki files + review items.
 */
function buildGenerationPrompt(schema: string, purpose: string, index: string, sourceFileName: string, overview?: string): string {
  // Use original filename (without extension) as the source summary page name
  const sourceBaseName = sourceFileName.replace(/\.[^.]+$/, "")

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
    `(or: ---FILE: wiki/sources/${sourceBaseName}/entities/entity-name.md---)`,
    "(complete file content with YAML frontmatter)",
    "---END FILE---",
    "",
    "Generate:",
    `1. A source summary page at **wiki/sources/${sourceBaseName}.md** (MUST use this exact path)`,
    `2. Entity pages in **wiki/sources/${sourceBaseName}/entities/** for key entities identified in the analysis (MUST use this exact prefix, e.g. wiki/sources/${sourceBaseName}/entities/entity-name.md)`,
    `3. Concept pages in **wiki/sources/${sourceBaseName}/concepts/** for key concepts identified in the analysis (MUST use this exact prefix, e.g. wiki/sources/${sourceBaseName}/concepts/concept-name.md)`,
    "4. An updated wiki/index.md — add new entries to existing categories, preserve all existing entries",
    "5. A log entry for wiki/log.md (just the new entry to append, format: ## [YYYY-MM-DD] ingest | Title)",
    "6. An updated wiki/overview.md — a high-level summary of what the entire wiki covers, updated to reflect the newly ingested source. This should be a comprehensive 2-5 paragraph overview of ALL topics in the wiki, not just the new source.",
    "",
    "## Frontmatter Rules (CRITICAL)",
    "",
    "Every page MUST have YAML frontmatter with these fields:",
    "```yaml",
    "---",
    "type: source | entity | concept | comparison | query | synthesis",
    "title: Human-readable title",
    "created: YYYY-MM-DD",
    "updated: YYYY-MM-DD",
    "tags: []",
    "related: []",
    `sources: [\"${sourceFileName}\"]  # MUST contain the original source filename`,
    "---",
    "```",
    "",
    `The \`sources\` field MUST always contain "${sourceFileName}" — this links the wiki page back to the original uploaded document.`,
    "",
    "Other rules:",
    "- Use [[wikilink]] syntax for cross-references between pages",
    "- Filenames MUST follow source language. If the source is Chinese, use Chinese filenames directly (DO NOT transliterate to pinyin). If the source is English, use readable English filenames.",
    "- Follow the analysis recommendations on what to emphasize",
    "- If the analysis found connections to existing pages, add cross-references",
    "",
    "## Page Type Rules (CRITICAL — read before writing each FILE block)",
    "",
    `### Entity Pages  (path must be under wiki/sources/${sourceBaseName}/entities/)`,
    "- An entity page is about a SPECIFIC PERSON, ORGANIZATION, PRODUCT, DATASET, or TOOL",
    "- Content MUST describe: who/what this entity is, their background, their role in this source",
    "- ❌ DO NOT write about medical conditions, abstract concepts, or techniques in entity pages",
    "- ✅ Example correct: a page about '韩松' describes this person's identity and role in the source",
    "",
    `### Concept Pages  (path must be under wiki/sources/${sourceBaseName}/concepts/)`,
    "- A concept page is about an ABSTRACT IDEA, MEDICAL CONDITION, METHODOLOGY, or TECHNIQUE",
    "- Content MUST describe: definition, clinical/technical significance, how it appears in this source",
    "- ❌ DO NOT write about specific people, organizations, or products in concept pages",
    "- ✅ Example correct: a page about '高尿酸血症' explains what this medical condition is",
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
    "SEARCH: search query 1 | search query 2 | search query 3",
    "---END REVIEW---",
    "",
    "Review types and when to use:",
    "- contradiction: the analysis found conflicts with existing wiki content",
    "- duplicate: an entity/concept might already exist under a different name in the index",
    "- missing-page: an important concept is referenced but has no dedicated page",
    "- suggestion: ideas for further research, related sources to look for, or connections worth exploring",
    "",
    "## OPTIONS Rules (CRITICAL — only use these predefined options):",
    "",
    "For each review type, use ONLY these allowed OPTIONS:",
    "",
    "- contradiction: OPTIONS: Create Page | Skip",
    "- duplicate: OPTIONS: Create Page | Skip",
    "- missing-page: OPTIONS: Create Page | Skip",
    "- suggestion: OPTIONS: Create Page | Skip",
    "",
    "The user also has a 'Deep Research' button (auto-added by the system) that triggers web search.",
    "Do NOT invent custom option labels. Only use 'Create Page' and 'Skip'.",
    "",
    "IMPORTANT for suggestion and missing-page types:",
    "- The SEARCH field must contain 2-3 web search queries optimized for finding relevant papers, articles, or documentation.",
    "- These should be specific, keyword-rich queries suitable for a search engine — NOT titles or sentences.",
    "- Example: for a suggestion about 'automated debt detection in AI-generated code', good SEARCH queries would be:",
    "  SEARCH: automated technical debt detection AI generated code | software quality metrics LLM code generation | static analysis tools agentic software development",
    "",
    "Only create reviews for things that genuinely need human input. Don't create trivial reviews.",
    "",
    purpose ? `## Wiki Purpose\n${purpose}` : "",
    schema ? `## Wiki Schema\n${schema}` : "",
    index ? `## Current Wiki Index (preserve all existing entries, add new ones)\n${index}` : "",
    overview ? `## Current Overview (update this to reflect the new source)\n${overview}` : "",
  ].filter(Boolean).join("\n")
}

function getStore() {
  return useChatStore.getState()
}

// ── File plan ─────────────────────────────────────────────────────────────

interface PlanItem {
  type: "entity" | "concept"
  name: string
  description: string
}

function parsePlan(analysis: string): PlanItem[] {
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

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim()
}

function buildSourceSummaryPrompt(
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
    "created: YYYY-MM-DD",
    "updated: YYYY-MM-DD",
    "tags: []",
    "related: []",
    `sources: ["${sourceFileName}"]`,
    "---",
    "```",
    "",
    "## Content Rules",
    "- Summarize the source document's key findings, entities, and concepts",
    "- Use [[wikilink]] to link to entity and concept pages",
    "- Be comprehensive but concise",
    "",
    purpose ? `## Wiki Purpose\n${purpose}` : "",
    schema ? `## Wiki Schema\n${schema}` : "",
  ].filter(Boolean).join("\n")
}

function buildSingleFilePrompt(
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
        ]
      : [
          `- This is a CONCEPT page about an abstract idea, medical condition, or technique: "${title}"`,
          `- Content MUST explain what "${title}" means and why it matters`,
          "- DO NOT write about specific people or organizations in this page",
          "- Focus on: definition, clinical/technical significance, how it appears in the source",
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

function buildSharedFilesPrompt(
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

async function tryReadFile(projectId: string, relativePath: string): Promise<string> {
  try {
    return await readFile(projectId, relativePath)
  } catch {
    return ""
  }
}

/**
 * Read a source file for ingest.
 * For binary/preprocess-needed files (PDF, DOCX, etc.) prefer the .cache.txt
 * extract so the LLM receives readable text instead of raw bytes.
 */
async function readSourceForIngest(projectId: string, relativePath: string): Promise<string> {
  const category = getFileCategory(relativePath)
  if (needsPreprocess(category)) {
    const cached = await tryReadFile(projectId, relativePath + ".cache.txt")
    if (cached && !cached.startsWith("[Binary file:")) return cached
  }
  return tryReadFile(projectId, relativePath)
}

export async function startIngest(
  projectId: string,
  sourcePath: string, // relative to project root
  _llmConfig?: LlmConfig,
  signal?: AbortSignal,
): Promise<void> {
  const store = getStore()
  store.setMode("ingest")
  store.setIngestSource(sourcePath)
  store.clearMessages()
  store.setStreaming(false)

  const [sourceContent, schema, purpose, index] = await Promise.all([
    readSourceForIngest(projectId, sourcePath),
    tryReadFile(projectId, "wiki/schema.md"),
    tryReadFile(projectId, "wiki/purpose.md"),
    tryReadFile(projectId, "wiki/index.md"),
  ])

  const fileName = getFileName(sourcePath)

  const systemPrompt = [
    "You are a knowledgeable assistant helping to build a wiki from source documents.",
    "",
    LANGUAGE_RULE,
    "",
    purpose ? `## Wiki Purpose\n${purpose}` : "",
    schema ? `## Wiki Schema\n${schema}` : "",
    index ? `## Current Wiki Index\n${index}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  const userMessage = [
    `I'm ingesting the following source file into my wiki: **${fileName}**`,
    "",
    "Please read it carefully and present the key takeaways, important concepts, and information that would be valuable to capture in the wiki. Highlight anything that relates to the wiki's purpose and schema.",
    "",
    "---",
    `**File: ${fileName}**`,
    "```",
    sourceContent || "(empty file)",
    "```",
  ].join("\n")

  store.addMessage("user", userMessage)
  store.setStreaming(true)

  let accumulated = ""

  await streamChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    {
      onToken: (token) => {
        accumulated += token
        getStore().appendStreamToken(token)
      },
      onDone: () => {
        getStore().finalizeStream(accumulated)
      },
      onError: (err) => {
        getStore().finalizeStream(`Error during ingest: ${err.message}`)
      },
    },
    signal,
  )
}

export async function executeIngestWrites(
  projectId: string,
  _llmConfig?: LlmConfig,
  userGuidance?: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const store = getStore()

  const [schema, index] = await Promise.all([
    tryReadFile(projectId, "wiki/schema.md"),
    tryReadFile(projectId, "wiki/index.md"),
  ])

  const conversationHistory = store.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))

  const writePrompt = [
    "Based on our discussion, please generate the wiki files that should be created or updated.",
    "",
    userGuidance ? `Additional guidance: ${userGuidance}` : "",
    "",
    schema ? `## Wiki Schema\n${schema}` : "",
    index ? `## Current Wiki Index\n${index}` : "",
    "",
    "Output ONLY the file contents in this exact format for each file:",
    "```",
    "---FILE: wiki/path/to/file.md---",
    "(file content here)",
    "---END FILE---",
    "```",
    "",
    "For wiki/log.md, include a log entry to append. For all other files, output the complete file content.",
    "Use relative paths from the project root (e.g., wiki/sources/topic.md).",
    "Do not include any other text outside the FILE blocks.",
  ]
    .filter((line) => line !== undefined)
    .join("\n")

  conversationHistory.push({ role: "user", content: writePrompt })

  store.addMessage("user", writePrompt)
  store.setStreaming(true)

  let accumulated = ""

  const systemPrompt = [
    "You are a wiki generation assistant. Your task is to produce structured wiki file contents.",
    "",
    LANGUAGE_RULE,
    schema ? `## Wiki Schema\n${schema}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  await streamChat(
    [{ role: "system", content: systemPrompt }, ...conversationHistory],
    {
      onToken: (token) => {
        accumulated += token
        getStore().appendStreamToken(token)
      },
      onDone: () => {
        getStore().finalizeStream(accumulated)
      },
      onError: (err) => {
        getStore().finalizeStream(`Error generating wiki files: ${err.message}`)
      },
    },
    signal,
  )

  const writtenPaths: string[] = []

  for (const { path: relativePath, content: rawContent } of parseFileBlocks(accumulated)) {
    let content = rawContent

    if (!relativePath) continue

    // Normalize frontmatter for markdown files
    if (relativePath.endsWith(".md") && !relativePath.endsWith("/log.md") && relativePath !== "wiki/log.md") {
      content = normalizeFrontmatter(content)
    }

    try {
      if (relativePath === "wiki/log.md" || relativePath.endsWith("/log.md")) {
        const existing = await tryReadFile(projectId, relativePath)
        const appended = existing
          ? `${existing}\n\n${content.trim()}`
          : content.trim()
        await writeFile(projectId, relativePath, appended)
      } else {
        await writeFile(projectId, relativePath, content)
      }
      writtenPaths.push(relativePath)
    } catch (err) {
      console.error(`Failed to write ${relativePath}:`, err)
    }
  }

  if (writtenPaths.length > 0) {
    const fileList = writtenPaths.map((p) => `- ${p}`).join("\n")
    getStore().addMessage("system", `Files written to wiki:\n${fileList}`)
  } else {
    getStore().addMessage("system", "No files were written. The LLM response did not contain valid FILE blocks.")
  }

  return writtenPaths
}
