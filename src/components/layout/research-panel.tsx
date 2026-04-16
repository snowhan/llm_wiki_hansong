import { useState, useRef, useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import TextField from "@mui/material/TextField"
import CircularProgress from "@mui/material/CircularProgress"
import Search from "@mui/icons-material/Search"
import ChevronRight from "@mui/icons-material/ChevronRight"
import ExpandMore from "@mui/icons-material/ExpandMore"
import Close from "@mui/icons-material/Close"
import CheckCircle from "@mui/icons-material/CheckCircle"
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined"
import RadioButtonUnchecked from "@mui/icons-material/RadioButtonUnchecked"
import Description from "@mui/icons-material/Description"
import Send from "@mui/icons-material/Send"
import { alpha } from "@mui/material/styles"
import { MarkdownView } from "@/components/ui/markdown-view"
import { useResearchStore, type ResearchTask } from "@/stores/research-store"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile } from "@/commands/fs"
import { queueResearch } from "@/lib/deep-research"
import { normalizePath } from "@/lib/path-utils"

export function ResearchPanel() {
  const { t } = useTranslation()
  const tasks = useResearchStore((s) => s.tasks)
  const removeTask = useResearchStore((s) => s.removeTask)
  const setPanelOpen = useResearchStore((s) => s.setPanelOpen)
  const project = useWikiStore((s) => s.project)
  const llmConfig = useWikiStore((s) => s.llmConfig)
  const searchApiConfig = useWikiStore((s) => s.searchApiConfig)
  const [inputValue, setInputValue] = useState("")

  const running = tasks.filter((task) => ["searching", "synthesizing", "saving"].includes(task.status))
  const queued = tasks.filter((task) => task.status === "queued")
  const done = tasks.filter((task) => task.status === "done" || task.status === "error")

  function handleStartResearch() {
    const topic = inputValue.trim()
    if (!topic || !project) return
    if (searchApiConfig.provider === "none" || !searchApiConfig.apiKey) {
      window.alert(t("research.webSearchNotConfigured"))
      return
    }
    queueResearch(normalizePath(project.path), topic, llmConfig, searchApiConfig)
    setInputValue("")
  }

  return (
    <Box sx={{ display: "flex", height: "100%", flexDirection: "column" }}>
      <Box
        sx={{
          display: "flex",
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          px: 1.5,
          py: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Search sx={{ fontSize: 18, color: "text.secondary" }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t("research.title")}
          </Typography>
          {(running.length > 0 || queued.length > 0) && (
            <Typography
              component="span"
              variant="caption"
              sx={{
                borderRadius: "999px",
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.2),
                px: 0.75,
                py: 0.25,
                fontWeight: 500,
                color: "primary.main",
              }}
            >
              {t("research.active", { count: running.length })}
              {queued.length > 0 ? `, ${t("research.queued", { count: queued.length })}` : ""}
            </Typography>
          )}
        </Box>
        <IconButton
          size="small"
          onClick={() => setPanelOpen(false)}
          sx={{ color: "text.secondary", "&:hover": { bgcolor: "action.hover" } }}
          aria-label="Close"
        >
          <Close sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      <Box
        sx={{
          display: "flex",
          flexShrink: 0,
          alignItems: "center",
          gap: 0.75,
          borderBottom: 1,
          borderColor: "divider",
          px: 1.5,
          py: 1,
        }}
      >
        <TextField
          size="small"
          fullWidth
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleStartResearch()
          }}
          placeholder={t("research.enterTopic")}
          variant="outlined"
          sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: 12, py: 0.75 } }}
        />
        <IconButton
          size="small"
          onClick={handleStartResearch}
          disabled={!inputValue.trim()}
          aria-label={t("review.startResearch")}
          sx={{ color: "text.secondary" }}
        >
          <Send sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {tasks.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              p: 4,
              textAlign: "center",
            }}
          >
            <Search sx={{ fontSize: 32, color: "text.disabled", opacity: 0.35 }} />
            <Typography variant="caption" color="text.secondary">
              {t("research.noTasks")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("research.noTasksHint")}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, p: 1 }}>
            {running.map((task) => (
              <ResearchTaskCard key={task.id} task={task} onRemove={removeTask} />
            ))}
            {queued.map((task) => (
              <ResearchTaskCard key={task.id} task={task} onRemove={removeTask} />
            ))}
            {done.map((task) => (
              <ResearchTaskCard key={task.id} task={task} onRemove={removeTask} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

function separateThinking(text: string): { thinking: string; answer: string } {
  const thinkRegex = /^<think(?:ing)?>([\s\S]*?)(?:<\/think(?:ing)?>|$)/i
  const match = text.match(thinkRegex)
  if (match) {
    const thinking = match[1].trim()
    const rest = text.slice(match[0].length).trim()
    return { thinking, answer: rest }
  }
  return { thinking: "", answer: text }
}

function SynthesisBlock({ synthesis, isStreaming }: { synthesis: string; isStreaming: boolean }) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const { thinking, answer } = useMemo(() => separateThinking(synthesis), [synthesis])
  const [thinkingCollapsed, setThinkingCollapsed] = useState(false)

  useEffect(() => {
    if (answer.length > 0 && thinking.length > 0 && !thinkingCollapsed) {
      setThinkingCollapsed(true)
    }
  }, [answer, thinking, thinkingCollapsed])

  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [synthesis, isStreaming])

  return (
    <Box sx={{ mb: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, fontWeight: 500 }}>
        {t("research.synthesis")}
      </Typography>
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflowY: "auto",
          borderRadius: 1,
          bgcolor: (theme) => alpha(theme.palette.action.hover, 0.5),
          p: 1,
          maxHeight: "calc(100vh - 400px)",
          minHeight: 120,
          "& .vditor-reset": {
            fontSize: "0.875rem",
            maxWidth: "none",
          },
        }}
      >
        {thinking && (
          <Box sx={{ mb: 1 }}>
            <Box
              component="button"
              type="button"
              onClick={() => setThinkingCollapsed((v) => !v)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                border: "none",
                background: "none",
                cursor: "pointer",
                p: 0,
                font: "inherit",
                fontSize: 10,
                color: "text.secondary",
                "&:hover": { color: "text.primary" },
              }}
            >
              {thinkingCollapsed ? (
                <ChevronRight sx={{ fontSize: 12 }} />
              ) : (
                <ExpandMore sx={{ fontSize: 12 }} />
              )}
              {t("research.thinking")}
              {isStreaming && !answer ? "..." : ""}
            </Box>
            {!thinkingCollapsed && (
              <Box
                sx={{
                  mt: 0.5,
                  borderRadius: 1,
                  border: 1,
                  borderColor: "divider",
                  px: 1,
                  py: 0.5,
                  fontSize: 10,
                  color: "text.secondary",
                  opacity: 0.85,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {isStreaming && !answer
                  ? thinking.split("\n").slice(-5).join("\n")
                  : thinking}
              </Box>
            )}
          </Box>
        )}
        {answer && (
          <MarkdownView markdown={answer} sx={{ fontSize: "0.875rem" }} />
        )}
        {isStreaming && (
          <Box component="span" sx={{ animation: "pulse 1s ease-in-out infinite", "@keyframes pulse": { "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.3 } } }}>
            ▊
          </Box>
        )}
      </Box>
    </Box>
  )
}

function ResearchTaskCard({ task, onRemove }: { task: ResearchTask; onRemove: (id: string) => void }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(
    task.status === "synthesizing" || task.status === "searching"
  )
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setFileContent = useWikiStore((s) => s.setFileContent)
  const project = useWikiStore((s) => s.project)

  const statusIcon = {
    queued: <RadioButtonUnchecked sx={{ fontSize: 12, color: "text.secondary" }} />,
    searching: <CircularProgress size={12} sx={{ color: "info.main" }} />,
    synthesizing: <CircularProgress size={12} sx={{ color: "#9333ea" }} />,
    saving: <CircularProgress size={12} sx={{ color: "warning.main" }} />,
    done: <CheckCircle sx={{ fontSize: 12, color: "success.dark" }} />,
    error: <ErrorOutlineOutlined sx={{ fontSize: 12, color: "error.main" }} />,
  }[task.status]

  const statusText =
    task.status === "queued"
      ? t("research.statusQueued")
      : task.status === "searching"
        ? t("research.statusSearching")
        : task.status === "synthesizing"
          ? t("research.statusSynthesizing")
          : task.status === "saving"
            ? t("research.statusSaving")
            : task.status === "done"
              ? task.savedPath
                ? t("research.statusSaved")
                : t("research.statusDone")
              : t("research.statusFailed")

  async function handleOpenSaved() {
    if (!project || !task.savedPath) return
    const path = `${normalizePath(project.path)}/${task.savedPath}`
    try {
      const content = await readFile(path)
      setSelectedFile(path)
      setFileContent(content)
    } catch {
      // ignore
    }
  }

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: 1,
        borderColor: "divider",
        typography: "caption",
      }}
    >
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
          py: 1,
          border: "none",
          background: "none",
          cursor: "pointer",
          font: "inherit",
          textAlign: "left",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        {expanded ? (
          <ExpandMore sx={{ fontSize: 12, flexShrink: 0, color: "text.secondary" }} />
        ) : (
          <ChevronRight sx={{ fontSize: 12, flexShrink: 0, color: "text.secondary" }} />
        )}
        {statusIcon}
        <Typography component="span" variant="caption" noWrap sx={{ flex: 1, fontWeight: 600 }}>
          {task.topic}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {statusText}
        </Typography>
      </Box>

      {expanded && (
        <Box sx={{ borderTop: 1, borderColor: "divider", px: 1.5, py: 1 }}>
          {task.error && (
            <Typography variant="caption" color="error" sx={{ display: "block", mb: 1 }}>
              {task.error}
            </Typography>
          )}

          {task.webResults.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontWeight: 500 }}>
                {t("research.sources", { count: task.webResults.length })}
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                {task.webResults.map((r, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 0.75,
                      borderRadius: 1,
                      bgcolor: (theme) => alpha(theme.palette.action.hover, 0.5),
                      px: 1,
                      py: 0.5,
                    }}
                  >
                    <Typography component="span" variant="caption" sx={{ flexShrink: 0, fontFamily: "monospace", color: "text.secondary" }}>
                      [{i + 1}]
                    </Typography>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="caption" noWrap sx={{ fontWeight: 500 }}>
                        {r.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                        {r.source}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {task.synthesis && (
            <SynthesisBlock synthesis={task.synthesis} isStreaming={task.status === "synthesizing"} />
          )}

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 1 }}>
            {task.savedPath && (
              <Button
                variant="outlined"
                size="small"
                onClick={handleOpenSaved}
                sx={{ minHeight: 24, fontSize: 11, gap: 0.5, py: 0, px: 1 }}
                startIcon={<Description sx={{ fontSize: 12 }} />}
              >
                {t("research.open")}
              </Button>
            )}
            {(task.status === "done" || task.status === "error") && (
              <Button
                variant="text"
                size="small"
                onClick={() => onRemove(task.id)}
                sx={{ minHeight: 24, fontSize: 11, gap: 0.5, py: 0, px: 1, color: "text.secondary" }}
                startIcon={<Close sx={{ fontSize: 12 }} />}
              >
                {t("research.remove")}
              </Button>
            )}
          </Box>
        </Box>
      )}
    </Box>
  )
}
