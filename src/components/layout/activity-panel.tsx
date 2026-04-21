import { useState, useEffect, useRef, useMemo } from "react"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import Collapse from "@mui/material/Collapse"
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
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import ExpandLessIcon from "@mui/icons-material/ExpandLess"
import type { SvgIconProps } from "@mui/material/SvgIcon"
import { useActivityStore, type ActivityItem } from "@/stores/activity-store"
import { useWikiStore } from "@/stores/wiki-store"
import { getFileName } from "@/lib/path-utils"

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
  const allItems = useActivityStore((s) => s.items)
  const clearDone = useActivityStore((s) => s.clearDone)
  const clearErrors = useActivityStore((s) => s.clearErrors)
  const currentProjectId = useWikiStore((s) => s.project?.id ?? null)
  const [expanded, setExpanded] = useState(false)
  const prevRunningRef = useRef(0)

  const items = useMemo(
    () => (currentProjectId ? allItems.filter((i) => i.projectId === currentProjectId) : []),
    [allItems, currentProjectId],
  )

  const runningItems = items.filter((i) => i.status === "running")
  const runningCount = runningItems.length
  const hasItems = items.length > 0

  // Auto-expand when a NEW task starts (0 → 1+ running), but respect manual collapse.
  // Do NOT force expand if the user already collapsed the panel while tasks are running.
  useEffect(() => {
    if (runningCount > 0 && prevRunningRef.current === 0) setExpanded(true)
    prevRunningRef.current = runningCount
  }, [runningCount])

  if (!hasItems) return null

  const isActive = runningCount > 0
  const activeItem = runningItems[0] ?? items[0]
  const stepInfo = activeItem?.status === "running" ? parseStep(activeItem.detail) : null

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
          {/* Activity items */}
          {items.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}

          {/* Clear buttons */}
          {items.some((i) => i.status !== "running") && (
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Box
                component="button"
                type="button"
                onClick={clearDone}
                sx={{
                  flex: 1,
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
              {items.some((i) => i.status === "error") && (
                <Box
                  component="button"
                  type="button"
                  onClick={clearErrors}
                  sx={{
                    flex: 1,
                    px: 1.5,
                    py: 0.5,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    font: "inherit",
                    fontSize: "0.6rem",
                    color: "error.main",
                    opacity: 0.6,
                    "&:hover": { opacity: 1 },
                    textAlign: "center",
                  }}
                >
                  清除失败
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const navigateInCurrentTab = useWikiStore((s) => s.navigateInCurrentTab)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const stepInfo = item.status === "running" ? parseStep(item.detail) : null

  const timeStr = useMemo(() => {
    if (!item.createdAt) return ""
    return new Date(item.createdAt).toLocaleTimeString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
  }, [item.createdAt])

  function handleFileClick(relativePath: string) {
    navigateInCurrentTab(relativePath)
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
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        {/* Status icon */}
        <Box sx={{ mt: 0.2, flexShrink: 0, width: 12, display: "flex", justifyContent: "center" }}>
          {isRunning && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#7c3aed", mt: 0.2, animation: "preprocess-dot-pulse 1.4s ease-in-out infinite" }} />}
          {item.status === "done" && <CheckCircle sx={{ fontSize: 12, color: "success.dark" }} />}
          {item.status === "error" && <ErrorOutlineOutlined sx={{ fontSize: 12, color: "error.main" }} />}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          {/* Title + time */}
          <Stack direction="row" sx={{ alignItems: "baseline", gap: 0.75 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.7rem", display: "block", color: isRunning ? "#5b21b6" : "text.primary", lineHeight: 1.4 }}>
              {item.title}
            </Typography>
            {timeStr && (
              <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "text.disabled", flexShrink: 0 }}>
                {timeStr}
              </Typography>
            )}
          </Stack>

          {/* Step detail — vision not-supported gets a distinct amber notice */}
          {item.detail?.startsWith("[Vision not supported]") ? (
            <Typography
              variant="caption"
              sx={{
                fontSize: "0.65rem",
                display: "block",
                lineHeight: 1.3,
                mt: 0.1,
                color: "warning.dark",
                fontWeight: 500,
              }}
            >
              {item.detail.replace("[Vision not supported] ", "")}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", display: "block", lineHeight: 1.3, mt: 0.1 }}>
              {stepInfo ? `${stepInfo.step}/${stepInfo.total} · ${stepInfo.label}` : item.detail}
            </Typography>
          )}

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
                const { icon: Icon } = getFileTypeInfo(filePath)
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

      </Stack>
    </Box>
  )
}
