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
import { useWikilinkNavigation } from "@/hooks/use-wikilink-navigation"
import { startServerIngest } from "@/commands/ingest"
import { lastQueryPages } from "@/components/chat/chat-panel"
import type { DisplayMessage } from "@/stores/chat-store"
import type { FileNode } from "@/types/wiki"

import { convertLatexToUnicode } from "@/lib/latex-to-unicode"
import { getFileName } from "@/lib/path-utils"
import { MarkdownView } from "@/components/ui/markdown-view"

// Module-level cache of source file names
let cachedSourceFiles: string[] = []

export function useSourceFiles() {
  const project = useWikiStore((s) => s.project)

  useEffect(() => {
    if (!project) return
    listDirectory(project.id, "raw/sources")
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

/** Recursively find the first file matching `fileName` in a FileNode tree.
 *  Returns its `relativePath`, or null if not found. */
function findFileInTree(nodes: FileNode[], fileName: string): string | null {
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      const found = findFileInTree(node.children, fileName)
      if (found) return found
    } else if (!node.is_dir && node.name === fileName) {
      return node.relativePath
    }
  }
  return null
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

// S1/S2: three-dot bounce for typing indicator and thinking state
const dotBounce = keyframes`
  0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
  30% { transform: translateY(-3px); opacity: 0.9; }
`

// S3: sharp blinking line caret (step-end = instant on/off, like a real cursor)
const caretBlink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`

export function ChatMessage({ message, isLastAssistant, onRegenerate }: ChatMessageProps) {
  const { t } = useTranslation()
  const isUser = message.role === "user"
  const isSystem = message.role === "system"
  const isAssistant = message.role === "assistant"
  const [hovered, setHovered] = useState(false)

  const timeStr = useMemo(() => {
    if (!message.timestamp) return ""
    const d = new Date(message.timestamp)
    if (isNaN(d.getTime())) return ""
    return d.toLocaleTimeString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
  }, [message.timestamp])

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
                  bgcolor: "rgba(35,131,226,0.07)",
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
            fontSize: isUser ? "0.875rem" : "0.8125rem",
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
        {timeStr && (
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.625rem",
              color: "text.disabled",
              px: 0.5,
              alignSelf: isUser ? "flex-end" : "flex-start",
            }}
          >
            {timeStr}
          </Typography>
        )}
        {isAssistant && <CitedReferencesPanel content={message.content} savedReferences={message.references} />}
        {isAssistant && (
          <Stack
            direction="row"
            spacing={0.5}
            useFlexGap
            sx={{
              flexWrap: "wrap",
              alignItems: "center",
              opacity: hovered ? 1 : 0,
              transition: "opacity 0.15s ease",
              pointerEvents: hovered ? "auto" : "none",
            }}
          >
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
                    bgcolor: "rgba(35,131,226,0.06)",
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
          bgcolor: "rgba(35,131,226,0.06)",
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
      const filePath = `wiki/queries/${fileName}`

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

      await writeFile(project.id, filePath, frontmatter + cleanContent)

      // Update index.md — append under ## Queries section
      let indexContent = ""
      try {
        indexContent = await readFile(project.id, "wiki/index.md")
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
      await writeFile(project.id, "wiki/index.md", indexContent)

      // Append to log.md
      let logContent = ""
      try {
        logContent = await readFile(project.id, "wiki/log.md")
      } catch {
        logContent = "# Wiki Log\n\n"
      }
      const logEntry = `- ${date}: Saved query page \`${fileName}\`\n`
      await writeFile(project.id, "wiki/log.md", logContent.trimEnd() + "\n" + logEntry)

      // Refresh file tree and update graph
      const tree = await listDirectory(project.id)
      setFileTree(tree)
      useWikiStore.getState().bumpDataVersion()

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)

      // Auto-ingest via server: extract entities, concepts, cross-references from saved content
      startServerIngest({ projectId: project.id, sourcePath: filePath }).catch((err) =>
        console.error("Failed to auto-ingest saved query:", err)
      )
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
  relativePath: string
}

const REF_TYPE_CONFIG: Record<string, { Icon: SvgIconComponent; sxColor: Record<string, string> }> = {
  entity: { Icon: GroupIcon, sxColor: { color: "info.main" } },
  concept: { Icon: LightbulbIcon, sxColor: { color: "secondary.main" } },
  source: { Icon: MenuBookIcon, sxColor: { color: "#0891b2" } },
  query: { Icon: HelpOutlineOutlinedIcon, sxColor: { color: "success.main" } },
  synthesis: { Icon: MergeIcon, sxColor: { color: "error.light" } },
  comparison: { Icon: BarChartIcon, sxColor: { color: "success.light" } },
  overview: { Icon: ViewModuleIcon, sxColor: { color: "primary.main" } },
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
          const refType = getRefType(page.relativePath)
          const config = REF_TYPE_CONFIG[refType] ?? REF_TYPE_CONFIG.source
          const RefIcon = config.Icon
          return (
            <Button
              key={page.relativePath}
              type="button"
              fullWidth
              onClick={async () => {
                if (!project) return
                // Try the given path first, then search all wiki subdirectories
                const id = getFileName(page.relativePath.replace(/^wiki\//, "").replace(/\.md$/, ""))
                const candidates = [
                  page.relativePath,
                  // Legacy global paths (pre-namespace)
                  `wiki/entities/${id}.md`,
                  `wiki/concepts/${id}.md`,
                  `wiki/sources/${id}.md`,
                  `wiki/queries/${id}.md`,
                  `wiki/synthesis/${id}.md`,
                  `wiki/comparisons/${id}.md`,
                  `wiki/${id}.md`,
                ]
                for (const candidate of candidates) {
                  try {
                    await readFile(project.id, candidate)
                    setSelectedFile(candidate)
                    return
                  } catch {
                    // try next
                  }
                }
                // Namespace fallback: scan wiki/sources/<stem>/entities|concepts/
                try {
                  const sourcesTree = await listDirectory(project.id, "wiki/sources")
                  const found = findFileInTree(sourcesTree, `${id}.md`)
                  if (found) { setSelectedFile(found); return }
                } catch { /* ignore */ }
                // Last resort: set the original path anyway
                setSelectedFile(page.relativePath)
              }}
              title={page.relativePath}
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

        pages.push({ title: display, relativePath: resolvedPath })
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
  // S1: no content yet — bare typing indicator, no bubble wrapper
  const isWaiting = content.length === 0
  // S2: thinking in progress — show thinking stream
  const isThinking = !isWaiting && thinking !== null && answer.length === 0
  // S3: answer streaming — show content + line caret

  const avatarSx = {
    display: "flex",
    height: 28,
    width: 28,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "10px",
    bgcolor: "rgba(35,131,226,0.07)",
    color: "primary.main",
  } as const

  // S1 — no bubble, just dots floating next to the avatar (iMessage style)
  if (isWaiting) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Box sx={avatarSx}>
          <SmartToyIcon sx={{ fontSize: 14 }} />
        </Box>
        <TypingIndicator />
      </Stack>
    )
  }

  // S2 — thinking in progress: minimal, no full bubble border
  if (isThinking) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Box sx={avatarSx}>
          <SmartToyIcon sx={{ fontSize: 14 }} />
        </Box>
        <Box sx={{ maxWidth: "80%", pt: 0.5 }}>
          <StreamingThinkingBlock content={thinking!} />
        </Box>
      </Stack>
    )
  }

  // S3 — answer streaming: full bubble with content + blinking caret
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
      <Box sx={avatarSx}>
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
        {thinking && <ThinkingBlock content={thinking} />}
        <MarkdownContent content={answer} />
        <Box
          component="span"
          sx={{
            display: "inline-block",
            width: "1.5px",
            height: "0.85em",
            bgcolor: "text.secondary",
            verticalAlign: "text-bottom",
            ml: "1px",
            animation: `${caretBlink} 1.1s step-end infinite`,
          }}
        />
      </Box>
    </Stack>
  )
}

/** S1: three bouncing dots — signals "model is thinking, waiting for first token" */
function TypingIndicator() {
  return (
    <Box sx={{ display: "flex", gap: "5px", alignItems: "center", height: "20px" }}>
      {([0, 0.16, 0.32] as const).map((delay) => (
        <Box
          key={delay}
          sx={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            bgcolor: "text.disabled",
            animation: `${dotBounce} 1.2s ease-in-out infinite`,
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </Box>
  )
}

function MarkdownContent({ content }: { content: string }) {
  const cleaned = content.replace(/<!--.*?-->/gs, "").trimEnd()
  const { thinking, answer } = useMemo(() => separateThinking(cleaned), [cleaned])
  const processed = useMemo(() => processContent(answer), [answer])

  const onWikilinkClick = useWikilinkNavigation()

  return (
    <Box
      sx={{
        // Cascade into TipTap with doubled specificity (&&) to beat MarkdownView's built-in rules
        "&& .tiptap": {
          lineHeight: 1.72,
        },
        // Headings: differentiated by weight + subtle size, NOT document-scale sizes
        "&& .tiptap h1": {
          fontSize: "0.9375rem",
          fontWeight: 700,
          letterSpacing: "-0.015em",
          lineHeight: 1.25,
          margin: "0.9em 0 0.2em",
          color: "text.primary",
        },
        "&& .tiptap h2": {
          fontSize: "0.875rem",
          fontWeight: 700,
          letterSpacing: "-0.01em",
          lineHeight: 1.25,
          margin: "0.8em 0 0.15em",
          color: "text.primary",
        },
        "&& .tiptap h3": {
          fontSize: "0.8125rem",
          fontWeight: 600,
          lineHeight: 1.25,
          margin: "0.65em 0 0.1em",
          color: "text.secondary",
        },
        "&& .tiptap p": {
          margin: "0.3em 0",
          lineHeight: 1.72,
        },
        // Remove top margin on first child so content doesn't float away from bubble top
        "&& .tiptap > *:first-child": {
          marginTop: "0 !important",
        },
        "&& .tiptap ul, && .tiptap ol": {
          margin: "0.3em 0",
          paddingLeft: "1.5em",
        },
        "&& .tiptap li": {
          margin: "0.1em 0",
          lineHeight: 1.65,
        },
        // Prevent double margin when a list item wraps in a <p>
        "&& .tiptap li > p": {
          margin: 0,
        },
        "&& .tiptap code:not(pre code)": {
          fontSize: "0.75rem",
          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          borderRadius: "3px",
          px: "0.35em",
          py: "0.1em",
          bgcolor: "action.hover",
        },
        "&& .tiptap hr": {
          border: "none",
          borderTop: "1px solid",
          borderColor: "divider",
          margin: "0.65em 0",
          opacity: 0.5,
        },
        "&& .tiptap blockquote": {
          margin: "0.4em 0",
          paddingLeft: "0.85em",
          borderLeft: "2.5px solid",
          borderColor: "primary.main",
          opacity: 0.85,
        },
        "&& .tiptap pre": {
          fontSize: "0.75rem",
          margin: "0.4em 0",
          borderRadius: "6px",
          lineHeight: 1.55,
        },
      }}
    >
      {thinking && <ThinkingBlock content={thinking} />}
      <MarkdownView
        markdown={processed}
        sx={{ fontSize: "0.75rem" }}
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

/**
 * S2: Thinking stream — restrained, high-end design.
 * No bounding box. Left accent line + bouncing dots + last 3 lines fading in from top.
 */
function StreamingThinkingBlock({ content }: { content: string }) {
  const { t } = useTranslation()
  const lines = content.split("\n").filter((l) => l.trim())
  const visibleLines = lines.slice(-3)

  return (
    <Box sx={{ py: 0.25 }}>
      {/* Header: label + three tiny bouncing dots */}
      <Stack direction="row" spacing={0.5} sx={{ mb: 0.75, alignItems: "center" }}>
        <Typography
          variant="caption"
          sx={{ fontSize: "0.6875rem", color: "text.disabled", letterSpacing: "0.03em", mr: 0.25 }}
        >
          {t("chat.thinking")}
        </Typography>
        {([0, 0.2, 0.4] as const).map((delay) => (
          <Box
            key={delay}
            sx={{
              width: 3,
              height: 3,
              borderRadius: "50%",
              bgcolor: "primary.light",
              animation: `${dotBounce} 1.2s ease-in-out infinite`,
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </Stack>

      {/* Thinking text: left accent + top-to-bottom fade mask */}
      {visibleLines.length > 0 && (
        <Box
          sx={{
            pl: 1.25,
            borderLeft: "2px solid",
            borderColor: "primary.light",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.5) 35%, black 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.5) 35%, black 100%)",
          }}
        >
          {visibleLines.map((line, i) => (
            <Box
              key={lines.length - 3 + i}
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.6875rem",
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                color: "text.disabled",
                lineHeight: 1.65,
              }}
            >
              {line}
            </Box>
          ))}
        </Box>
      )}
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
