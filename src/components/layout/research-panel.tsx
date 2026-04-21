import { Fragment, useState, useRef, useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Collapse from "@mui/material/Collapse"
import Search from "@mui/icons-material/Search"
import ChevronRight from "@mui/icons-material/ChevronRight"
import ExpandMore from "@mui/icons-material/ExpandMore"
import Close from "@mui/icons-material/Close"
import CheckCircle from "@mui/icons-material/CheckCircle"
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined"
import Description from "@mui/icons-material/Description"
import OpenInNew from "@mui/icons-material/OpenInNew"
import Send from "@mui/icons-material/Send"
import { alpha, keyframes } from "@mui/material/styles"
import { MarkdownView } from "@/components/ui/markdown-view"
import { useResearchStore, type ResearchTask } from "@/stores/research-store"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile } from "@/commands/fs"
import { queueResearch } from "@/lib/deep-research"
import {
  getAllServerResearchTasks,
  subscribeResearchTask,
  type ServerResearchTask,
} from "@/commands/research"
import type { WebSearchResult } from "@/lib/web-search"

// ── Sync server tasks into local store ───────────────────────────────────────

async function syncServerResearchTasks(projectId: string): Promise<void> {
  const store = useResearchStore.getState()
  let serverTasks: ServerResearchTask[]
  try {
    serverTasks = await getAllServerResearchTasks(projectId)
  } catch {
    return
  }

  for (const serverTask of serverTasks) {
    const localId = Object.keys(store.serverTaskIds).find(
      (k) => store.serverTaskIds[k] === serverTask.id,
    )

    const patch = {
      status: serverTask.status,
      webResults: serverTask.webResults as WebSearchResult[],
      synthesis: serverTask.synthesis,
      savedPath: serverTask.savedPath,
      error: serverTask.error,
    }

    if (localId) {
      // `tasks` is not persisted — after a page refresh the array is empty
      // even though `serverTaskIds` mapping survived. In that case updateTask
      // would be a no-op, so we need to re-create the task entry.
      const taskExists = store.tasks.some((t) => t.id === localId)
      if (taskExists) {
        store.updateTask(localId, patch)
      } else {
        const newLocalId = store.addTask(serverTask.topic)
        store.setServerTaskId(newLocalId, serverTask.id)
        store.updateTask(newLocalId, { searchQueries: serverTask.searchQueries, ...patch })
        store.setServerTaskId(localId, null) // remove stale mapping
      }
    } else {
      // New server task not yet known locally (e.g., started from another tab)
      const newLocalId = store.addTask(serverTask.topic)
      store.setServerTaskId(newLocalId, serverTask.id)
      store.updateTask(newLocalId, { searchQueries: serverTask.searchQueries, ...patch })
    }
  }
}

// ─────────────────────────────────────────────────── Animation keyframes ───

const cardEntrance = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
`
const sourceEntrance = keyframes`
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0); }
`
const stagePulse = keyframes`
  0%, 100% { transform: scale(1);   opacity: 1;   }
  50%       { transform: scale(1.6); opacity: 0.45; }
`
const caretBlink = keyframes`
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
`

// ──────────────────────────────────────────────────── Status colour map ───

// Raw hex values so they work both inside and outside MUI theme tokens
const STAGE_COLOR: Record<ResearchTask["status"], string> = {
  queued:       "#94a3b8",
  searching:    "#0288d1",
  synthesizing: "#9333ea",
  saving:       "#ed6c02",
  done:         "#16a34a",
  error:        "#ef4444",
}

const STAGE_BG: Record<ResearchTask["status"], string> = {
  queued:       "transparent",
  searching:    "rgba(2,136,209,0.03)",
  synthesizing: "rgba(147,51,234,0.03)",
  saving:       "rgba(237,108,2,0.03)",
  done:         "transparent",
  error:        "rgba(239,68,68,0.03)",
}

// 0-based index for the 4-stage stepper; -1 = not in stepper
const STAGE_IDX: Record<ResearchTask["status"], number> = {
  queued:       -1,
  searching:     0,
  synthesizing:  1,
  saving:        2,
  done:          3,
  error:        -1,
}

const STEPPER_LABELS = ["搜索", "分析", "整合", "完成"]

// ──────────────────────────────────────────────── Domain avatar helpers ───

const AVATAR_PALETTE = ["#3b82f6","#10b981","#8b5cf6","#f59e0b","#06b6d4","#ec4899"]

function avatarColor(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) h = ((h * 31) + str.charCodeAt(i)) & 0x7fffffff
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

function avatarLetter(source: string): string {
  return source.replace(/^(https?:\/\/)?(www\.)?/, "").charAt(0).toUpperCase() || "W"
}

// ══════════════════════════════════════════════════════ ResearchPanel ══════

export function ResearchPanel() {
  const { t } = useTranslation()
  const tasks        = useResearchStore((s) => s.tasks)
  const removeTask   = useResearchStore((s) => s.removeTask)
  const setPanelOpen = useResearchStore((s) => s.setPanelOpen)
  const project         = useWikiStore((s) => s.project)
  const llmConfig       = useWikiStore((s) => s.llmConfig)
  const searchApiConfig = useWikiStore((s) => s.searchApiConfig)

  const [inputValue, setInputValue] = useState("")
  const [focused, setFocused]       = useState(false)

  // On mount, restore server tasks that survived a page refresh
  useEffect(() => {
    if (project?.id) {
      syncServerResearchTasks(project.id)
    }
  }, [project?.id])

  const running = tasks.filter((t) => ["searching","synthesizing","saving"].includes(t.status))
  const queued  = tasks.filter((t) => t.status === "queued")
  const done    = tasks.filter((t) => t.status === "done" || t.status === "error")

  function handleStart() {
    const topic = inputValue.trim()
    if (!topic || !project) return
    if (searchApiConfig.provider === "none" || !searchApiConfig.apiKey) {
      window.alert(t("research.webSearchNotConfigured"))
      return
    }
    queueResearch(project.id, topic, llmConfig, searchApiConfig)
    setInputValue("")
  }

  return (
    <Box sx={{ display: "flex", height: "100%", flexDirection: "column" }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <Box sx={{
        display: "flex", flexShrink: 0, alignItems: "center",
        justifyContent: "space-between",
        borderBottom: 1, borderColor: "divider",
        px: 1.5, py: 0.875,
      }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Search sx={{ fontSize: 14, color: "text.secondary" }} />
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
            {t("research.title")}
          </Typography>
          {(running.length > 0 || queued.length > 0) && (
            <Box sx={{
              display: "flex", alignItems: "center", gap: 0.5,
              borderRadius: "999px",
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
              px: 0.875, py: 0.2,
            }}>
              {/* Live pulse dot */}
              <Box sx={{
                width: 5, height: 5, borderRadius: "50%",
                bgcolor: "primary.main",
                animation: `${stagePulse} 1.6s ease-in-out infinite`,
              }} />
              <Typography variant="caption" sx={{
                fontSize: "0.5625rem", fontWeight: 600,
                color: "primary.main", lineHeight: 1,
              }}>
                {t("research.active", { count: running.length })}
                {queued.length > 0 ? ` · ${queued.length} 待` : ""}
              </Typography>
            </Box>
          )}
        </Box>
        <IconButton
          size="small" onClick={() => setPanelOpen(false)}
          sx={{ color: "text.secondary", "&:hover": { bgcolor: "action.hover" } }}
          aria-label="Close"
        >
          <Close sx={{ fontSize: 13 }} />
        </IconButton>
      </Box>

      {/* ── Input ──────────────────────────────────────────────────── */}
      <Box sx={{
        display: "flex", flexShrink: 0, alignItems: "center",
        gap: 0.75, px: 1.25, py: 0.875,
        borderBottom: 1, borderColor: "divider",
      }}>
        {/* Custom styled input wrapper */}
        <Box sx={{
          flex: 1, display: "flex", alignItems: "center", gap: 0.625,
          borderRadius: "10px", border: "1px solid",
          borderColor: focused ? "primary.main" : "divider",
          bgcolor: "background.default",
          boxShadow: focused ? "0 0 0 3px rgba(35,131,226,0.09)" : "none",
          transition: "border-color 0.2s, box-shadow 0.2s",
          px: 1, py: 0.625,
        }}>
          <Search sx={{ fontSize: 12, color: "text.disabled", flexShrink: 0 }} />
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleStart() }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t("research.enterTopic")}
            style={{
              flex: 1, border: "none", outline: "none",
              background: "transparent", color: "inherit",
              fontSize: "0.8125rem", fontFamily: "inherit",
            }}
          />
        </Box>
        <IconButton
          size="small"
          onClick={handleStart}
          disabled={!inputValue.trim()}
          aria-label={t("review.startResearch")}
          sx={{
            width: 30, height: 30, borderRadius: "8px",
            color: inputValue.trim() ? "primary.main" : "text.disabled",
            bgcolor: inputValue.trim()
              ? (theme) => alpha(theme.palette.primary.main, 0.08)
              : "transparent",
            transition: "all 0.2s ease",
            "&:hover": {
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.14),
            },
          }}
        >
          <Send sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      {/* ── Task list ──────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0, px: 0.875, pb: 1 }}>
        {tasks.length === 0 ? (
          <Box sx={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 1, py: 7, textAlign: "center",
          }}>
            <Search sx={{ fontSize: 26, color: "text.disabled", opacity: 0.2 }} />
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.75rem" }}>
              {t("research.noTasks")}
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.6875rem", opacity: 0.6 }}>
              {t("research.noTasksHint")}
            </Typography>
          </Box>
        ) : (
          <Stack spacing={0.75} sx={{ pt: 0.75 }}>
            {[...running, ...queued, ...done].map((task, idx) => (
              <ResearchTaskCard
                key={task.id}
                task={task}
                onRemove={removeTask}
                animationDelay={idx * 45}
              />
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  )
}

// ══════════════════════════════════════════════════ ResearchTaskCard ══════

function ResearchTaskCard({
  task,
  onRemove,
  animationDelay = 0,
}: {
  task: ResearchTask
  onRemove: (id: string) => void
  animationDelay?: number
}) {
  const { t } = useTranslation()
  const isRunning = ["searching","synthesizing","saving"].includes(task.status)
  const [expanded, setExpanded] = useState(isRunning)

  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setFileContent  = useWikiStore((s) => s.setFileContent)
  const project         = useWikiStore((s) => s.project)

  const serverTaskId  = useResearchStore((s) => s.serverTaskIds[task.id])
  const updateTask    = useResearchStore((s) => s.updateTask)
  const synthesisRef  = useRef(task.synthesis)

  // Keep synthesisRef in sync with stored synthesis (e.g., after server state snapshot)
  useEffect(() => {
    synthesisRef.current = task.synthesis
  }, [task.synthesis])

  // Subscribe to SSE for real-time progress (including after page refresh)
  useEffect(() => {
    if (!serverTaskId) return
    if (task.status === "done" || task.status === "error") return

    const unsubscribe = subscribeResearchTask(serverTaskId, {
      onUpdate: (serverTask) => {
        synthesisRef.current = serverTask.synthesis
        updateTask(task.id, {
          status: serverTask.status,
          webResults: serverTask.webResults as WebSearchResult[],
          synthesis: serverTask.synthesis,
          savedPath: serverTask.savedPath,
          error: serverTask.error,
        })
      },
      onToken: (token) => {
        synthesisRef.current += token
        updateTask(task.id, { synthesis: synthesisRef.current, status: "synthesizing" })
      },
      onDone: (serverTask) => {
        updateTask(task.id, {
          status: "done",
          synthesis: serverTask.synthesis,
          savedPath: serverTask.savedPath,
        })
      },
      onError: (msg) => {
        updateTask(task.id, { status: "error", error: msg })
      },
    })

    return unsubscribe
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverTaskId, task.status === "done" || task.status === "error"])

  const borderColor = STAGE_COLOR[task.status]
  const bgTint      = STAGE_BG[task.status]

  const statusText = {
    queued:       t("research.statusQueued"),
    searching:    t("research.statusSearching"),
    synthesizing: t("research.statusSynthesizing"),
    saving:       t("research.statusSaving"),
    done:         task.savedPath ? t("research.statusSaved") : t("research.statusDone"),
    error:        t("research.statusFailed"),
  }[task.status]

  async function handleOpenSaved() {
    if (!project || !task.savedPath) return
    try {
      const content = await readFile(project.id, task.savedPath)
      setSelectedFile(task.savedPath)
      setFileContent(content)
    } catch { /* ignore */ }
  }

  return (
    <Box sx={{
      borderRadius: "12px",
      border: "1px solid",
      borderColor: "divider",
      borderLeft: `3px solid ${borderColor}`,
      bgcolor: bgTint,
      overflow: "hidden",
      animation: `${cardEntrance} 220ms ease-out both`,
      animationDelay: `${animationDelay}ms`,
      transition: "background-color 0.35s ease",
    }}>
      {/* ── Card header (click to expand) ── */}
      <Box
        component="button"
        type="button"
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: "flex", width: "100%", alignItems: "center",
          gap: 0.75, px: 1.25, py: 0.875,
          border: "none", background: "none",
          cursor: "pointer", font: "inherit", textAlign: "left",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <Box sx={{
          color: "text.disabled",
          transition: "transform 0.2s ease",
          transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
          display: "flex",
        }}>
          <ExpandMore sx={{ fontSize: 13 }} />
        </Box>

        <StatusDot status={task.status} />

        <Typography component="span" variant="caption" noWrap
          sx={{ flex: 1, fontWeight: 600, fontSize: "0.8125rem" }}
        >
          {task.topic}
        </Typography>

        <Typography variant="caption" sx={{
          flexShrink: 0, fontSize: "0.5625rem",
          color: isRunning ? borderColor : "text.disabled",
          fontWeight: isRunning ? 500 : 400,
        }}>
          {statusText}
        </Typography>
      </Box>

      {/* ── Expandable body ── */}
      <Collapse in={expanded}>
        <Box sx={{ borderTop: "1px solid", borderColor: "divider", px: 1.25, pt: 1, pb: 1.25 }}>

          {/* Stage progress stepper */}
          {task.status !== "queued" && task.status !== "error" && (
            <TaskStepper status={task.status} />
          )}

          {/* Error message */}
          {task.error && (
            <Typography variant="caption" color="error"
              sx={{ display: "block", mb: 1, fontSize: "0.6875rem" }}
            >
              {task.error}
            </Typography>
          )}

          {/* Sources */}
          {task.webResults.length > 0 && (
            <SourceSection results={task.webResults} />
          )}

          {/* Synthesis */}
          {task.synthesis && (
            <SynthesisBlock
              synthesis={task.synthesis}
              isStreaming={task.status === "synthesizing"}
            />
          )}

          {/* Actions */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.75 }}>
            {task.savedPath && (
              <Button
                variant="outlined" size="small"
                onClick={handleOpenSaved}
                startIcon={<Description sx={{ fontSize: 11 }} />}
                sx={{ minHeight: 24, fontSize: "0.6875rem", py: 0, px: 1, borderRadius: "6px" }}
              >
                {t("research.open")}
              </Button>
            )}
            {(task.status === "done" || task.status === "error") && (
              <Button
                variant="text" size="small"
                onClick={() => onRemove(task.id)}
                startIcon={<Close sx={{ fontSize: 11 }} />}
                sx={{
                  minHeight: 24, fontSize: "0.6875rem", py: 0, px: 1,
                  color: "text.disabled", borderRadius: "6px",
                  "&:hover": { color: "text.secondary" },
                }}
              >
                {t("research.remove")}
              </Button>
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  )
}

// ──────────────────────────────────────────────────────── StatusDot ──────

function StatusDot({ status }: { status: ResearchTask["status"] }) {
  const color   = STAGE_COLOR[status]
  const running = ["searching","synthesizing","saving"].includes(status)

  if (status === "done") {
    return <CheckCircle sx={{ fontSize: 11, color: "#16a34a", flexShrink: 0 }} />
  }
  if (status === "error") {
    return <ErrorOutlineOutlined sx={{ fontSize: 11, color: "#ef4444", flexShrink: 0 }} />
  }
  return (
    <Box sx={{
      width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
      bgcolor: color,
      opacity: running ? 1 : 0.35,
      ...(running && { animation: `${stagePulse} 1.8s ease-in-out infinite` }),
    }} />
  )
}

// ────────────────────────────────────────────────────── TaskStepper ──────

function TaskStepper({ status }: { status: ResearchTask["status"] }) {
  const idx = STAGE_IDX[status]

  return (
    <Box sx={{ display: "flex", alignItems: "center", mb: 1.5, mx: 0.25 }}>
      {STEPPER_LABELS.map((label, i) => (
        <Fragment key={label}>
          {/* Stage node */}
          <Box
            title={label}
            sx={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0, cursor: "default",
              bgcolor: i < idx
                ? "#16a34a"                          // completed → green
                : i === idx
                  ? STAGE_COLOR[status]              // active → stage colour
                  : "rgba(148,163,184,0.25)",         // inactive → ghost
              transition: "background-color 0.4s ease",
              ...(i === idx && {
                animation: `${stagePulse} 1.8s ease-in-out infinite`,
              }),
            }}
          />
          {/* Connecting line */}
          {i < STEPPER_LABELS.length - 1 && (
            <Box sx={{
              flex: 1, height: "1px", minWidth: 8,
              bgcolor: i < idx ? "rgba(22,163,74,0.35)" : "rgba(148,163,184,0.18)",
              transition: "background-color 0.5s ease",
            }} />
          )}
        </Fragment>
      ))}
      {/* Current stage label */}
      <Typography variant="caption" sx={{
        ml: 1.25, fontSize: "0.5625rem",
        color: STAGE_COLOR[status], fontWeight: 600, flexShrink: 0,
      }}>
        {STEPPER_LABELS[Math.max(0, idx)]}
      </Typography>
    </Box>
  )
}

// ──────────────────────────────────────────────────── SourceSection ──────

const MAX_VISIBLE = 6

function SourceSection({ results }: { results: WebSearchResult[] }) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? results : results.slice(0, MAX_VISIBLE)
  const extra   = results.length - MAX_VISIBLE

  return (
    <Box sx={{ mb: 1.25 }}>
      {/* Section label */}
      <Typography variant="caption" sx={{
        display: "block", mb: 0.75,
        fontSize: "0.5625rem", fontWeight: 600,
        color: "text.disabled", letterSpacing: "0.06em", textTransform: "uppercase",
      }}>
        {t("research.sources", { count: results.length })}
      </Typography>

      <Stack spacing={0.375}>
        {visible.map((r, i) => (
          <SourceCard key={i} result={r} index={i} />
        ))}
      </Stack>

      {!showAll && extra > 0 && (
        <Button
          size="small" variant="text"
          onClick={() => setShowAll(true)}
          sx={{
            mt: 0.5, fontSize: "0.5625rem", px: 0.75, py: 0.2,
            color: "text.disabled", minHeight: 0, textTransform: "none",
            "&:hover": { color: "primary.main", bgcolor: "transparent" },
          }}
        >
          显示更多 +{extra}
        </Button>
      )}
    </Box>
  )
}

// ─────────────────────────────────────────────────────── SourceCard ──────

function SourceCard({ result, index }: { result: WebSearchResult; index: number }) {
  const color  = avatarColor(result.source)
  const letter = avatarLetter(result.source)

  return (
    <Box
      component="a"
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      title={result.url}
      sx={{
        display: "flex", alignItems: "center", gap: 0.875,
        px: 0.875, py: 0.625,
        borderRadius: "8px",
        border: "1px solid transparent",
        textDecoration: "none",
        cursor: "pointer",
        animation: `${sourceEntrance} 140ms ease-out both`,
        animationDelay: `${index * 55}ms`,
        transition: "background-color 0.15s, border-color 0.15s",
        "&:hover": {
          bgcolor: "action.hover",
          borderColor: "divider",
          "& .src-link-icon": { opacity: 1 },
        },
      }}
    >
      {/* Letter avatar */}
      <Box sx={{
        width: 24, height: 24, borderRadius: "6px", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        bgcolor: alpha(color, 0.12),
        color: color,
        fontSize: "0.6875rem", fontWeight: 700, lineHeight: 1,
      }}>
        {letter}
      </Box>

      {/* Title + domain */}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="caption" noWrap sx={{
          fontSize: "0.75rem", fontWeight: 500,
          display: "block", color: "text.primary",
        }}>
          {result.title}
        </Typography>
        <Typography variant="caption" noWrap sx={{
          fontSize: "0.5625rem", color: "text.disabled", display: "block",
        }}>
          {result.source}
        </Typography>
      </Box>

      {/* External link icon — visible on hover */}
      <OpenInNew className="src-link-icon" sx={{
        fontSize: 10, color: "text.disabled", flexShrink: 0,
        opacity: 0, transition: "opacity 0.15s ease",
      }} />
    </Box>
  )
}

// ────────────────────────────────────────────────────── SynthesisBlock ───

function separateThinking(text: string): { thinking: string; answer: string } {
  const m = text.match(/^<think(?:ing)?>([\s\S]*?)(?:<\/think(?:ing)?>|$)/i)
  if (m) return { thinking: m[1].trim(), answer: text.slice(m[0].length).trim() }
  return { thinking: "", answer: text }
}

function SynthesisBlock({
  synthesis,
  isStreaming,
}: {
  synthesis: string
  isStreaming: boolean
}) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const { thinking, answer } = useMemo(() => separateThinking(synthesis), [synthesis])
  const [thinkCollapsed, setThinkCollapsed] = useState(false)

  // Auto-collapse thinking once answer starts
  useEffect(() => {
    if (answer.length > 0 && thinking.length > 0 && !thinkCollapsed) {
      setThinkCollapsed(true)
    }
  }, [answer, thinking, thinkCollapsed])

  // Auto-scroll during streaming
  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [synthesis, isStreaming])

  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="caption" sx={{
        display: "block", mb: 0.875,
        fontSize: "0.5625rem", fontWeight: 600,
        color: "text.disabled", letterSpacing: "0.06em", textTransform: "uppercase",
      }}>
        {t("research.synthesis")}
      </Typography>

      {/* Left-border container (mirrors chat ThinkingBlock style) */}
      <Box
        ref={scrollRef}
        sx={{
          pl: 1.25, borderLeft: "2px solid", borderColor: "primary.light",
          maxHeight: "calc(100vh - 420px)", minHeight: 80,
          overflowY: "auto",
        }}
      >
        {/* Thinking block */}
        {thinking && (
          <Box sx={{ mb: 0.875 }}>
            <Box
              component="button" type="button"
              onClick={() => setThinkCollapsed((v) => !v)}
              sx={{
                display: "flex", alignItems: "center", gap: 0.5,
                border: "none", background: "none", cursor: "pointer",
                p: 0, font: "inherit", fontSize: "0.5625rem", color: "text.disabled",
                "&:hover": { color: "text.secondary" },
              }}
            >
              {thinkCollapsed
                ? <ChevronRight sx={{ fontSize: 10 }} />
                : <ExpandMore   sx={{ fontSize: 10 }} />
              }
              {t("research.thinking")}{isStreaming && !answer ? "…" : ""}
            </Box>

            {!thinkCollapsed && (
              <Box sx={{
                mt: 0.5, fontSize: "0.6875rem",
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                color: "text.disabled", lineHeight: 1.6, whiteSpace: "pre-wrap",
                pl: 1, borderLeft: "1px solid", borderColor: "divider",
                maxHeight: 110, overflowY: "auto",
              }}>
                {isStreaming && !answer
                  ? thinking.split("\n").slice(-5).join("\n")
                  : thinking}
              </Box>
            )}
          </Box>
        )}

        {/* Main answer */}
        {answer && (
          <MarkdownView markdown={answer} sx={{ fontSize: "0.8125rem" }} />
        )}

        {/* Blinking line caret during streaming */}
        {isStreaming && (
          <Box component="span" sx={{
            display: "inline-block",
            width: "1.5px", height: "0.85em",
            bgcolor: "text.secondary",
            verticalAlign: "text-bottom", ml: "1px",
            animation: `${caretBlink} 1.1s step-end infinite`,
          }} />
        )}
      </Box>
    </Box>
  )
}
