import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import IconButton from "@mui/material/IconButton"
import CircularProgress from "@mui/material/CircularProgress"
import LinearProgress from "@mui/material/LinearProgress"
import KeyboardArrowUp from "@mui/icons-material/KeyboardArrowUp"
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown"
import CheckCircle from "@mui/icons-material/CheckCircle"
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined"
import Description from "@mui/icons-material/Description"
import PeopleOutlineOutlined from "@mui/icons-material/PeopleOutlineOutlined"
import LightbulbOutlined from "@mui/icons-material/LightbulbOutlined"
import MenuBook from "@mui/icons-material/MenuBook"
import MergeType from "@mui/icons-material/MergeType"
import BarChart from "@mui/icons-material/BarChart"
import HelpOutlineOutlined from "@mui/icons-material/HelpOutlineOutlined"
import ViewModule from "@mui/icons-material/ViewModule"
import RotateLeft from "@mui/icons-material/RotateLeft"
import Close from "@mui/icons-material/Close"
import AccessTime from "@mui/icons-material/AccessTime"
import type { SvgIconProps } from "@mui/material/SvgIcon"
import { useActivityStore, type ActivityItem } from "@/stores/activity-store"
import { useWikiStore } from "@/stores/wiki-store"
import { normalizePath, getFileName } from "@/lib/path-utils"
import { getQueue, getQueueSummary, retryTask, cancelTask, type IngestTask } from "@/lib/ingest-queue"

type IconComp = React.ComponentType<SvgIconProps>

const FILE_TYPE_ICONS: Record<string, IconComp> = {
  sources: MenuBook,
  entities: PeopleOutlineOutlined,
  concepts: LightbulbOutlined,
  queries: HelpOutlineOutlined,
  synthesis: MergeType,
  comparisons: BarChart,
}

const DIR_TYPE_KEYS: Record<string, string> = {
  sources: "knowledgeTree.sources",
  entities: "knowledgeTree.entities",
  concepts: "knowledgeTree.concepts",
  queries: "knowledgeTree.queries",
  synthesis: "knowledgeTree.synthesis",
  comparisons: "knowledgeTree.comparisons",
}

function getFileTypeInfo(path: string): { icon: IconComp; typeKey: string } {
  for (const [dir, Icon] of Object.entries(FILE_TYPE_ICONS)) {
    if (path.includes(`/${dir}/`) || path.startsWith(`wiki/${dir}/`)) {
      return { icon: Icon, typeKey: DIR_TYPE_KEYS[dir] ?? "activity.file" }
    }
  }
  if (path.includes("index.md")) return { icon: ViewModule, typeKey: "activity.index" }
  if (path.includes("log.md")) return { icon: Description, typeKey: "activity.log" }
  return { icon: Description, typeKey: "activity.file" }
}

export function ActivityPanel() {
  const { t } = useTranslation()
  const items = useActivityStore((s) => s.items)
  const clearDone = useActivityStore((s) => s.clearDone)
  const project = useWikiStore((s) => s.project)
  const [expanded, setExpanded] = useState(false)
  const [queueTasks, setQueueTasks] = useState<IngestTask[]>([])
  const prevRunningRef = useRef(0)

  const runningCount = items.filter((i) => i.status === "running").length
  const hasItems = items.length > 0

  useEffect(() => {
    const interval = setInterval(() => {
      setQueueTasks([...getQueue()])
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const queueSummary = getQueueSummary()
  const hasQueue = queueSummary.total > 0

  const handleRetry = useCallback((taskId: string) => {
    if (!project) return
    retryTask(normalizePath(project.path), taskId)
  }, [project])

  const handleCancel = useCallback((taskId: string) => {
    if (!project) return
    cancelTask(normalizePath(project.path), taskId)
  }, [project])

  useEffect(() => {
    if (runningCount > 0 && prevRunningRef.current === 0) {
      setExpanded(true)
    }
    if (hasQueue && !expanded) {
      setExpanded(true)
    }
    prevRunningRef.current = runningCount
  }, [runningCount, hasQueue, expanded])

  if (!hasItems && !hasQueue) return null

  const latestItem = items[0]

  let statusText = ""
  if (queueSummary.processing > 0 || queueSummary.pending > 0) {
    const done = queueSummary.total - queueSummary.pending - queueSummary.processing
    statusText = t("activity.queue", { done, total: queueSummary.total })
    if (queueSummary.failed > 0) statusText += t("activity.failed", { count: queueSummary.failed })
  } else if (runningCount > 0) {
    statusText = t("activity.processingTitle", { title: latestItem?.title ?? "..." })
  } else if (queueSummary.failed > 0) {
    statusText = t("activity.failedTasks", { count: queueSummary.failed })
  } else {
    statusText = t("activity.done", { title: latestItem?.title ?? t("activity.allComplete") })
  }

  const isActive = runningCount > 0 || queueSummary.processing > 0 || queueSummary.pending > 0

  const progressPct =
    queueSummary.total > 0
      ? ((queueSummary.total - queueSummary.pending - queueSummary.processing) / queueSummary.total) * 100
      : 0

  return (
    <Box sx={{ borderTop: 1, borderColor: "divider", bgcolor: (theme) => theme.palette.action.hover }}>
      <Box
        component="button"
        type="button"
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.75,
          border: "none",
          background: "none",
          cursor: "pointer",
          font: "inherit",
          fontSize: 12,
          color: "text.secondary",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        {isActive ? (
          <CircularProgress size={12} sx={{ flexShrink: 0 }} />
        ) : queueSummary.failed > 0 ? (
          <ErrorOutlineOutlined sx={{ fontSize: 12, flexShrink: 0, color: "error.main" }} />
        ) : (
          <CheckCircle sx={{ fontSize: 12, flexShrink: 0, color: "success.dark" }} />
        )}
        <Typography variant="caption" noWrap sx={{ flex: 1, textAlign: "left" }}>
          {statusText}
        </Typography>
        {expanded ? (
          <KeyboardArrowDown sx={{ fontSize: 12, flexShrink: 0 }} />
        ) : (
          <KeyboardArrowUp sx={{ fontSize: 12, flexShrink: 0 }} />
        )}
      </Box>

      {expanded && (
        <Box sx={{ maxHeight: 256, overflowY: "auto", borderTop: 1, borderColor: "divider" }}>
          {hasQueue && (queueSummary.processing > 0 || queueSummary.pending > 0) && (
            <Box sx={{ px: 1.5, py: 0.75, borderBottom: 1, borderColor: (theme) => theme.palette.divider }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {t("activity.ingestQueue")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("activity.complete", {
                    done: queueSummary.total - queueSummary.pending - queueSummary.processing,
                    total: queueSummary.total,
                  })}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progressPct}
                sx={{
                  height: 6,
                  borderRadius: 999,
                  bgcolor: "action.selected",
                  "& .MuiLinearProgress-bar": { borderRadius: 999, bgcolor: "primary.main" },
                }}
              />
            </Box>
          )}

          {queueTasks.filter((task) => task.status === "processing").map((task) => (
            <QueueRow key={task.id} task={task} onRetry={handleRetry} onCancel={handleCancel} />
          ))}
          {queueTasks.filter((task) => task.status === "pending").map((task) => (
            <QueueRow key={task.id} task={task} onRetry={handleRetry} onCancel={handleCancel} />
          ))}
          {queueTasks.filter((task) => task.status === "failed").map((task) => (
            <QueueRow key={task.id} task={task} onRetry={handleRetry} onCancel={handleCancel} />
          ))}

          {items.map((item) => {
            const matchingTask = item.status === "running"
              ? queueTasks.find((task) => task.status === "processing" && getFileName(task.sourcePath) === item.title)
              : undefined
            return (
              <ActivityRow
                key={item.id}
                item={item}
                onCancel={matchingTask ? () => handleCancel(matchingTask.id) : undefined}
              />
            )
          })}
          {items.some((i) => i.status !== "running") && (
            <Box
              component="button"
              type="button"
              onClick={clearDone}
              sx={{
                width: "100%",
                px: 1.5,
                py: 0.5,
                border: "none",
                background: "none",
                cursor: "pointer",
                font: "inherit",
                fontSize: 10,
                color: "text.secondary",
                textDecoration: "underline",
              }}
            >
              {t("activity.clearCompleted")}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

function QueueRow({ task, onRetry, onCancel }: { task: IngestTask; onRetry: (id: string) => void; onCancel: (id: string) => void }) {
  const { t } = useTranslation()
  const fileName = getFileName(task.sourcePath)

  return (
    <Box sx={{ px: 1.5, py: 1, typography: "caption", borderBottom: 1, borderColor: (theme) => theme.palette.divider }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ flexShrink: 0 }}>
          {task.status === "processing" && <CircularProgress size={12} sx={{ color: "primary.main" }} />}
          {task.status === "pending" && <AccessTime sx={{ fontSize: 12, color: "text.secondary" }} />}
          {task.status === "failed" && <ErrorOutlineOutlined sx={{ fontSize: 12, color: "error.main" }} />}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" noWrap sx={{ fontWeight: 600, display: "block" }}>
            {fileName}
          </Typography>
          {task.folderContext && (
            <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.85, display: "block" }} noWrap>
              {task.folderContext}
            </Typography>
          )}
          {task.status === "failed" && task.error && (
            <Typography variant="caption" color="error" sx={{ mt: 0.25, display: "block" }} noWrap>
              {task.error}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, flexShrink: 0 }}>
          {task.status === "failed" && (
            <IconButton
              size="small"
              onClick={() => onRetry(task.id)}
              title={t("activity.retry")}
              sx={{ p: 0.25, color: "text.secondary", "&:hover": { color: "text.primary", bgcolor: "action.hover" } }}
            >
              <RotateLeft sx={{ fontSize: 12 }} />
            </IconButton>
          )}
          {(task.status === "pending" || task.status === "processing") && (
            <IconButton
              size="small"
              onClick={() => onCancel(task.id)}
              title={t("activity.cancel")}
              sx={{
                p: 0.25,
                color: "text.secondary",
                "&:hover": { color: "error.main", bgcolor: (theme) => theme.palette.error.main + "33" },
              }}
            >
              <Close sx={{ fontSize: 12 }} />
            </IconButton>
          )}
        </Box>
      </Box>
    </Box>
  )
}

function ActivityRow({ item, onCancel }: { item: ActivityItem; onCancel?: () => void }) {
  const { t } = useTranslation()
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const project = useWikiStore((s) => s.project)

  function handleFileClick(filePath: string) {
    if (!project) return
    const pp = normalizePath(project.path)
    const fullPath = filePath.startsWith("/") ? normalizePath(filePath) : `${pp}/${filePath}`
    setSelectedFile(fullPath)
  }

  return (
    <Box sx={{ px: 1.5, py: 1, typography: "caption", borderBottom: 1, borderColor: (theme) => theme.palette.divider }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Box sx={{ mt: 0.25, flexShrink: 0 }}>
          {item.status === "running" && <CircularProgress size={12} sx={{ color: "primary.main" }} />}
          {item.status === "done" && <CheckCircle sx={{ fontSize: 12, color: "success.dark" }} />}
          {item.status === "error" && <ErrorOutlineOutlined sx={{ fontSize: 12, color: "error.main" }} />}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: "block" }}>
            {item.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: "block" }}>
            {item.detail}
          </Typography>
        </Box>
        {item.status === "running" && onCancel && (
          <IconButton
            size="small"
            onClick={onCancel}
            title={t("activity.cancel")}
            sx={{
              flexShrink: 0,
              p: 0.25,
              color: "text.secondary",
              "&:hover": { color: "error.main", bgcolor: (theme) => theme.palette.error.main + "33" },
            }}
          >
            <Close sx={{ fontSize: 12 }} />
          </IconButton>
        )}
      </Box>

      {item.filesWritten.length > 0 && item.status === "done" && (
        <Box sx={{ mt: 0.75, ml: 2.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
          {item.filesWritten.map((filePath) => {
            const { icon: Icon, typeKey } = getFileTypeInfo(filePath)
            const name = getFileName(filePath)
            return (
              <Box
                key={filePath}
                component="button"
                type="button"
                onClick={() => handleFileClick(filePath)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  borderRadius: 0.5,
                  px: 0.5,
                  py: 0.25,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  font: "inherit",
                  textAlign: "left",
                  color: "text.secondary",
                  transition: (theme) => theme.transitions.create("background-color"),
                  "&:hover": { bgcolor: "action.hover", color: "text.primary" },
                }}
              >
                <Icon sx={{ fontSize: 12, flexShrink: 0 }} />
                <Typography variant="caption" sx={{ width: 56, flexShrink: 0, fontWeight: 500, color: "text.secondary", opacity: 0.85 }}>
                  {t(typeKey)}
                </Typography>
                <Typography variant="caption" noWrap sx={{ flex: 1 }}>
                  {name}
                </Typography>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
