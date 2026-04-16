import { useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import LinkOffIcon from "@mui/icons-material/LinkOff"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined"
import RefreshIcon from "@mui/icons-material/Refresh"
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined"
import PsychologyIcon from "@mui/icons-material/Psychology"
import BuildIcon from "@mui/icons-material/Build"
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined"
import type { SvgIconComponent } from "@mui/icons-material"
import { useWikiStore } from "@/stores/wiki-store"
import { useReviewStore } from "@/stores/review-store"
import { runStructuralLint, runSemanticLint, type LintResult } from "@/lib/lint"
import { readFile, writeFile, deleteFile, listDirectory } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"
import { keyframes } from "@mui/material/styles"

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`

const typeConfig: Record<string, { icon: SvgIconComponent; labelKey: string }> = {
  orphan: { icon: LinkOffIcon, labelKey: "lint.orphan" },
  "broken-link": { icon: LinkOffIcon, labelKey: "lint.brokenLink" },
  "no-outlinks": { icon: OpenInNewIcon, labelKey: "lint.noOutlinks" },
  semantic: { icon: PsychologyIcon, labelKey: "lint.semanticIssue" },
}

export function LintView() {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const llmConfig = useWikiStore((s) => s.llmConfig)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setFileContent = useWikiStore((s) => s.setFileContent)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const setFileTree = useWikiStore((s) => s.setFileTree)
  const bumpDataVersion = useWikiStore((s) => s.bumpDataVersion)

  const [results, setResults] = useState<LintResult[]>([])
  const [running, setRunning] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [runSemantic, setRunSemantic] = useState(false)
  const [fixingId, setFixingId] = useState<string | null>(null)

  const handleRunLint = useCallback(async () => {
    if (!project || running) return
    const pp = normalizePath(project.path)
    setRunning(true)
    setResults([])
    try {
      const structural = await runStructuralLint(pp)
      let all = structural

      if (runSemantic && (llmConfig.apiKey || llmConfig.provider === "ollama" || llmConfig.provider === "wps")) {
        const semantic = await runSemanticLint(pp, llmConfig)
        all = [...structural, ...semantic]
      }

      setResults(all)
      setHasRun(true)
    } catch (err) {
      console.error("Lint failed:", err)
    } finally {
      setRunning(false)
    }
  }, [project, llmConfig, running, runSemantic])

  async function handleOpenPage(page: string) {
    if (!project) return
    const pp = normalizePath(project.path)
    const candidates = [
      `${pp}/wiki/${page}`,
      `${pp}/wiki/${page}.md`,
    ]
    setActiveView("wiki")
    for (const path of candidates) {
      try {
        const content = await readFile(path)
        setSelectedFile(path)
        setFileContent(content)
        return
      } catch {
        // try next
      }
    }
    setSelectedFile(candidates[0])
    setFileContent(t("lint.unableToLoad", { page }))
  }

  async function handleFix(result: LintResult, index: number) {
    if (!project) return
    const pp = normalizePath(project.path)
    const id = `${result.type}-${index}`
    setFixingId(id)

    try {
      switch (result.type) {
        case "orphan": {
          // Add a link to this page from index.md
          const indexPath = `${pp}/wiki/index.md`
          let indexContent = ""
          try { indexContent = await readFile(indexPath) } catch { indexContent = "# Wiki Index\n" }

          const pageName = result.page.replace(".md", "").replace(/^.*\//, "")
          const entry = `- [[${pageName}]]`
          if (!indexContent.includes(entry)) {
            indexContent = indexContent.trimEnd() + "\n" + entry + "\n"
            await writeFile(indexPath, indexContent)
          }
          // Remove from results
          setResults((prev) => prev.filter((_, i) => i !== index))
          break
        }

        case "broken-link": {
          // Option: remove the broken link from the page, or send to Review for manual fix
          const pagePath = `${pp}/wiki/${result.page}`
          useReviewStore.getState().addItem({
            type: "confirm",
            title: t("lint.fixBrokenLink", { page: result.page }),
            description: result.detail,
            affectedPages: [result.page],
            options: [
              { label: t("lint.openEdit"), action: `open:${result.page}` },
              { label: t("lint.deletePage"), action: `delete:${pagePath}` },
              { label: t("lint.skip"), action: "Skip" },
            ],
          })
          setResults((prev) => prev.filter((_, i) => i !== index))
          break
        }

        case "no-outlinks": {
          // Send to Review — user should add links manually
          useReviewStore.getState().addItem({
            type: "suggestion",
            title: t("lint.addCrossRefs", { page: result.page }),
            description: t("lint.addCrossRefsDesc"),
            affectedPages: [result.page],
            options: [
              { label: t("lint.openEdit"), action: `open:${result.page}` },
              { label: t("lint.skip"), action: "Skip" },
            ],
          })
          setResults((prev) => prev.filter((_, i) => i !== index))
          break
        }

        default: {
          // Semantic issues → send to Review for manual resolution
          useReviewStore.getState().addItem({
            type: "confirm",
            title: result.detail.slice(0, 80),
            description: result.detail,
            affectedPages: result.affectedPages ?? [result.page],
            options: [
              { label: t("lint.openEdit"), action: `open:${result.page}` },
              { label: t("lint.skip"), action: "Skip" },
            ],
          })
          setResults((prev) => prev.filter((_, i) => i !== index))
          break
        }
      }

      // Refresh tree
      const tree = await listDirectory(pp)
      setFileTree(tree)
      bumpDataVersion()
    } catch (err) {
      console.error("Fix failed:", err)
    } finally {
      setFixingId(null)
    }
  }

  async function handleDeleteOrphan(result: LintResult, index: number) {
    if (!project) return
    const pp = normalizePath(project.path)
    const pagePath = `${pp}/wiki/${result.page}`
    const confirmed = window.confirm(t("lint.deleteConfirm", { page: result.page }))
    if (!confirmed) return

    try {
      await deleteFile(pagePath)
      setResults((prev) => prev.filter((_, i) => i !== index))
      const tree = await listDirectory(pp)
      setFileTree(tree)
      bumpDataVersion()
    } catch (err) {
      console.error("Delete failed:", err)
    }
  }

  const warnings = results.filter((r) => r.severity === "warning")
  const infos = results.filter((r) => r.severity === "info")

  return (
    <Stack sx={{ height: 1 }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          px: 2,
          py: 1.5,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {t("lint.wikiLint")}
          </Typography>
          {hasRun && results.length > 0 && (
            <Typography
              component="span"
              variant="caption"
              sx={{
                borderRadius: 999,
                px: 1,
                py: 0.25,
                bgcolor: (theme) =>
                  theme.palette.mode === "light" ? "rgba(245, 158, 11, 0.2)" : "rgba(251, 191, 36, 0.15)",
                color: "warning.dark",
                fontWeight: 600,
              }}
            >
              {t("lint.issues", { count: results.length })}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={runSemantic}
                onChange={(e) => setRunSemantic(e.target.checked)}
              />
            }
            label={<Typography variant="caption" color="text.secondary">{t("lint.semantic")}</Typography>}
          />
          <Button
            size="small"
            variant="contained"
            onClick={handleRunLint}
            disabled={running || !project}
            startIcon={
              <RefreshIcon
                sx={{
                  fontSize: 16,
                  ...(running ? { animation: `${spin} 1s linear infinite` } : {}),
                }}
              />
            }
          >
            {running ? t("lint.running") : t("lint.runLint")}
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {!hasRun ? (
          <Stack
            sx={{
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              p: 4,
              textAlign: "center",
            }}
          >
            <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 36, color: "text.disabled", opacity: 0.4 }} />
            <Typography variant="body2" color="text.secondary">
              {t("lint.runLintHint")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("lint.checksHint")}
            </Typography>
          </Stack>
        ) : results.length === 0 ? (
          <Stack
            sx={{
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              p: 4,
              textAlign: "center",
            }}
          >
            <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 36, color: "success.main", opacity: 0.7 }} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: "success.main" }}>
              {t("lint.allClearTitle")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("lint.noIssuesFound")}
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={1} sx={{ p: 1.5 }}>
            {warnings.length > 0 && (
              <SectionHeader icon={WarningAmberIcon} label={t("lint.warnings")} count={warnings.length} color="warning.main" />
            )}
            {warnings.map((result, i) => (
              <LintCard
                key={`warn-${i}`}
                result={result}
                index={i}
                fixing={fixingId === `${result.type}-${i}`}
                onOpenPage={handleOpenPage}
                onFix={handleFix}
                onDelete={result.type === "orphan" ? handleDeleteOrphan : undefined}
              />
            ))}
            {infos.length > 0 && (
              <SectionHeader icon={InfoOutlinedIcon} label={t("lint.info")} count={infos.length} color="info.main" />
            )}
            {infos.map((result, i) => {
              const realIndex = warnings.length + i
              return (
                <LintCard
                  key={`info-${i}`}
                  result={result}
                  index={realIndex}
                  fixing={fixingId === `${result.type}-${realIndex}`}
                  onOpenPage={handleOpenPage}
                  onFix={handleFix}
                  onDelete={result.type === "orphan" ? handleDeleteOrphan : undefined}
                />
              )
            })}
          </Stack>
        )}
      </Box>
    </Stack>
  )
}

function SectionHeader({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon: SvgIconComponent
  label: string
  count: number
  color: string
}) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ px: 0.5, py: 0.5, alignItems: "center", color }}>
      <Icon sx={{ fontSize: 14 }} />
      <Typography variant="caption" sx={{ fontWeight: 700 }}>
        {label} ({count})
      </Typography>
    </Stack>
  )
}

function LintCard({
  result,
  index,
  fixing,
  onOpenPage,
  onFix,
  onDelete,
}: {
  result: LintResult
  index: number
  fixing: boolean
  onOpenPage: (page: string) => void
  onFix: (result: LintResult, index: number) => void
  onDelete?: (result: LintResult, index: number) => void
}) {
  const { t } = useTranslation()
  const config = typeConfig[result.type] ?? typeConfig.semantic
  const Icon = config.icon

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: 1,
        borderColor: "divider",
        p: 1.5,
        fontSize: "0.875rem",
      }}
    >
      <Stack direction="row" spacing={1} sx={{ mb: 0.75, alignItems: "flex-start" }}>
        <Icon
          sx={{
            mt: 0.25,
            fontSize: 18,
            flexShrink: 0,
            color: result.severity === "warning" ? "warning.main" : "info.main",
          }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {result.page}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t(config.labelKey)}
          </Typography>
        </Box>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        {result.detail}
      </Typography>

      {result.affectedPages && result.affectedPages.length > 0 && (
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5, mb: 1 }}>
          {result.affectedPages.map((page) => (
            <Button
              key={page}
              type="button"
              size="small"
              onClick={() => onOpenPage(page)}
              sx={{
                minWidth: 0,
                px: 0.75,
                py: 0.25,
                fontSize: "0.75rem",
                textTransform: "none",
                fontWeight: 600,
                color: "primary.main",
                bgcolor: "action.selected",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              {page}
            </Button>
          ))}
        </Stack>
      )}

      <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75, mt: 1 }}>
        <Button variant="outlined" size="small" sx={{ minHeight: 28, fontSize: "0.75rem" }} onClick={() => onOpenPage(result.page)}>
          {t("lint.open")}
        </Button>
        <Button
          variant="outlined"
          size="small"
          sx={{ minHeight: 28, fontSize: "0.75rem", gap: 0.5 }}
          disabled={fixing}
          onClick={() => onFix(result, index)}
          startIcon={<BuildIcon sx={{ fontSize: 14 }} />}
        >
          {fixing ? t("lint.fixing") : t("lint.fix")}
        </Button>
        {onDelete && (
          <Button
            variant="outlined"
            size="small"
            color="error"
            sx={{ minHeight: 28, fontSize: "0.75rem", gap: 0.5 }}
            onClick={() => onDelete(result, index)}
            startIcon={<DeleteOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
          >
            {t("lint.delete")}
          </Button>
        )}
      </Stack>
    </Box>
  )
}
