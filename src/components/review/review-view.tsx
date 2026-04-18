import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined"
import CheckIcon from "@mui/icons-material/Check"
import CloseIcon from "@mui/icons-material/Close"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined"
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined"
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import Box from "@mui/material/Box"
import Chip from "@mui/material/Chip"
import IconButton from "@mui/material/IconButton"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import type { SvgIconProps } from "@mui/material/SvgIcon"
import Button from "@mui/material/Button"
import i18n from "@/i18n"
import { queueResearch } from "@/lib/deep-research"
import { useReviewStore, type ReviewItem } from "@/stores/review-store"
import { useWikiStore } from "@/stores/wiki-store"
import { writeFile, readFile, listDirectory, deleteFile } from "@/commands/fs"

type MuiIcon = React.ComponentType<SvgIconProps>

const typeConfig: Record<
  ReviewItem["type"],
  { icon: MuiIcon; labelKey: string; color: string }
> = {
  contradiction: { icon: WarningAmberIcon, labelKey: "review.contradiction", color: "warning.main" },
  duplicate: { icon: ContentCopyIcon, labelKey: "review.possibleDuplicate", color: "info.main" },
  "missing-page": { icon: HelpOutlineOutlinedIcon, labelKey: "review.missingPage", color: "secondary.main" },
  confirm: { icon: ChatBubbleOutlineOutlinedIcon, labelKey: "review.needsConfirmation", color: "text.primary" },
  suggestion: { icon: LightbulbOutlinedIcon, labelKey: "review.suggestion", color: "success.main" },
}

export function ReviewView() {
  const { t } = useTranslation()
  const items = useReviewStore((s) => s.items)
  const resolveItem = useReviewStore((s) => s.resolveItem)
  const dismissItem = useReviewStore((s) => s.dismissItem)
  const clearResolved = useReviewStore((s) => s.clearResolved)
  const project = useWikiStore((s) => s.project)
  const setFileTree = useWikiStore((s) => s.setFileTree)

  const handleResolve = useCallback(async (id: string, action: string) => {
    if (action === "__deep_research__" && project) {
      const searchConfig = useWikiStore.getState().searchApiConfig
      if (searchConfig.provider === "none" || !searchConfig.apiKey) {
        window.alert(t("review.webSearchNotConfigured"))
        return
      }
      const item = items.find((i) => i.id === id)
      if (item) {
        const llmConfig = useWikiStore.getState().llmConfig
        const topic = item.title.replace(/^(Save to Wiki|Create|Research)[:\s]*/i, "").trim() || item.description.split("\n")[0]
        queueResearch(project.id, topic, llmConfig, searchConfig, item.searchQueries)
        resolveItem(id, t("review.queuedForResearch"))
      } else {
        resolveItem(id, action)
      }
      return
    }

    if (action.startsWith("save:") && project) {
      try {
        const encoded = action.slice(5)
        const content = decodeURIComponent(atob(encoded))

        const cleanContent = content
          .replace(/<!--\s*save-worthy:.*?-->/g, "")
          .replace(/<!--\s*sources:.*?-->/g, "")
          .trimEnd()

        const firstLine = cleanContent.split("\n").find((l) => l.trim() && !l.startsWith("<!--"))?.replace(/^#+\s*/, "").trim() ?? t("chat.savedQuery")
        const title = firstLine.slice(0, 60)
        const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 50)
        const date = new Date().toISOString().slice(0, 10)
        const fileName = `${slug}-${date}.md`
        const filePath = `wiki/queries/${fileName}`

        const frontmatter = `---\ntype: query\ntitle: "${title.replace(/"/g, '\\"')}"\ncreated: ${date}\ntags: []\n---\n\n`
        await writeFile(project.id, filePath, frontmatter + cleanContent)

        let indexContent = ""
        try { indexContent = await readFile(project.id, "wiki/index.md") } catch { indexContent = "# Wiki Index\n" }
        const entry = `- [[queries/${slug}-${date}|${title}]]`
        if (indexContent.includes("## Queries")) {
          indexContent = indexContent.replace(/(## Queries\n)/, `$1${entry}\n`)
        } else {
          indexContent = indexContent.trimEnd() + "\n\n## Queries\n" + entry + "\n"
        }
        await writeFile(project.id, "wiki/index.md", indexContent)

        let logContent = ""
        try { logContent = await readFile(project.id, "wiki/log.md") } catch { logContent = "# Wiki Log\n" }
        await writeFile(project.id, "wiki/log.md", logContent.trimEnd() + `\n- ${date}: Saved query page \`${fileName}\`\n`)

        const tree = await listDirectory(project.id)
        setFileTree(tree)

        resolveItem(id, t("review.savedToWiki"))
      } catch (err) {
        console.error("Failed to save to wiki from review:", err)
        resolveItem(id, t("review.saveFailed"))
      }
    } else if (action.startsWith("open:") && project) {
      const page = action.slice(5)
      const candidates = [
        `wiki/${page}`,
        `wiki/${page}.md`,
      ]
      for (const relativePath of candidates) {
        try {
          const content = await readFile(project.id, relativePath)
          useWikiStore.getState().setSelectedFile(relativePath)
          useWikiStore.getState().setFileContent(content)
          useWikiStore.getState().setActiveView("wiki")
          break
        } catch {
          // try next
        }
      }
      resolveItem(id, action)
    } else if (action.startsWith("delete:") && project) {
      const relativePath = action.slice(7)
      try {
        await deleteFile(project.id, relativePath)
        const tree = await listDirectory(project.id)
        setFileTree(tree)
        resolveItem(id, t("review.deleted"))
      } catch (err) {
        console.error("Failed to delete:", err)
        resolveItem(id, t("review.deleteFailed"))
      }
    } else if (actionLooksLikeResearch(action) && project) {
      const searchConfig = useWikiStore.getState().searchApiConfig
      if (searchConfig.provider === "none" || !searchConfig.apiKey) {
        const item = items.find((i) => i.id === id)
        if (item) {
          handleResolve(id, "__create_page__:" + action)
        }
        return
      }
      const item = items.find((i) => i.id === id)
      if (item) {
        const llmConfig = useWikiStore.getState().llmConfig
        const topic = action.replace(/^research\s*/i, "").trim() || item.description.split("\n")[0]
        queueResearch(project.id, topic, llmConfig, searchConfig)
        resolveItem(id, t("review.queuedForDeepResearch"))
      } else {
        resolveItem(id, action)
      }
    } else if (action.startsWith("__create_page__:") && project) {
      const realAction = action.slice("__create_page__:".length)
      await createPageFromReview(id, realAction, items, project.id)
    } else if (actionLooksLikeCreate(action) && project) {
      await createPageFromReview(id, action, items, project.id)
    } else {
      resolveItem(id, action)
    }
  }, [project, items, resolveItem, setFileTree, t])

  const pending = items.filter((i) => !i.resolved)
  const resolved = items.filter((i) => i.resolved)

  return (
    <Box sx={{ display: "flex", height: "100%", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: 1, borderColor: "divider", px: 2, py: 1.5 }}>
        <Typography variant="body2" component="h2" sx={{ fontWeight: 600 }}>
          {t("review.title")}
          {pending.length > 0 && (
            <Chip
              component="span"
              size="small"
              label={pending.length}
              sx={{
                ml: 1,
                height: 22,
                fontSize: "0.75rem",
                bgcolor: "primary.main",
                color: "primary.contrastText",
              }}
            />
          )}
        </Typography>
        {resolved.length > 0 && (
          <Button
            color="inherit"
            size="small"
            onClick={clearResolved}
            startIcon={<DeleteOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
            sx={{ fontSize: "0.75rem", textTransform: "none" }}
          >
            {t("review.clearResolved")}
          </Button>
        )}
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {items.length === 0 ? (
          <Stack spacing={1} sx={{ p: 4, textAlign: "center", color: "text.secondary", alignItems: "center", justifyContent: "center" }}>
            <CheckCircleIcon sx={{ fontSize: 32, color: "action.disabled" }} />
            <Typography variant="body2">{t("review.allClear")}</Typography>
          </Stack>
        ) : (
          <Stack spacing={1} sx={{ p: 1.5 }}>
            {pending.map((item) => (
              <ReviewCard key={item.id} item={item} onResolve={handleResolve} onDismiss={dismissItem} />
            ))}
            {resolved.length > 0 && pending.length > 0 && (
              <Typography variant="caption" sx={{ my: 1, textAlign: "center", color: "text.secondary" }}>
                {t("review.resolved")}
              </Typography>
            )}
            {resolved.map((item) => (
              <ReviewCard key={item.id} item={item} onResolve={handleResolve} onDismiss={dismissItem} />
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  )
}

function ReviewCard({
  item,
  onResolve,
  onDismiss,
}: {
  item: ReviewItem
  onResolve: (id: string, action: string) => void
  onDismiss: (id: string) => void
}) {
  const { t } = useTranslation()
  const config = typeConfig[item.type]
  const Icon = config.icon

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: 1,
        borderColor: "divider",
        p: 1.5,
        fontSize: "0.875rem",
        opacity: item.resolved ? 0.5 : 1,
        transition: (theme) => theme.transitions.create("opacity"),
      }}
    >
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "flex-start", justifyContent: "space-between" }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Icon sx={{ fontSize: 18, flexShrink: 0, color: config.color }} aria-label={t(config.labelKey)} />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {item.title}
          </Typography>
        </Stack>
        <IconButton size="small" onClick={() => onDismiss(item.id)} sx={{ color: "text.secondary" }}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Stack>

      <Typography variant="caption" sx={{ display: "block", mb: 1.5, color: "text.secondary" }}>
        {item.description}
      </Typography>

      {item.affectedPages && item.affectedPages.length > 0 && (
        <Typography variant="caption" sx={{ display: "block", mb: 1.5, color: "text.secondary" }}>
          {t("review.pages")}
          {item.affectedPages.join(", ")}
        </Typography>
      )}

      {!item.resolved ? (
        <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 0.75 }}>
          {(item.type === "suggestion" || item.type === "missing-page") && (
            <Button
              variant="contained"
              size="small"
              sx={{ minHeight: 28, fontSize: "0.75rem", textTransform: "none" }}
              onClick={() => onResolve(item.id, "__deep_research__")}
            >
              {t("review.deepResearch")}
            </Button>
          )}
          {item.options.map((opt) => (
            <Button
              key={opt.action}
              variant="outlined"
              size="small"
              sx={{ minHeight: 28, fontSize: "0.75rem", textTransform: "none" }}
              onClick={() => onResolve(item.id, opt.action)}
            >
              {opt.label}
            </Button>
          ))}
        </Stack>
      ) : (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <CheckIcon sx={{ fontSize: 14, color: "success.main" }} />
          <Typography variant="caption" color="success.main">
            {item.resolvedAction}
          </Typography>
        </Stack>
      )}
    </Box>
  )
}

function actionLooksLikeResearch(action: string): boolean {
  if (action.startsWith("__")) return false
  const lower = action.toLowerCase()
  return (
    lower.includes("research") ||
    lower.includes("investigate") ||
    lower.includes("explore") ||
    lower.includes("look into") ||
    lower.includes("研究") ||
    lower.includes("调研") ||
    lower.includes("探索")
  )
}

function actionIsDismissal(action: string): boolean {
  const lower = action.toLowerCase()
  return (
    lower === "skip" ||
    lower === "dismiss" ||
    lower === "ignore" ||
    lower === "跳过" ||
    lower === "忽略" ||
    lower === "approve" ||
    lower === "keep existing" ||
    lower === "no"
  )
}

function actionLooksLikeCreate(action: string): boolean {
  return !actionIsDismissal(action)
}

function detectPageType(action: string, reviewType: string): string {
  const lower = action.toLowerCase()
  if (lower.includes("entity") || lower.includes("实体")) return "entity"
  if (lower.includes("concept") || lower.includes("概念")) return "concept"
  if (lower.includes("comparison") || lower.includes("compare") || lower.includes("比较")) return "comparison"
  if (lower.includes("synthesis") || lower.includes("综合")) return "synthesis"
  if (reviewType === "missing-page") return "concept"
  if (reviewType === "contradiction") return "query"
  if (reviewType === "suggestion") return "query"
  return "query"
}

async function createPageFromReview(
  id: string,
  realAction: string,
  items: ReviewItem[],
  projectId: string,
) {
  const resolveItem = useReviewStore.getState().resolveItem
  const setFileTree = useWikiStore.getState().setFileTree
  const item = items.find((i) => i.id === id)
  if (!item) {
    resolveItem(id, realAction)
    return
  }
  try {
    const title = item.title.replace(/^(Create|Save|Add)[:\s]*/i, "").trim() || i18n.t("review.untitled")
    const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 50)
    const date = new Date().toISOString().slice(0, 10)

    const pageType = detectPageType(realAction, item.type)
    const dir = pageType === "query" ? "queries" : pageType === "entity" ? "entities" : pageType === "concept" ? "concepts" : "queries"
    const fileName = `${slug}-${date}.md`
    const filePath = `wiki/${dir}/${fileName}`

    const frontmatter = `---\ntype: ${pageType}\ntitle: "${title.replace(/"/g, '\\"')}"\ncreated: ${date}\ntags: []\nrelated: []\n---\n\n`
    const body = `# ${title}\n\n${item.description}\n`
    await writeFile(projectId, filePath, frontmatter + body)

    let indexContent = ""
    try { indexContent = await readFile(projectId, "wiki/index.md") } catch { indexContent = "# Wiki Index\n" }
    const sectionHeader = `## ${dir.charAt(0).toUpperCase() + dir.slice(1)}`
    const entry = `- [[${dir}/${slug}-${date}|${title}]]`
    if (indexContent.includes(sectionHeader)) {
      indexContent = indexContent.replace(new RegExp(`(${sectionHeader}\n)`), `$1${entry}\n`)
    } else {
      indexContent = indexContent.trimEnd() + `\n\n${sectionHeader}\n${entry}\n`
    }
    await writeFile(projectId, "wiki/index.md", indexContent)

    let logContent = ""
    try { logContent = await readFile(projectId, "wiki/log.md") } catch { logContent = "# Wiki Log\n" }
    await writeFile(projectId, "wiki/log.md", logContent.trimEnd() + `\n- ${date}: Created ${pageType} page \`${fileName}\` from review\n`)

    const tree = await listDirectory(projectId)
    setFileTree(tree)
    useWikiStore.getState().bumpDataVersion()

    resolveItem(id, `Created: wiki/${dir}/${fileName}`)
  } catch (err) {
    console.error("Failed to create page from review:", err)
    resolveItem(id, i18n.t("review.createFailed"))
  }
}
