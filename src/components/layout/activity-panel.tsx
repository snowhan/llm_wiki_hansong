import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import IconButton from "@mui/material/IconButton"
import Collapse from "@mui/material/Collapse"
import Tooltip from "@mui/material/Tooltip"
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
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import ExpandLessIcon from "@mui/icons-material/ExpandLess"
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome"
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

/** Parse step info from detail text like "Step 1/2: Analyzing source..." */
function parseStep(detail: string): { step: number; total: number; label: string } | null {
  const m = detail.match(/Step\s+(\d+)\/(\d+):\s*(.+)/)
  if (!m) return null
  return { step: parseInt(m[1]), total: parseInt(m[2]), label: m[3].replace(/\.\.\.$/, "") }
}

export function ActivityPanel() {
  const { t } = useTranslation()
  const items = useActivityStore((s) => s.items)
  const clearDone = useActivityStore((s) => s.clearDone)
  const project = useWikiStore((s) => s.project)
  const [expanded, setExpanded] = useState(false)
  const [queueTasks, setQueueTasks] = useState<IngestTask[]>([])
  const prevRunningRef = useRef(0)

  const runningItems = items.filter((i) => i.status === "running")
  const runningCount = runningItems.length
  const hasItems = items.length > 0

  useEffect(() => {
    const interval = setInterval(() => {
      setQueueTasks([...getQueue()])
    }, 800)
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

  // Auto-expand when a task starts
  useEffect(() => {
    if (runningCount > 0 && prevRunningRef.current === 0) setExpanded(true)
    if (hasQueue && !expanded) setExpanded(true)
    prevRunningRef.current = runningCount
  }, [runningCount, hasQueue, expanded])

  if (!hasItems && !hasQueue) return null

  const isActive = runningCount > 0 || queueSummary.processing > 0 || queueSummary.pending > 0
  const activeItem = runningItems[0] ?? items[0]
  const stepInfo = activeItem?.status === "running" ? parseStep(activeItem.detail) : null

  const progressPct =
    queueSummary.total > 0
      ? ((queueSummary.total - queueSummary.pending - queueSummary.processing) / queueSummary.total) * 100
      : 0

  return (
    <Box
      sx={{
        borderTop: 1,
        borderColor: isActive ? "rgba(124,58,237,0.2)" : "divider",
        bgcolor: isActive ? "rgba(124,58,237,0.03)" : "action.hover",
        transition: "background-color 0.3s, border-color 0.3s",
      }}
    >
      {/* ── Header row ── */}
      <Box
        component="button"
        type="button"
        onClick={() => setExpanded((v) => !v)}
        sx={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.875,
          border: "none",
          background: "none",
          cursor: "pointer",
          font: "inherit",
          color: "text.secondary",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        {/* Status icon */}
        {isActive ? (
          <Box
            sx={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              bgcolor: "#7c3aed",
              flexShrink: 0,
              animation: "preprocess-dot-pulse 1.4s ease-in-out infinite",
            }}
          />
        ) : items.some((i) => i.status === "error") ? (
          <ErrorOutlineOutlined sx={{ fontSize: 13, flexShrink: 0, color: "error.main" }} />
        ) : (
          <CheckCircle sx={{ fontSize: 13, flexShrink: 0, color: "success.dark" }} />
        )}

        {/* Status text */}
        <Box sx={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          {isActive && activeItem ? (
            <>
              <Typography variant="caption" noWrap sx={{ display: "block", fontWeight: 600, fontSize: "0.7rem", color: "#5b21b6", lineHeight: 1.3 }}>
                {activeItem.title}
              </Typography>
              <Typography variant="caption" noWrap sx={{ display: "block", fontSize: "0.65rem", color: "text.secondary", lineHeight: 1.2 }}>
                {stepInfo ? `${stepInfo.step}/${stepInfo.total} ${stepInfo.label}` : activeItem.detail}
              </Typography>
            </>
          ) : (
            <Typography variant="caption" noWrap sx={{ fontSize: "0.7rem", lineHeight: 1.3 }}>
              {items.some((i) => i.status === "error") ? "部分任务失败" : `已完成 ${items.filter(i => i.status === "done").length} 个任务`}
            </Typography>
          )}
        </Box>

        {/* Step dots indicator */}
        {isActive && stepInfo && (
          <Stack direction="row" spacing={0.4} sx={{ flexShrink: 0 }}>
            {Array.from({ length: stepInfo.total }).map((_, i) => (
              <Box key={i} sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: i < stepInfo.step ? "#7c3aed" : "rgba(124,58,237,0.2)" }} />
            ))}
          </Stack>
        )}

        {expanded ? <ExpandLessIcon sx={{ fontSize: 13, flexShrink: 0 }} /> : <ExpandMoreIcon sx={{ fontSize: 13, flexShrink: 0 }} />}
      </Box>

      {/* ── Step progress bar (visible even when collapsed) ── */}
      {isActive && stepInfo && (
        <Box sx={{ px: 1.5, pb: 0.75 }}>
          <Box sx={{ height: 2, borderRadius: 999, bgcolor: "rgba(124,58,237,0.12)", overflow: "hidden" }}>
            <Box
              sx={{
                height: "100%",
                borderRadius: 999,
                bgcolor: "#7c3aed",
                width: `${(stepInfo.step / stepInfo.total) * 100}%`,
                transition: "width 0.4s ease",
              }}
            />
          </Box>
        </Box>
      )}

      {/* ── Expanded details ── */}
      <Collapse in={expanded}>
        <Box sx={{ maxHeight: 300, overflowY: "auto", borderTop: 1, borderColor: "divider" }}>
          {/* Queue progress bar */}
          {hasQueue && (queueSummary.processing > 0 || queueSummary.pending > 0) && (
            <Box sx={{ px: 1.5, py: 0.875, borderBottom: 1, borderColor: "divider" }}>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                  队列进度
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                  {queueSummary.total - queueSummary.pending - queueSummary.processing}/{queueSummary.total}
                </Typography>
              </Stack>
              <Box sx={{ height: 3, borderRadius: 999, bgcolor: "action.selected", overflow: "hidden" }}>
                <Box sx={{ height: "100%", borderRadius: 999, bgcolor: "#7c3aed", width: `${progressPct}%`, transition: "width 0.4s ease" }} />
              </Box>
            </Box>
          )}

          {/* Queue tasks */}
          {queueTasks.filter((t) => t.status !== "done").map((task) => (
            <QueueRow key={task.id} task={task} onRetry={handleRetry} onCancel={handleCancel} />
          ))}

          {/* Activity items */}
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

          {/* Clear button */}
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
                fontSize: "0.6rem",
                color: "text.secondary",
                opacity: 0.6,
                "&:hover": { opacity: 1 },
                textAlign: "center",
              }}
            >
              清除已完成
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

function QueueRow({ task, onRetry, onCancel }: { task: IngestTask; onRetry: (id: string) => void; onCancel: (id: string) => void }) {
  const fileName = getFileName(task.sourcePath)

  return (
    <Box sx={{ px: 1.5, py: 0.75, borderBottom: 1, borderColor: "divider" }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box sx={{ flexShrink: 0, width: 12, height: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {task.status === "processing" && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#7c3aed", animation: "preprocess-dot-pulse 1.4s ease-in-out infinite" }} />}
          {task.status === "pending" && <AccessTime sx={{ fontSize: 11, color: "text.secondary" }} />}
          {task.status === "failed" && <ErrorOutlineOutlined sx={{ fontSize: 11, color: "error.main" }} />}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" noWrap sx={{ fontWeight: 500, fontSize: "0.68rem", display: "block", color: task.status === "processing" ? "#5b21b6" : "text.secondary" }}>
            {fileName}
          </Typography>
          {task.folderContext && (
            <Typography variant="caption" noWrap sx={{ fontSize: "0.62rem", color: "text.secondary", opacity: 0.7, display: "block" }}>
              {task.folderContext}
            </Typography>
          )}
          {task.status === "failed" && task.error && (
            <Typography variant="caption" noWrap sx={{ fontSize: "0.62rem", color: "error.main", display: "block" }}>
              {task.error}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
          {task.status === "failed" && (
            <Tooltip title="重试" enterDelay={400}>
              <IconButton size="small" onClick={() => onRetry(task.id)} sx={{ p: 0.25, color: "text.secondary", "&:hover": { color: "text.primary" } }}>
                <RotateLeft sx={{ fontSize: 11 }} />
              </IconButton>
            </Tooltip>
          )}
          {(task.status === "pending" || task.status === "processing") && (
            <Tooltip title="取消" enterDelay={400}>
              <IconButton size="small" onClick={() => onCancel(task.id)} sx={{ p: 0.25, color: "text.secondary", "&:hover": { color: "error.main" } }}>
                <Close sx={{ fontSize: 11 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>
    </Box>
  )
}

function ActivityRow({ item, onCancel }: { item: ActivityItem; onCancel?: () => void }) {
  const { t } = useTranslation()
  const navigateInCurrentTab = useWikiStore((s) => s.navigateInCurrentTab)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const project = useWikiStore((s) => s.project)
  const stepInfo = item.status === "running" ? parseStep(item.detail) : null

  function handleFileClick(filePath: string) {
    if (!project) return
    const pp = normalizePath(project.path)
    const fullPath = filePath.startsWith("/") ? normalizePath(filePath) : `${pp}/${filePath}`
    navigateInCurrentTab(fullPath)
    setActiveView("wiki")
  }

  const isRunning = item.status === "running"

  return (
    <Box
      sx={{
        px: 1.5,
        py: 0.875,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: isRunning ? "rgba(124,58,237,0.02)" : "transparent",
      }}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start">
        {/* Status icon */}
        <Box sx={{ mt: 0.2, flexShrink: 0, width: 12, display: "flex", justifyContent: "center" }}>
          {isRunning && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#7c3aed", mt: 0.2, animation: "preprocess-dot-pulse 1.4s ease-in-out infinite" }} />}
          {item.status === "done" && <CheckCircle sx={{ fontSize: 12, color: "success.dark" }} />}
          {item.status === "error" && <ErrorOutlineOutlined sx={{ fontSize: 12, color: "error.main" }} />}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          {/* Title */}
          <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.7rem", display: "block", color: isRunning ? "#5b21b6" : "text.primary", lineHeight: 1.4 }}>
            {item.title}
          </Typography>

          {/* Step detail */}
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", display: "block", lineHeight: 1.3, mt: 0.1 }}>
            {stepInfo ? `${stepInfo.step}/${stepInfo.total} · ${stepInfo.label}` : item.detail}
          </Typography>

          {/* Step progress dots */}
          {isRunning && stepInfo && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.6 }}>
              {Array.from({ length: stepInfo.total }).map((_, i) => (
                <Box
                  key={i}
                  sx={{
                    height: 2,
                    flex: 1,
                    borderRadius: 999,
                    bgcolor: i < stepInfo.step ? "#7c3aed" : "rgba(124,58,237,0.2)",
                    transition: "background-color 0.3s",
                  }}
                />
              ))}
            </Stack>
          )}

          {/* Files written on completion */}
          {item.filesWritten.length > 0 && item.status === "done" && (
            <Box sx={{ mt: 0.5, display: "flex", flexDirection: "column", gap: 0.15 }}>
              {item.filesWritten.slice(0, 8).map((filePath) => {
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
                      gap: 0.5,
                      borderRadius: 0.5,
                      px: 0.5,
                      py: 0.15,
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      font: "inherit",
                      textAlign: "left",
                      color: "text.secondary",
                      "&:hover": { bgcolor: "action.hover", color: "text.primary" },
                    }}
                  >
                    <Icon sx={{ fontSize: 10, flexShrink: 0 }} />
                    <Typography variant="caption" noWrap sx={{ flex: 1, fontSize: "0.62rem" }}>
                      {name}
                    </Typography>
                  </Box>
                )
              })}
              {item.filesWritten.length > 8 && (
                <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "text.secondary", opacity: 0.6, pl: 0.5 }}>
                  +{item.filesWritten.length - 8} 个文件
                </Typography>
              )}
            </Box>
          )}
        </Box>

        {/* Cancel button */}
        {isRunning && onCancel && (
          <Tooltip title="取消" enterDelay={400}>
            <IconButton
              size="small"
              onClick={onCancel}
              sx={{ flexShrink: 0, p: 0.25, color: "text.secondary", "&:hover": { color: "error.main" } }}
            >
              <Close sx={{ fontSize: 11 }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Box>
  )
}
