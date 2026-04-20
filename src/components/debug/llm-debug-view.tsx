import { useEffect, useState } from "react"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import IconButton from "@mui/material/IconButton"
import Chip from "@mui/material/Chip"
import Tooltip from "@mui/material/Tooltip"
import Collapse from "@mui/material/Collapse"
import Divider from "@mui/material/Divider"
import DeleteForeverOutlined from "@mui/icons-material/DeleteForeverOutlined"
import ExpandMore from "@mui/icons-material/ExpandMore"
import ExpandLess from "@mui/icons-material/ExpandLess"
import FiberManualRecord from "@mui/icons-material/FiberManualRecord"
import { useTranslation } from "react-i18next"
import { useLlmDebugStore } from "@/stores/llm-debug-store"
import type { LlmCallLog } from "@/stores/llm-debug-store"

// ── Source badge colors ────────────────────────────────────────────────────

const SOURCE_COLORS: Record<LlmCallLog["source"], { bg: string; fg: string }> = {
  ingest:   { bg: "#7C3AED", fg: "#fff" },
  chat:     { bg: "#0369A1", fg: "#fff" },
  lint:     { bg: "#065F46", fg: "#fff" },
  research: { bg: "#92400E", fg: "#fff" },
  enrich:   { bg: "#1D4ED8", fg: "#fff" },
  other:    { bg: "#374151", fg: "#fff" },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ── Single log card ────────────────────────────────────────────────────────

function LogCard({ log }: { log: LlmCallLog }) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()
  const srcColor = SOURCE_COLORS[log.source] ?? SOURCE_COLORS.other

  return (
    <Box
      sx={{
        borderRadius: "10px",
        border: "1px solid",
        borderColor: log.status === "error" ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.08)",
        bgcolor: log.status === "error" ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.03)",
        overflow: "hidden",
        transition: "border-color 0.15s",
        "&:hover": { borderColor: "rgba(255,255,255,0.15)" },
      }}
    >
      {/* Header row */}
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          px: 1.5,
          py: 1,
          gap: 1,
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Source badge */}
        <Box
          sx={{
            px: 1,
            py: 0.2,
            borderRadius: "6px",
            bgcolor: srcColor.bg,
            color: srcColor.fg,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            flexShrink: 0,
          }}
        >
          {log.source.toUpperCase()}
        </Box>

        {/* Time */}
        <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: 11, flexShrink: 0 }}>
          {formatTime(log.timestamp)}
        </Typography>

        {/* Provider / model */}
        <Typography
          noWrap
          sx={{ color: "rgba(255,255,255,0.6)", fontSize: 12, flex: 1, minWidth: 0 }}
        >
          {log.provider} / {log.model || "—"}
        </Typography>

        {/* Duration */}
        <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: 11, flexShrink: 0 }}>
          {formatDuration(log.durationMs)}
        </Typography>

        {/* Status */}
        <Chip
          label={log.status === "done" ? t("llmDebug.done") : t("llmDebug.error")}
          size="small"
          sx={{
            height: 18,
            fontSize: 10,
            bgcolor: log.status === "done" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            color: log.status === "done" ? "#4ADE80" : "#F87171",
            border: "1px solid",
            borderColor: log.status === "done" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
            "& .MuiChip-label": { px: 0.75 },
          }}
        />

        <IconButton
          size="small"
          sx={{ color: "rgba(255,255,255,0.3)", width: 20, height: 20, ml: 0.5 }}
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
        >
          {expanded ? <ExpandLess sx={{ fontSize: 14 }} /> : <ExpandMore sx={{ fontSize: 14 }} />}
        </IconButton>
      </Stack>

      {/* Expandable body */}
      <Collapse in={expanded}>
        <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
        <Box sx={{ p: 1.5 }}>

          {/* Input messages */}
          <Typography sx={{ color: "rgba(255,255,255,0.35)", fontSize: 11, mb: 0.75, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {t("llmDebug.input")} ({log.messages.length} {t("llmDebug.messages")})
          </Typography>
          <Stack spacing={0.75} sx={{ mb: 1.5 }}>
            {log.messages.map((msg, i) => (
              <Box
                key={i}
                sx={{
                  borderRadius: "6px",
                  p: 1,
                  bgcolor: msg.role === "system"
                    ? "rgba(124,58,237,0.1)"
                    : msg.role === "assistant"
                    ? "rgba(3,105,161,0.1)"
                    : "rgba(255,255,255,0.04)",
                  border: "1px solid",
                  borderColor: msg.role === "system"
                    ? "rgba(124,58,237,0.2)"
                    : msg.role === "assistant"
                    ? "rgba(3,105,161,0.2)"
                    : "rgba(255,255,255,0.06)",
                }}
              >
                <Typography
                  sx={{
                    color: msg.role === "system" ? "#A78BFA" : msg.role === "assistant" ? "#60A5FA" : "rgba(255,255,255,0.5)",
                    fontSize: 10,
                    fontWeight: 700,
                    mb: 0.4,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {msg.role}
                </Typography>
                <Typography
                  component="pre"
                  sx={{
                    color: "rgba(255,255,255,0.75)",
                    fontSize: 11,
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    m: 0,
                    maxHeight: 300,
                    overflow: "auto",
                  }}
                >
                  {msg.content}
                </Typography>
              </Box>
            ))}
          </Stack>

          {/* Output */}
          <Typography sx={{ color: "rgba(255,255,255,0.35)", fontSize: 11, mb: 0.75, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {t("llmDebug.output")}
          </Typography>
          {log.status === "error" && log.error ? (
            <Box sx={{ borderRadius: "6px", p: 1, bgcolor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <Typography sx={{ color: "#F87171", fontSize: 11, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {log.error}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ borderRadius: "6px", p: 1, bgcolor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <Typography
                component="pre"
                sx={{
                  color: "rgba(255,255,255,0.8)",
                  fontSize: 11,
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  m: 0,
                  maxHeight: 400,
                  overflow: "auto",
                }}
              >
                {log.output || t("llmDebug.emptyOutput")}
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

// ── Main view ──────────────────────────────────────────────────────────────

export function LlmDebugView() {
  const { t } = useTranslation()
  const logs = useLlmDebugStore((s) => s.logs)
  const isConnected = useLlmDebugStore((s) => s.isConnected)
  const connectSSE = useLlmDebugStore((s) => s.connectSSE)
  const disconnectSSE = useLlmDebugStore((s) => s.disconnectSSE)
  const clearLogs = useLlmDebugStore((s) => s.clearLogs)

  useEffect(() => {
    connectSSE()
    return () => disconnectSSE()
  }, [connectSSE, disconnectSSE])

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "#0F0D13",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          px: 2,
          py: 1.25,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          gap: 1.5,
        }}
      >
        <Typography sx={{ fontWeight: 600, fontSize: 14, color: "#F5F3EF", flex: 1 }}>
          {t("llmDebug.title")}
        </Typography>

        {/* Live indicator */}
        <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
          <FiberManualRecord
            sx={{
              fontSize: 8,
              color: isConnected ? "#4ADE80" : "rgba(255,255,255,0.25)",
              animation: isConnected ? "pulse 2s ease-in-out infinite" : "none",
              "@keyframes pulse": {
                "0%, 100%": { opacity: 1 },
                "50%": { opacity: 0.4 },
              },
            }}
          />
          <Typography sx={{ fontSize: 11, color: isConnected ? "#4ADE80" : "rgba(255,255,255,0.3)" }}>
            {isConnected ? t("llmDebug.live") : t("llmDebug.disconnected")}
          </Typography>
        </Stack>

        {/* Log count */}
        <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
          {logs.length} {t("llmDebug.records")}
        </Typography>

        {/* Clear button */}
        <Tooltip title={t("llmDebug.clearAll")} placement="left">
          <span>
            <IconButton
              size="small"
              disabled={logs.length === 0}
              onClick={clearLogs}
              sx={{
                color: "rgba(255,255,255,0.35)",
                "&:hover": { color: "#F87171" },
                "&.Mui-disabled": { color: "rgba(255,255,255,0.1)" },
              }}
            >
              <DeleteForeverOutlined sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/* Log list */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 1.5,
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
          "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(255,255,255,0.1)", borderRadius: 3 },
        }}
      >
        {logs.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 1,
              opacity: 0.4,
            }}
          >
            <Typography sx={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
              {t("llmDebug.empty")}
            </Typography>
            <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
              {t("llmDebug.emptyHint")}
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1}>
            {logs.map((log) => (
              <LogCard key={log.id} log={log} />
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  )
}
