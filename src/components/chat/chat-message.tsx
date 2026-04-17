import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import { keyframes } from "@mui/material/styles"
import type { SvgIconComponent } from "@mui/icons-material"
import PersonIcon from "@mui/icons-material/Person"
import SmartToyIcon from "@mui/icons-material/SmartToy"
import DescriptionIcon from "@mui/icons-material/Description"
import BookmarkAddIcon from "@mui/icons-material/BookmarkAdd"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import RefreshIcon from "@mui/icons-material/Refresh"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import CheckIcon from "@mui/icons-material/Check"
import GroupIcon from "@mui/icons-material/Group"
import LightbulbIcon from "@mui/icons-material/Lightbulb"
import MenuBookIcon from "@mui/icons-material/MenuBook"
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined"
import MergeIcon from "@mui/icons-material/Merge"
import BarChartIcon from "@mui/icons-material/BarChart"
import ViewModuleIcon from "@mui/icons-material/ViewModule"
import PublicIcon from "@mui/icons-material/Public"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile, writeFile, listDirectory } from "@/commands/fs"
import { lastQueryPages } from "@/components/chat/chat-panel"
import type { DisplayMessage } from "@/stores/chat-store"
import type { FileNode } from "@/types/wiki"

import { convertLatexToUnicode } from "@/lib/latex-to-unicode"
import { normalizePath, getFileName } from "@/lib/path-utils"
import { MarkdownView } from "@/components/ui/markdown-view"

// Module-level cache of source file names
let cachedSourceFiles: string[] = []

export function useSourceFiles() {
  const project = useWikiStore((s) => s.project)

  useEffect(() => {
    if (!project) return
    const pp = normalizePath(project.path)
    listDirectory(`${pp}/raw/sources`)
      .then((tree) => {
        cachedSourceFiles = flattenNames(tree)
      })
      .catch(() => {
        cachedSourceFiles = []
      })
  }, [project])

  return cachedSourceFiles
}

function flattenNames(nodes: FileNode[]): string[] {
  const names: string[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      names.push(...flattenNames(node.children))
    } else if (!node.is_dir) {
      names.push(node.name)
    }
  }
  return names
}

interface ChatMessageProps {
  message: DisplayMessage
  isLastAssistant?: boolean
  onRegenerate?: () => void
}

const pulseAnim = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`

export function ChatMessage({ message, isLastAssistant, onRegenerate }: ChatMessageProps) {
  const { t } = useTranslation()
  const isUser = message.role === "user"
  const isSystem = message.role === "system"
  const isAssistant = message.role === "assistant"
  const [hovered, setHovered] = useState(false)

  return (
    <Stack
      spacing={1}
      sx={{
        flexDirection: isUser ? "row-reverse" : "row",
        alignItems: "flex-start",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Box
        sx={{
          display: "flex",
          height: 28,
          width: 28,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "10px",
          ...(isSystem
            ? {
                bgcolor: "action.selected",
                color: "text.primary",
              }
            : isUser
              ? {
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                }
              : {
                  bgcolor: "rgba(194, 65, 12, 0.06)",
                  color: "primary.main",
                }),
        }}
      >
        {isUser ? <PersonIcon sx={{ fontSize: 14 }} /> : <SmartToyIcon sx={{ fontSize: 14 }} />}
      </Box>
      <Stack spacing={0.75} sx={{ maxWidth: "80%" }}>
        <Box
          sx={{
            borderRadius: "14px",
            px: 1.75,
            py: 1.25,
            fontSize: "0.875rem",
            ...(isUser
              ? {
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                }
              : {
                  bgcolor: "background.paper2",
                  color: "text.primary",
                  border: "1px solid",
                  borderColor: "divider",
                }),
          }}
        >
          {isUser ? (
            <Typography
              component="div"
              variant="body2"
              sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            >
              {message.content}
            </Typography>
          ) : (
            <MarkdownContent content={message.content} />
          )}
        </Box>
        {isAssistant && <CitedReferencesPanel content={message.content} savedReferences={message.references} />}
        {isAssistant && hovered && (
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
            <CopyButton content={message.content} />
            <SaveToWikiButton content={message.content} visible={true} />
            {isLastAssistant && onRegenerate && (
              <Button
                type="button"
                size="small"
                onClick={onRegenerate}
                title={t("chat.regenerateTitle")}
                sx={{
                  minWidth: 0,
                  px: 1,
                  py: 0.25,
                  fontSize: "0.6875rem",
                  textTransform: "none",
                  color: "text.secondary",
                  "&:hover": {
                    color: "primary.main",
                    bgcolor: "rgba(194, 65, 12, 0.06)",
                  },
                }}
                startIcon={<RefreshIcon sx={{ fontSize: 12 }} />}
              >
                {t("chat.regenerate")}
              </Button>
            )}
          </Stack>
        )}
      </Stack>
    </Stack>
  )
}

function CopyButton({ content }: { content: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    // Strip HTML comments and thinking blocks before copying
    const clean = content
      .replace(/<!--.*?-->/gs, "")
      .replace(/<think(?:ing)?>\s*[\s\S]*?<\/think(?:ing)?>\s*/gi, "")
      .replace(/<think(?:ing)?>\s*[\s\S]*$/gi, "")
      .trim()

    await navigator.clipboard.writeText(clean)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content])

  return (
    <Button
      type="button"
      size="small"
      onClick={handleCopy}
      title={t("chat.copyToClipboard")}
      sx={{
        minWidth: 0,
        px: 1,
        py: 0.25,
        fontSize: "0.6875rem",
        textTransform: "none",
        color: "text.secondary",
        "&:hover": {
          color: "primary.main",
          bgcolor: "rgba(194, 65, 12, 0.06)",
        },
      }}
      startIcon={copied ? <CheckIcon sx={{ fontSize: 12 }} /> : <ContentCopyIcon sx={{ fontSize: 12 }} />}
    >
      {copied ? t("chat.copied") : t("chat.copy")}
    </Button>
  )
}

function SaveToWikiButton({ content, visible }: { content: string; visible: boolean }) {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const setFileTree = useWikiStore((s) => s.setFileTree)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (!project || saving) return
    const pp = normalizePath(project.path)
    setSaving(true)
    try {
      // Generate slug from first line or first 50 chars
      const firstLine = content.split("\n")[0].replace(/^#+\s*/, "").trim()
      const title = firstLine.slice(0, 60) || t("chat.savedQuery")
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 50)
      const date = new Date().toISOString().slice(0, 10)
      const fileName = `${slug}-${date}.md`
      const filePath = `${pp}/wiki/queries/${fileName}`

      // Strip hidden sources comment and thinking blocks from content
      const cleanContent = content
        .replace(/<!--\s*sources:.*?-->/g, "")
        .replace(/<think(?:ing)?>\s*[\s\S]*?<\/think(?:ing)?>\s*/gi, "")
        .replace(/<think(?:ing)?>\s*[\s\S]*$/gi, "")
        .trimEnd()

      const frontmatter = [
        "---",
        `type: query`,
        `title: "${title.replace(/"/g, '\\"')}"`,
        `created: ${date}`,
        `tags: []`,
        "---",
        "",
      ].join("\n")

      await writeFile(filePath, frontmatter + cleanContent)

      // Update index.md — append under ## Queries section
      const indexPath = `${pp}/wiki/index.md`
      let indexContent = ""
      try {
        indexContent = await readFile(indexPath)
      } catch {
        indexContent = "# Wiki Index\n\n## Queries\n"
      }
      const entry = `- [[queries/${slug}-${date}|${title}]]`
      if (indexContent.includes("## Queries")) {
        indexContent = indexContent.replace(
          /(## Queries\n)/,
          `$1${entry}\n`
        )
      } else {
        indexContent = indexContent.trimEnd() + "\n\n## Queries\n" + entry + "\n"
      }
      await writeFile(indexPath, indexContent)

      // Append to log.md
      const logPath = `${pp}/wiki/log.md`
      let logContent = ""
      try {
        logContent = await readFile(logPath)
      } catch {
        logContent = "# Wiki Log\n\n"
      }
      const logEntry = `- ${date}: Saved query page \`${fileName}\`\n`
      await writeFile(logPath, logContent.trimEnd() + "\n" + logEntry)

      // Refresh file tree and update graph
      const tree = await listDirectory(pp)
      setFileTree(tree)
      useWikiStore.getState().bumpDataVersion()

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)

      // Full auto-ingest: extract entities, concepts, cross-references from saved content
      const llmConfig = useWikiStore.getState().llmConfig
      if (llmConfig.apiKey || llmConfig.provider === "ollama" || llmConfig.provider === "wps") {
        const { autoIngest } = await import("@/lib/ingest")
        autoIngest(pp, filePath, llmConfig).catch((err) =>
          console.error("Failed to auto-ingest saved query:", err)
        )
      }
    } catch (err) {
      console.error("Failed to save to wiki:", err)
    } finally {
      setSaving(false)
    }
  }, [project, content, saving, setFileTree, t])

  if (!visible && !saved) return null

  return (
    <Button
      type="button"
      onClick={handleSave}
      disabled={saving}
      title={t("chat.saveToWiki")}
      sx={{
        alignSelf: "flex-start",
        minWidth: 0,
        px: 1,
        py: 0.25,
        fontSize: "0.6875rem",
        textTransform: "none",
        color: "text.secondary",
        "&:hover": {
          color: "primary.main",
          bgcolor: "rgba(194, 65, 12, 0.06)",
        },
      }}
      startIcon={<BookmarkAddIcon sx={{ fontSize: 12 }} />}
    >
      {saved ? t("chat.saved") : saving ? t("chat.saving") : t("chat.saveToWiki")}
    </Button>
  )
}

interface CitedPage {
  title: string
  path: string
}

const REF_TYPE_CONFIG: Record<string, { Icon: SvgIconComponent; sxColor: Record<string, string> }> = {
  entity: { Icon: GroupIcon, sxColor: { color: "info.main" } },
  concept: { Icon: LightbulbIcon, sxColor: { color: "secondary.main" } },
  source: { Icon: MenuBookIcon, sxColor: { color: "warning.main" } },
  query: { Icon: HelpOutlineOutlinedIcon, sxColor: { color: "success.main" } },
  synthesis: { Icon: MergeIcon, sxColor: { color: "error.light" } },
  comparison: { Icon: BarChartIcon, sxColor: { color: "success.light" } },
  overview: { Icon: ViewModuleIcon, sxColor: { color: "warning.light" } },
  clip: { Icon: PublicIcon, sxColor: { color: "info.light" } },
}

function getRefType(path: string): string {
  if (path.includes("/entities/")) return "entity"
  if (path.includes("/concepts/")) return "concept"
  if (path.includes("/sources/")) return "source"
  if (path.includes("/queries/")) return "query"
  if (path.includes("/synthesis/")) return "synthesis"
  if (path.includes("/comparisons/")) return "comparison"
  if (path.includes("overview")) return "overview"
  if (path.includes("raw/sources/")) return "clip"
  return "source"
}

function CitedReferencesPanel({ content, savedReferences }: { content: string; savedReferences?: CitedPage[] }) {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const [expanded, setExpanded] = useState(false)

  // Use saved references first (persisted with message), fall back to dynamic extraction
  const citedPages = useMemo(() => {
    if (savedReferences && savedReferences.length > 0) return savedReferences
    return extractCitedPages(content)
  }, [content, savedReferences])

  if (citedPages.length === 0) return null

  const MAX_COLLAPSED = 3
  const visiblePages = expanded ? citedPages : citedPages.slice(0, MAX_COLLAPSED)
  const hasMore = citedPages.length > MAX_COLLAPSED

  return (
    <Box
      sx={{
        borderRadius: 1,
        border: 1,
        borderColor: "divider",
        bgcolor: (theme) =>
          theme.palette.mode === "light" ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.04)",
        fontSize: "0.75rem",
        mb: 0.5,
      }}
    >
      <Button
        type="button"
        fullWidth
        onClick={() => hasMore && setExpanded(!expanded)}
        sx={{
          justifyContent: "flex-start",
          gap: 0.75,
          px: 1,
          py: 0.5,
          minHeight: 0,
          textTransform: "none",
          fontSize: "0.75rem",
          color: "text.secondary",
          "&:hover": { color: "text.primary", bgcolor: "action.hover" },
        }}
        startIcon={<DescriptionIcon sx={{ fontSize: 12, flexShrink: 0 }} />}
        endIcon={
          hasMore ? (
            expanded ? (
              <ExpandMoreIcon sx={{ fontSize: 12, ml: "auto" }} />
            ) : (
              <ChevronRightIcon sx={{ fontSize: 12, ml: "auto" }} />
            )
          ) : undefined
        }
      >
        <Typography component="span" variant="caption" sx={{ fontWeight: 600 }}>
          {t("chat.references")} ({citedPages.length})
        </Typography>
      </Button>
      <Box sx={{ px: 1, pb: 1 }}>
        {visiblePages.map((page, i) => {
          const refType = getRefType(page.path)
          const config = REF_TYPE_CONFIG[refType] ?? REF_TYPE_CONFIG.source
          const RefIcon = config.Icon
          return (
            <Button
              key={page.path}
              type="button"
              fullWidth
              onClick={async () => {
                if (!project) return
                const pp = normalizePath(project.path)
                // Try the given path first, then search all wiki subdirectories
                const id = getFileName(page.path.replace(/^wiki\//, "").replace(/\.md$/, ""))
                const candidates = [
                  `${pp}/${page.path}`,
                  `${pp}/wiki/entities/${id}.md`,
                  `${pp}/wiki/concepts/${id}.md`,
                  `${pp}/wiki/sources/${id}.md`,
                  `${pp}/wiki/queries/${id}.md`,
                  `${pp}/wiki/synthesis/${id}.md`,
                  `${pp}/wiki/comparisons/${id}.md`,
                  `${pp}/wiki/${id}.md`,
                ]
                for (const candidate of candidates) {
                  try {
                    await readFile(candidate)
                    setSelectedFile(candidate)
                    return
                  } catch {
                    // try next
                  }
                }
                // Last resort: set the original path anyway
                setSelectedFile(`${pp}/${page.path}`)
              }}
              title={page.path}
              sx={{
                display: "flex",
                width: 1,
                alignItems: "center",
                gap: 0.75,
                borderRadius: 1,
                px: 0.5,
                py: 0.25,
                minHeight: 0,
                justifyContent: "flex-start",
                textTransform: "none",
                fontSize: "0.75rem",
                color: "text.primary",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: "0.625rem",
                  color: "text.secondary",
                  width: 16,
                  flexShrink: 0,
                  textAlign: "right",
                  opacity: 0.7,
                }}
              >
                [{i + 1}]
              </Typography>
              <RefIcon sx={{ fontSize: 12, flexShrink: 0, ...config.sxColor }} />
              <Typography variant="caption" sx={{ flex: 1, minWidth: 0, textAlign: "left" }} noWrap>
                {page.title}
              </Typography>
            </Button>
          )
        })}
        {hasMore && !expanded && (
          <Button
            type="button"
            fullWidth
            onClick={() => setExpanded(true)}
            sx={{
              mt: 0.25,
              py: 0.25,
              fontSize: "0.625rem",
              textTransform: "none",
              color: "text.secondary",
              minHeight: 0,
              "&:hover": { color: "primary.main" },
            }}
          >
            {t("chat.more", { count: citedPages.length - MAX_COLLAPSED })}
          </Button>
        )}
      </Box>
    </Box>
  )
}


/**
 * Extract cited wiki pages from the hidden <!-- cited: 1, 3, 5 --> comment.
 * Maps page numbers back to the pages that were sent to the LLM.
 */
function extractCitedPages(text: string): CitedPage[] {
  const citedMatch = text.match(/<!--\s*cited:\s*(.+?)\s*-->/)
  if (citedMatch && lastQueryPages.length > 0) {
    const numbers = citedMatch[1]
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= lastQueryPages.length)

    const pages = numbers.map((n) => lastQueryPages[n - 1])
    if (pages.length > 0) return pages
  }

  // Fallback: if LLM used [1], [2] notation in text, try to match those
  if (lastQueryPages.length > 0) {
    const numberRefs = text.match(/\[(\d+)\]/g)
    if (numberRefs) {
      const numbers = [...new Set(numberRefs.map((r) => parseInt(r.slice(1, -1), 10)))]
        .filter((n) => n >= 1 && n <= lastQueryPages.length)
      if (numbers.length > 0) {
        return numbers.map((n) => lastQueryPages[n - 1])
      }
    }
  }

  // Fallback for persisted messages: extract [[wikilinks]] from the text
  // Try to resolve each wikilink to a real file path by checking common wiki subdirectories
  const wikilinks = text.match(/\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g)
  if (wikilinks) {
    const seen = new Set<string>()
    const pages: CitedPage[] = []
    const WIKI_DIRS = ["entities", "concepts", "sources", "queries", "synthesis", "comparisons"]

    for (const link of wikilinks) {
      const nameMatch = link.match(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/)
      if (nameMatch) {
        const id = nameMatch[1].trim()
        const display = nameMatch[2]?.trim() || id

        // Skip if id contains path separators (already a path like queries/xxx)
        if (seen.has(id)) continue
        seen.add(id)

        // Try to find the file in known wiki subdirectories
        let resolvedPath = ""
        if (id.includes("/")) {
          // Already has directory like "queries/my-query"
          resolvedPath = `wiki/${id}.md`
        } else {
          // Search in common directories
          for (const dir of WIKI_DIRS) {
            resolvedPath = `wiki/${dir}/${id}.md`
            // We can't do async file checking here, so try all known patterns
            // The click handler will try multiple paths
            break // Use first candidate, click handler resolves the rest
          }
          if (!resolvedPath) resolvedPath = `wiki/${id}.md`
        }

        pages.push({ title: display, path: resolvedPath })
      }
    }
    if (pages.length > 0) return pages
  }

  // No citations found
  return []
}

interface StreamingMessageProps {
  content: string
}

export function StreamingMessage({ content }: StreamingMessageProps) {
  const { thinking, answer } = useMemo(() => separateThinking(content), [content])
  const isThinking = thinking !== null && answer.length === 0

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
      <Box
        sx={{
          display: "flex",
          height: 28,
          width: 28,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "10px",
          bgcolor: "rgba(194, 65, 12, 0.06)",
          color: "primary.main",
        }}
      >
        <SmartToyIcon sx={{ fontSize: 14 }} />
      </Box>
      <Box
        sx={{
          maxWidth: "80%",
          borderRadius: "14px",
          px: 1.75,
          py: 1.25,
          fontSize: "0.875rem",
          bgcolor: "background.paper2",
          color: "text.primary",
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        {isThinking ? (
          <StreamingThinkingBlock content={thinking} />
        ) : (
          <>
            {thinking && <ThinkingBlock content={thinking} />}
            <MarkdownContent content={answer} />
            <Box
              component="span"
              sx={{
                display: "inline-block",
                animation: `${pulseAnim} 1.5s ease-in-out infinite`,
              }}
            >
              ▊
            </Box>
          </>
        )}
      </Box>
    </Stack>
  )
}

function MarkdownContent({ content }: { content: string }) {
  const cleaned = content.replace(/<!--.*?-->/gs, "").trimEnd()
  const { thinking, answer } = useMemo(() => separateThinking(cleaned), [cleaned])
  const processed = useMemo(() => processContent(answer), [answer])

  const project = useWikiStore((s) => s.project)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setFileContent = useWikiStore((s) => s.setFileContent)

  const onWikilinkClick = useCallback(
    async (pageName: string) => {
      if (!project) return
      const pp = normalizePath(project.path)
      const dirs = ["entities", "concepts", "sources", "synthesis", "comparisons", "queries", ""]
      for (const dir of dirs) {
        const tryPath = dir ? `${pp}/wiki/${dir}/${pageName}.md` : `${pp}/wiki/${pageName}.md`
        try {
          const fc = await readFile(tryPath)
          setSelectedFile(tryPath)
          setFileContent(fc)
          return
        } catch {
          // try next
        }
      }
    },
    [project, setSelectedFile, setFileContent],
  )

  return (
    <Box>
      {thinking && <ThinkingBlock content={thinking} />}
      <MarkdownView
        markdown={processed}
        sx={{ fontSize: "0.875rem" }}
        onWikilinkClick={onWikilinkClick}
      />
    </Box>
  )
}

/**
 * Separate <redacted_thinking>...</redacted_thinking> blocks from the main answer.
 * Handles multiple think blocks and partial (unclosed) thinking during streaming.
 */
function separateThinking(text: string): { thinking: string | null; answer: string } {
  // Match complete <redacted_thinking>...</redacted_thinking> and <thinking>...</thinking> blocks
  const thinkRegex = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi
  const thinkParts: string[] = []
  let answer = text

  let match: RegExpExecArray | null
  while ((match = thinkRegex.exec(text)) !== null) {
    thinkParts.push(match[1].trim())
  }
  answer = answer.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").trim()

  // Handle unclosed <redacted_thinking> or <thinking> tag (streaming in progress)
  const unclosedMatch = answer.match(/<think(?:ing)?>([\s\S]*)$/i)
  if (unclosedMatch) {
    thinkParts.push(unclosedMatch[1].trim())
    answer = answer.replace(/<think(?:ing)?>[\s\S]*$/i, "").trim()
  }

  const thinking = thinkParts.length > 0 ? thinkParts.join("\n\n") : null
  return { thinking, answer }
}

/** Streaming thinking: shows latest ~5 lines rolling upward with animation */
function StreamingThinkingBlock({ content }: { content: string }) {
  const { t } = useTranslation()
  const lines = content.split("\n").filter((l) => l.trim())
  const visibleLines = lines.slice(-5)

  return (
    <Box
      sx={{
        borderRadius: "10px",
        border: "1px dashed",
        borderColor: "rgba(194, 65, 12, 0.2)",
        bgcolor: "rgba(194, 65, 12, 0.03)",
        px: 1.25,
        py: 1,
      }}
    >
      <Stack direction="row" spacing={0.75} sx={{ mb: 1, alignItems: "center" }}>
        <Box
          component="span"
          sx={{ fontSize: "0.75rem", animation: `${pulseAnim} 1.5s ease-in-out infinite`, color: "primary.main" }}
        >
          &#x25CF;
        </Box>
        <Typography variant="caption" sx={{ fontWeight: 600, color: "primary.main" }}>
          {t("chat.thinking")}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: "0.625rem", color: "text.tertiary" }}>
          {t("chat.lines", { count: lines.length })}
        </Typography>
      </Stack>
      <Box
        sx={{
          height: "5lh",
          overflow: "hidden",
          fontSize: "0.75rem",
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          lineHeight: 1.6,
          color: "#78716C",
        }}
      >
        {visibleLines.map((line, i) => (
          <Box
            key={lines.length - 5 + i}
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              opacity: 0.3 + (i / Math.max(visibleLines.length, 1)) * 0.7,
            }}
          >
            {line}
          </Box>
        ))}
        <Box
          component="span"
          sx={{ color: "primary.main", animation: `${pulseAnim} 1.5s ease-in-out infinite` }}
        >
          ▊
        </Box>
      </Box>
    </Box>
  )
}

/** Completed thinking: collapsed by default, click to expand */
function ThinkingBlock({ content }: { content: string }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const lines = content.split("\n").filter((l) => l.trim())

  return (
    <Box
      sx={{
        mb: 1,
        borderRadius: "10px",
        border: "1px dashed",
        borderColor: "rgba(194, 65, 12, 0.15)",
        bgcolor: "rgba(194, 65, 12, 0.02)",
      }}
    >
      <Button
        type="button"
        fullWidth
        onClick={() => setExpanded(!expanded)}
        sx={{
          justifyContent: "flex-start",
          gap: 0.75,
          px: 1.25,
          py: 0.75,
          minHeight: 0,
          textTransform: "none",
          fontSize: "0.75rem",
          color: "text.secondary",
          "&:hover": { bgcolor: "rgba(194, 65, 12, 0.04)" },
        }}
      >
        <Box component="span" sx={{ fontSize: "0.625rem", color: "primary.main" }}>
          &#x25CF;
        </Box>
        <Typography variant="caption" sx={{ flex: 1, textAlign: "left", fontWeight: 600 }}>
          {t("chat.thoughtForLines", { count: lines.length })}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.tertiary" }}>
          {expanded ? "▼" : "▶"}
        </Typography>
      </Button>
      {expanded && (
        <Box
          sx={{
            borderTop: "1px solid",
            borderColor: "rgba(194, 65, 12, 0.1)",
            px: 1.25,
            py: 1,
            fontSize: "0.75rem",
            color: "#78716C",
            whiteSpace: "pre-wrap",
            maxHeight: 256,
            overflowY: "auto",
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            lineHeight: 1.6,
          }}
        >
          {content}
        </Box>
      )}
    </Box>
  )
}

/**
 * Process content to create clickable links:
 * - [[wikilinks]] → markdown links with wikilink: protocol
 */
function processContent(text: string): string {
  let result = text

  // Wrap bare \begin{...}...\end{...} blocks with $$ for remark-math
  result = result.replace(
    /(?<!\$\$\s*)(\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\})(?!\s*\$\$)/g,
    (_match, block: string) => `$$\n${block}\n$$`,
  )

  // Only apply Unicode conversion to text outside of math delimiters
  // Split on $$...$$ and $...$ blocks, only convert non-math parts
  const parts = result.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g)
  result = parts
    .map((part) => {
      if (part.startsWith("$")) return part // preserve math
      return convertLatexToUnicode(part)
    })
    .join("")

  // Fix malformed wikilinks like [[name] (missing closing bracket)
  result = result.replace(/\[\[([^\]]+)\](?!\])/g, "[[$1]]")

  // Convert [[wikilinks]] to markdown links (wiki: scheme) for TipTap Link + MarkdownView
  result = result.replace(
    /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
    (_match, pageName: string, displayText?: string) => {
      const display = displayText?.trim() || pageName.trim()
      const target = pageName.trim()
      return `[${display}](wiki:${encodeURIComponent(target)})`
    },
  )

  return result
}
