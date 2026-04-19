import { useEffect, useCallback, useRef, useMemo } from "react"
import Box from "@mui/material/Box"
import Chip from "@mui/material/Chip"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import { useTranslation } from "react-i18next"
import { useWikiStore, isNewTab } from "@/stores/wiki-store"
import { readFile, writeFile } from "@/commands/fs"
import { getFileCategory, isBinary, needsPreprocess } from "@/lib/file-types"
import { splitFrontmatter } from "@/lib/path-utils"
import { WikiEditor } from "@/components/editor/wiki-editor"
import { FilePreview } from "@/components/editor/file-preview"
import { parseFrontmatter } from "@/lib/frontmatter"
import type { FrontmatterFields } from "@/lib/frontmatter"
import Description from "@mui/icons-material/Description"
import NoteAddOutlined from "@mui/icons-material/NoteAddOutlined"
import InboxOutlined from "@mui/icons-material/InboxOutlined"

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  entity:     { bg: "rgba(55,53,47,0.08)",  text: "#37352F" },
  concept:    { bg: "rgba(147,51,234,0.08)", text: "#7C3AED" },
  source:     { bg: "rgba(180,83,9,0.08)",  text: "#92400E" },
  synthesis:  { bg: "rgba(220,38,38,0.08)", text: "#B91C1C" },
  comparison: { bg: "rgba(5,150,105,0.08)", text: "#065F46" },
  query:      { bg: "rgba(5,150,105,0.08)", text: "#065F46" },
  overview:   { bg: "rgba(217,119,6,0.08)", text: "#92400E" },
}

function setOrInsertFrontmatterField(frontmatter: string, key: string, value: string): string {
  const line = `${key}: ${value}`
  const re = new RegExp(`^${key}:\\s*.*$`, "m")
  if (re.test(frontmatter)) return frontmatter.replace(re, line)
  return `${frontmatter}\n${line}`.trim()
}

function inferCanonicalTypeFromPath(relativePath: string): string | null {
  if (relativePath === "wiki/overview.md") return "overview"
  if (relativePath.includes("/entities/")) return "entity"
  if (relativePath.includes("/concepts/")) return "concept"
  if (/^wiki\/sources\/[^/]+\.md$/.test(relativePath)) return "source"
  return null
}

function inferCanonicalTitleFromPath(relativePath: string): string | null {
  if (relativePath === "wiki/overview.md") return "Wiki 总览"
  const m = relativePath.match(/^wiki\/sources\/.+\/(entities|concepts)\/([^/]+)\.md$/)
  if (m) return m[2].replace(/-/g, " ").trim()
  const sourceSummary = relativePath.match(/^wiki\/sources\/([^/]+)\.md$/)
  if (sourceSummary) return sourceSummary[1].replace(/-/g, " ").trim()
  return null
}

function buildOverviewScaffold(): string {
  const date = new Date().toISOString().slice(0, 10)
  return [
    "---",
    "type: overview",
    "title: Wiki 总览",
    `created: ${date}`,
    `updated: ${date}`,
    "tags: []",
    "related: []",
    "---",
    "",
    "# Wiki 总览",
    "",
    "## 知识范围",
    "- 请在此总结当前 Wiki 覆盖的主题、实体和关键结论。",
    "",
    "## 最近变化",
    "- 暂无记录",
    "",
  ].join("\n")
}

function normalizeWikiContentByPath(relativePath: string, content: string): string {
  if (relativePath === "wiki/overview.md" && !content.trim()) {
    return buildOverviewScaffold()
  }
  const m = content.match(/^(---\n)([\s\S]*?)(\n---\n?)([\s\S]*)$/)
  if (!m) return content
  const expectedType = inferCanonicalTypeFromPath(relativePath)
  const expectedTitle = inferCanonicalTitleFromPath(relativePath)
  if (!expectedType && !expectedTitle) return content

  let fm = m[2]
  if (expectedType) fm = setOrInsertFrontmatterField(fm, "type", expectedType)
  if (expectedTitle) fm = setOrInsertFrontmatterField(fm, "title", expectedTitle)
  return `---\n${fm}\n---\n${m[4]}`
}

// ── FrontmatterBadge component ──────────────────────────────────
function FrontmatterBadge({ fields }: { fields: FrontmatterFields }) {
  const { type, created, updated, tags } = fields

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "5px 8px",
        pb: 2,
        mb: 2.5,
        borderBottom: "1px solid rgba(55,53,47,0.09)",
      }}
    >
      {type && (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            height: 20,
            px: "7px",
            borderRadius: "4px",
            fontSize: "10.5px",
            fontWeight: 600,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            bgcolor: TYPE_COLORS[type]?.bg ?? "rgba(55,53,47,0.06)",
            color: TYPE_COLORS[type]?.text ?? "rgba(55,53,47,0.55)",
          }}
        >
          {type}
        </Box>
      )}

      {(created || updated) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          {created && (
            <Typography
              variant="caption"
              sx={{ color: "rgba(55,53,47,0.45)", fontSize: "11.5px", fontWeight: 400 }}
            >
              {created}
            </Typography>
          )}
          {updated && updated !== created && (
            <Typography
              variant="caption"
              sx={{ color: "rgba(55,53,47,0.3)", fontSize: "11.5px" }}
            >
              · 更新 {updated}
            </Typography>
          )}
        </Box>
      )}

      {tags && tags.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {tags.map((tag, idx) => (
            <Chip
              key={`${tag}-${idx}`}
              label={tag}
              size="small"
              sx={{
                height: 19,
                fontSize: "11px",
                fontWeight: 450,
                bgcolor: "rgba(55,53,47,0.05)",
                color: "rgba(55,53,47,0.6)",
                border: "none",
                "& .MuiChip-label": { px: 0.8 },
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

// ── EditorArea ──────────────────────────────────────────────────
export function EditorArea() {
  const { t } = useTranslation()
  const activeTabPath = useWikiStore((s) => s.activeTabPath)
  const activeTabId = useWikiStore((s) => s.activeTabId)
  const openTabs = useWikiStore((s) => s.openTabs)
  const fileContent = useWikiStore((s) => s.fileContent)
  const setFileContent = useWikiStore((s) => s.setFileContent)
  const project = useWikiStore((s) => s.project)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readGenRef = useRef(0)

  const activeTab = openTabs.find((t) => t.id === activeTabId)
  const isBlankTab = !!activeTab && isNewTab(activeTab.path)

  useEffect(() => {
    const gen = ++readGenRef.current

    if (!activeTabPath || isNewTab(activeTabPath) || !project) {
      setFileContent("")
      return
    }

    const category = getFileCategory(activeTabPath)
    if (isBinary(category)) {
      setFileContent("")
      return
    }

    if (needsPreprocess(category)) {
      readFile(project.id, activeTabPath + ".cache.txt")
        .then((content) => { if (readGenRef.current === gen) setFileContent(content) })
        .catch(() => { if (readGenRef.current === gen) setFileContent("__NO_CACHE__") })
      return
    }

    readFile(project.id, activeTabPath)
      .then((content) => {
        if (readGenRef.current !== gen) return
        const normalized = normalizeWikiContentByPath(activeTabPath, content)
        setFileContent(normalized)
        if (normalized !== content) {
          writeFile(project.id, activeTabPath, normalized).catch((err) =>
            console.error("Failed to auto-normalize wiki file:", err),
          )
        }
      })
      .catch((err) => { if (readGenRef.current === gen) setFileContent(t("preview.errorLoading", { err })) })
  }, [activeTabPath, setFileContent, t, project])

  const { frontmatter, body: markdownBody } = splitFrontmatter(fileContent)
  const fmFields = useMemo(() => parseFrontmatter(frontmatter), [frontmatter])
  const hasFrontmatter = !!frontmatter && Object.keys(fmFields).length > 0

  const handleSave = useCallback(
    (markdown: string) => {
      if (!activeTabPath || isNewTab(activeTabPath) || !project) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        writeFile(project.id, activeTabPath, frontmatter + markdown).catch((err) =>
          console.error("Failed to save:", err)
        )
      }, 1000)
    },
    [activeTabPath, frontmatter, project]
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // No tabs at all
  if (openTabs.length === 0 || !activeTabId) {
    return (
      <Box
        sx={{
          display: "flex",
          height: "100%",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1.5,
          userSelect: "none",
        }}
      >
        <Description sx={{ fontSize: 40, opacity: 0.1, color: "text.secondary" }} />
        <Typography sx={{ color: "text.secondary", opacity: 0.4, fontSize: "0.875rem" }}>
          {t("editor.noFileOpen")}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.25 }}>
          {t("editor.openFromSidebar")}
        </Typography>
      </Box>
    )
  }

  // Blank tab placeholder
  if (isBlankTab) {
    return (
      <Box
        sx={{
          display: "flex",
          height: "100%",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1.5,
          userSelect: "none",
        }}
      >
        <NoteAddOutlined sx={{ fontSize: 40, opacity: 0.1, color: "text.secondary" }} />
        <Typography sx={{ color: "text.secondary", opacity: 0.4, fontSize: "0.875rem" }}>
          {t("editor.newTab")}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.25 }}>
          {t("editor.openFromSidebar")}
        </Typography>
      </Box>
    )
  }

  const category = getFileCategory(activeTabPath!)

  if (category !== "markdown") {
    return (
      <Box sx={{ display: "flex", height: "100%", overflow: "hidden" }}>
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <FilePreview key={activeTabPath!} projectId={project?.id ?? ""} filePath={activeTabPath!} textContent={fileContent} />
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ display: "flex", height: "100%", flexDirection: "column", overflow: "hidden", bgcolor: "background.default" }}>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <Box
          sx={{
            maxWidth: 720,
            mx: "auto",
            px: { xs: 3, md: 6 },
            pt: 5,
            pb: 10,
          }}
        >
          {/* Page title from frontmatter — Notion H1 style */}
          {fmFields.title && (
            <Typography
              component="h1"
              sx={{
                fontFamily: "'DM Sans', 'PingFang SC', 'Noto Sans SC', sans-serif",
                fontSize: "2.5rem",
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: "-0.03em",
                color: "#1a1a17",
                mb: 1.5,
              }}
            >
              {fmFields.title}
            </Typography>
          )}

          {/* Metadata badges */}
          {hasFrontmatter && <FrontmatterBadge fields={fmFields} />}

          {/* Empty file placeholder — shown when file has no content at all */}
          {!fileContent.trim() && !fmFields.title && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                py: 10,
                userSelect: "none",
              }}
            >
              <InboxOutlined sx={{ fontSize: 36, opacity: 0.1, color: "text.secondary" }} />
              <Box sx={{ textAlign: "center" }}>
                <Typography sx={{ color: "text.secondary", opacity: 0.5, fontSize: "0.875rem", mb: 0.5 }}>
                  {t("editor.emptyFile")}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.3, display: "block" }}>
                  {t("editor.emptyFileReason")}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  useWikiStore.getState().setActiveView("sources")
                }}
                sx={{
                  fontSize: "0.75rem",
                  borderColor: "rgba(55,53,47,0.15)",
                  color: "text.secondary",
                  "&:hover": { borderColor: "rgba(194,65,12,0.4)", color: "#C2410C", bgcolor: "rgba(194,65,12,0.04)" },
                }}
              >
                {t("editor.goToSources")}
              </Button>
            </Box>
          )}

          {/* Markdown body editor */}
          <WikiEditor key={activeTabPath!} content={markdownBody} onSave={handleSave} />
        </Box>
      </Box>
    </Box>
  )
}
