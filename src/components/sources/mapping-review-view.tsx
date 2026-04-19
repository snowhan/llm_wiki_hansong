import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import Chip from "@mui/material/Chip"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import TextField from "@mui/material/TextField"
import Select from "@mui/material/Select"
import MenuItem from "@mui/material/MenuItem"
import Collapse from "@mui/material/Collapse"
import CircularProgress from "@mui/material/CircularProgress"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import ExpandLessIcon from "@mui/icons-material/ExpandLess"
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep"
import { useMappingCheckStore } from "@/stores/mapping-check-store"
import type { MappingCheckItem } from "@/stores/mapping-check-store"
import { checkMappingRisk } from "@/lib/mapping-check"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile, writeFile } from "@/commands/fs"

type FilterTab = "all" | "high" | "approved"

interface EditState {
  title: string
  type: string
}

function updateFrontmatterField(content: string, field: string, value: string): string {
  const fmRegex = /^(---\s*\n)([\s\S]*?)(\n---)/
  const m = content.match(fmRegex)
  if (!m) return content

  const fmBody = m[2]
  const fieldRegex = new RegExp(`^(${field}:\\s*)(.+)$`, "m")

  let newFmBody: string
  if (fieldRegex.test(fmBody)) {
    newFmBody = fmBody.replace(fieldRegex, (_, prefix) => {
      const val = field === "title" ? `"${value.replace(/"/g, '\\"')}"` : value
      return `${prefix}${val}`
    })
  } else {
    const val = field === "title" ? `"${value.replace(/"/g, '\\"')}"` : value
    newFmBody = fmBody + `\n${field}: ${val}`
  }

  return content.replace(fmRegex, `${m[1]}${newFmBody}${m[3]}`)
}

function MappingCheckCard({
  item,
  onApprove,
  onOpenEditor,
  onUpdate,
}: {
  item: MappingCheckItem
  onApprove: () => void
  onOpenEditor: () => void
  onUpdate: (updated: Partial<MappingCheckItem>) => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const project = useWikiStore((s) => s.project)

  const handleEditStart = () => {
    setEditing({ title: item.frontmatterTitle, type: item.frontmatterType })
  }

  const handleSave = async () => {
    if (!editing || !project) return
    setSaving(true)
    try {
      let content = await readFile(project.id, item.filePath)
      content = updateFrontmatterField(content, "title", editing.title)
      content = updateFrontmatterField(content, "type", editing.type)
      await writeFile(project.id, item.filePath, content)
      const risk = checkMappingRisk(item.filePath, editing.type)
      onUpdate({
        frontmatterTitle: editing.title,
        frontmatterType: editing.type,
        riskLevel: risk.riskLevel,
        riskReason: risk.reason,
      })
      setEditing(null)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch (err) {
      console.error("[MappingReview] save failed", err)
    } finally {
      setSaving(false)
    }
  }

  const isHighRisk = item.riskLevel === "high"
  const isApproved = item.status === "approved"

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: isApproved
          ? "rgba(245,243,239,0.08)"
          : isHighRisk
            ? "rgba(220, 38, 38, 0.4)"
            : "rgba(245,243,239,0.12)",
        borderRadius: "10px",
        p: 1.5,
        bgcolor: isApproved
          ? "transparent"
          : isHighRisk
            ? "rgba(220, 38, 38, 0.05)"
            : "rgba(245,243,239,0.03)",
        opacity: isApproved ? 0.55 : 1,
        transition: "opacity 0.2s",
      }}
    >
      {/* Header row */}
      <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
        {/* Risk badge */}
        <Tooltip title={item.riskReason ?? (isHighRisk ? t("mappingCheck.riskHigh") : t("mappingCheck.riskOk"))}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.3,
              px: 0.75,
              py: 0.25,
              borderRadius: "6px",
              bgcolor: isHighRisk ? "rgba(220,38,38,0.18)" : "rgba(22,163,74,0.15)",
              color: isHighRisk ? "#F87171" : "#4ADE80",
              flexShrink: 0,
              cursor: "default",
            }}
          >
            {isHighRisk ? (
              <WarningAmberIcon sx={{ fontSize: 13 }} />
            ) : (
              <CheckCircleOutlineIcon sx={{ fontSize: 13 }} />
            )}
            <Typography sx={{ fontSize: 10, fontWeight: 700, lineHeight: 1 }}>
              {isHighRisk ? t("mappingCheck.riskHigh") : t("mappingCheck.riskOk")}
            </Typography>
          </Box>
        </Tooltip>

        {/* Path type chip */}
        <Chip
          label={item.pathType}
          size="small"
          sx={{
            height: 20,
            fontSize: 10,
            bgcolor:
              item.pathType === "entity"
                ? "rgba(59,130,246,0.15)"
                : item.pathType === "concept"
                  ? "rgba(168,85,247,0.15)"
                  : "rgba(245,243,239,0.08)",
            color:
              item.pathType === "entity"
                ? "#93C5FD"
                : item.pathType === "concept"
                  ? "#C4B5FD"
                  : "text.secondary",
            "& .MuiChip-label": { px: 0.75 },
          }}
        />

        {/* File path */}
        <Typography
          sx={{
            fontSize: 11,
            color: "text.secondary",
            flex: 1,
            wordBreak: "break-all",
            lineHeight: 1.4,
          }}
        >
          {item.filePath}
        </Typography>

        {/* Actions */}
        <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
          <Tooltip title={t("mappingCheck.openInEditor")}>
            <IconButton size="small" onClick={onOpenEditor} sx={{ color: "text.secondary", "&:hover": { color: "#F5F3EF" } }}>
              <OpenInNewIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          {!isApproved && (
            <Tooltip title={t("mappingCheck.markApproved")}>
              <IconButton size="small" onClick={onApprove} sx={{ color: "text.secondary", "&:hover": { color: "#4ADE80" } }}>
                <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>

      {/* Fields row */}
      {editing ? (
        <Stack direction="column" spacing={1} sx={{ mb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography sx={{ fontSize: 11, color: "text.secondary", minWidth: 60 }}>
              {t("mappingCheck.frontmatterTitle")}
            </Typography>
            <TextField
              size="small"
              value={editing.title}
              onChange={(e) => setEditing((prev) => prev ? { ...prev, title: e.target.value } : null)}
              sx={{
                flex: 1,
                "& .MuiOutlinedInput-root": {
                  fontSize: 12,
                  bgcolor: "rgba(245,243,239,0.05)",
                  "& fieldset": { borderColor: "rgba(245,243,239,0.15)" },
                },
              }}
            />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography sx={{ fontSize: 11, color: "text.secondary", minWidth: 60 }}>
              {t("mappingCheck.frontmatterType")}
            </Typography>
            <Select
              size="small"
              value={editing.type}
              onChange={(e) => setEditing((prev) => prev ? { ...prev, type: e.target.value } : null)}
              sx={{
                fontSize: 12,
                minWidth: 120,
                bgcolor: "rgba(245,243,239,0.05)",
                "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(245,243,239,0.15)" },
              }}
            >
              <MenuItem value="entity">entity</MenuItem>
              <MenuItem value="concept">concept</MenuItem>
              <MenuItem value="source">source</MenuItem>
              <MenuItem value="comparison">comparison</MenuItem>
              <MenuItem value="synthesis">synthesis</MenuItem>
            </Select>
            <Button
              size="small"
              variant="contained"
              disabled={saving}
              onClick={handleSave}
              sx={{
                fontSize: 11,
                height: 28,
                bgcolor: "#C2410C",
                "&:hover": { bgcolor: "#9A3412" },
                "&:disabled": { bgcolor: "rgba(194,65,12,0.4)" },
              }}
            >
              {saving ? <CircularProgress size={12} sx={{ color: "inherit" }} /> : t("mappingCheck.saveChanges")}
            </Button>
            <Button
              size="small"
              onClick={() => setEditing(null)}
              sx={{ fontSize: 11, height: 28, color: "text.secondary" }}
            >
              取消
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack direction="row" spacing={2} sx={{ mb: 1 }} alignItems="center">
          <Box>
            <Typography sx={{ fontSize: 10, color: "text.disabled", mb: 0.25 }}>
              {t("mappingCheck.frontmatterTitle")}
            </Typography>
            <Typography sx={{ fontSize: 12, color: "#F5F3EF" }}>
              {item.frontmatterTitle || <em style={{ color: "rgba(245,243,239,0.3)" }}>（无）</em>}
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 10, color: "text.disabled", mb: 0.25 }}>
              {t("mappingCheck.frontmatterType")}
            </Typography>
            <Typography
              sx={{
                fontSize: 12,
                color: isHighRisk && item.frontmatterType ? "#F87171" : "#F5F3EF",
                fontWeight: isHighRisk ? 600 : 400,
              }}
            >
              {item.frontmatterType || <em style={{ color: "rgba(245,243,239,0.3)" }}>（无）</em>}
            </Typography>
          </Box>
          {!isApproved && (
            <Button
              size="small"
              onClick={handleEditStart}
              sx={{
                fontSize: 10,
                height: 22,
                color: "text.secondary",
                borderColor: "rgba(245,243,239,0.12)",
                border: "1px solid",
                borderRadius: "6px",
                px: 1,
                "&:hover": { color: "#F5F3EF", borderColor: "rgba(245,243,239,0.25)" },
              }}
            >
              编辑
            </Button>
          )}
          {savedFlash && (
            <Typography sx={{ fontSize: 11, color: "#4ADE80" }}>
              {t("mappingCheck.savedSuccess")}
            </Typography>
          )}
        </Stack>
      )}

      {/* Content preview */}
      {item.contentPreview && (
        <Box>
          <Button
            size="small"
            endIcon={previewOpen ? <ExpandLessIcon sx={{ fontSize: 12 }} /> : <ExpandMoreIcon sx={{ fontSize: 12 }} />}
            onClick={() => setPreviewOpen((v) => !v)}
            sx={{ fontSize: 10, color: "text.disabled", p: 0, minWidth: 0, "&:hover": { color: "text.secondary" } }}
          >
            {t("mappingCheck.contentPreview")}
          </Button>
          <Collapse in={previewOpen}>
            <Typography
              sx={{
                mt: 0.5,
                fontSize: 11,
                color: "text.secondary",
                bgcolor: "rgba(245,243,239,0.04)",
                borderRadius: "6px",
                p: 1,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {item.contentPreview}
            </Typography>
          </Collapse>
        </Box>
      )}
    </Box>
  )
}

export function MappingReviewView() {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const { items, loading, loadItems, approveItem, clearItems, setItems } = useMappingCheckStore()
  const [filter, setFilter] = useState<FilterTab>("all")

  useEffect(() => {
    if (project) {
      loadItems(project.id)
    }
  }, [project, loadItems])

  const handleOpenEditor = useCallback(
    (filePath: string) => {
      setSelectedFile(filePath)
      setActiveView("wiki")
    },
    [setSelectedFile, setActiveView],
  )

  const handleApprove = useCallback(
    async (item: MappingCheckItem) => {
      if (!project) return
      await approveItem(project.id, item.id)
    },
    [project, approveItem],
  )

  const handleUpdate = useCallback(
    (id: string, updates: Partial<MappingCheckItem>) => {
      setItems(items.map((i) => (i.id === id ? { ...i, ...updates } : i)))
    },
    [items, setItems],
  )

  const handleClearAll = useCallback(async () => {
    if (!project) return
    if (!window.confirm(t("mappingCheck.clearConfirm"))) return
    await clearItems(project.id)
  }, [project, clearItems, t])

  const filtered = items.filter((item) => {
    if (filter === "high") return item.riskLevel === "high" && item.status === "pending"
    if (filter === "approved") return item.status === "approved"
    return true
  })

  const highRiskCount = items.filter((i) => i.riskLevel === "high" && i.status === "pending").length
  const approvedCount = items.filter((i) => i.status === "approved").length

  const getEmptyMessage = () => {
    if (filter === "high") return t("mappingCheck.emptyHighRisk")
    if (filter === "approved") return t("mappingCheck.emptyApproved")
    return t("mappingCheck.empty")
  }

  const tabSx = (active: boolean) => ({
    fontSize: 12,
    px: 1.5,
    py: 0.5,
    borderRadius: "8px",
    cursor: "pointer",
    color: active ? "#F5F3EF" : "text.secondary",
    bgcolor: active ? "rgba(194,65,12,0.2)" : "transparent",
    border: "1px solid",
    borderColor: active ? "rgba(194,65,12,0.4)" : "transparent",
    transition: "all 0.15s",
    "&:hover": { color: "#F5F3EF", bgcolor: active ? "rgba(194,65,12,0.25)" : "rgba(245,243,239,0.06)" },
    userSelect: "none" as const,
  })

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "#1A1723",
        color: "#F5F3EF",
      }}
    >
      {/* Header */}
      <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: "1px solid rgba(245,243,239,0.06)" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#F5F3EF" }}>
            {t("mappingCheck.title")}
          </Typography>
          {items.length > 0 && (
            <Tooltip title={t("mappingCheck.clearAll")}>
              <IconButton
                size="small"
                onClick={handleClearAll}
                sx={{ color: "text.disabled", "&:hover": { color: "#F87171" } }}
              >
                <DeleteSweepIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
        <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>
          {t("mappingCheck.subtitle")}
        </Typography>

        {/* Stats */}
        {items.length > 0 && (
          <Stack direction="row" spacing={1.5} sx={{ mb: 1.5 }}>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {t("mappingCheck.totalFiles", { count: items.length })}
            </Typography>
            {highRiskCount > 0 && (
              <Typography sx={{ fontSize: 12, color: "#F87171", fontWeight: 600 }}>
                {t("mappingCheck.highRiskFiles", { count: highRiskCount })}
              </Typography>
            )}
          </Stack>
        )}

        {/* Filter tabs */}
        <Stack direction="row" spacing={0.75}>
          {(
            [
              { key: "all" as FilterTab, label: t("mappingCheck.filterAll"), count: items.length },
              { key: "high" as FilterTab, label: t("mappingCheck.filterHighRisk"), count: highRiskCount },
              { key: "approved" as FilterTab, label: t("mappingCheck.filterApproved"), count: approvedCount },
            ] as { key: FilterTab; label: string; count: number }[]
          ).map(({ key, label, count }) => (
            <Box key={key} sx={tabSx(filter === key)} onClick={() => setFilter(key)}>
              {label}
              {count > 0 && (
                <Box
                  component="span"
                  sx={{
                    ml: 0.5,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 16,
                    height: 16,
                    borderRadius: "999px",
                    bgcolor:
                      key === "high"
                        ? "rgba(220,38,38,0.3)"
                        : filter === key
                          ? "rgba(194,65,12,0.3)"
                          : "rgba(245,243,239,0.1)",
                    fontSize: 9,
                    fontWeight: 700,
                    px: 0.5,
                    color: key === "high" ? "#F87171" : "inherit",
                  }}
                >
                  {count}
                </Box>
              )}
            </Box>
          ))}
        </Stack>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: "auto", px: 2.5, py: 2 }}>
        {loading ? (
          <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", gap: 1 }}>
            <CircularProgress size={24} sx={{ color: "#C2410C" }} />
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {t("app.loading")}
            </Typography>
          </Stack>
        ) : filtered.length === 0 ? (
          <Stack alignItems="center" justifyContent="center" sx={{ height: "50%", gap: 1 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 32, color: filter === "high" ? "#4ADE80" : "text.disabled" }} />
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              {getEmptyMessage()}
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            {filtered.map((item) => (
              <MappingCheckCard
                key={item.id}
                item={item}
                onApprove={() => handleApprove(item)}
                onOpenEditor={() => handleOpenEditor(item.filePath)}
                onUpdate={(updates) => handleUpdate(item.id, updates)}
              />
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  )
}
