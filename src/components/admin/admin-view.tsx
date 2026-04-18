import { useState, useEffect, useCallback } from "react"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import Paper from "@mui/material/Paper"
import Divider from "@mui/material/Divider"
import Button from "@mui/material/Button"
import TextField from "@mui/material/TextField"
import Chip from "@mui/material/Chip"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import CircularProgress from "@mui/material/CircularProgress"
import Alert from "@mui/material/Alert"
import Refresh from "@mui/icons-material/Refresh"
import DeleteForever from "@mui/icons-material/DeleteForever"
import AdminPanelSettings from "@mui/icons-material/AdminPanelSettings"
import Memory from "@mui/icons-material/Memory"
import FolderOpen from "@mui/icons-material/FolderOpen"
import Lock from "@mui/icons-material/Lock"
import LockOpen from "@mui/icons-material/LockOpen"
import { useTranslation } from "react-i18next"

const ADMIN_TOKEN_KEY = "llm-wiki-admin-token"

function getAdminToken(): string {
  try { return localStorage.getItem(ADMIN_TOKEN_KEY) ?? "" } catch { return "" }
}
function setAdminToken(t: string): void {
  try {
    if (t) localStorage.setItem(ADMIN_TOKEN_KEY, t)
    else localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch { /* ignore */ }
}

interface ServerStatus {
  uptime: number
  memory: { heapUsed: number; heapTotal: number; rss: number }
  tasks: { total: number; pending: number; running: number; done: number; error: number }
}

interface RegistryProject {
  id: string
  name: string
  path: string
  createdAt?: string
}

function adminApiGet<T>(url: string, adminToken: string): Promise<T> {
  return fetch(url, { headers: { Authorization: `Bearer ${adminToken}` } }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json() as Promise<T>
  })
}

function adminApiDelete(url: string, adminToken: string): Promise<void> {
  return fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } }).then((r) => {
    if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`)
  })
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function AdminView() {
  const { t } = useTranslation()
  const [adminToken, setAdminTokenState] = useState(() => getAdminToken())
  const [tokenInput, setTokenInput] = useState(getAdminToken())
  const [tokenSaved, setTokenSaved] = useState(!!getAdminToken())

  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState("")

  const [projects, setProjects] = useState<RegistryProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    if (!adminToken) return
    setStatusLoading(true)
    setStatusError("")
    try {
      const data = await adminApiGet<ServerStatus>("/api/admin/status", adminToken)
      setStatus(data)
    } catch (err) {
      setStatusError(String(err))
    } finally {
      setStatusLoading(false)
    }
  }, [adminToken])

  const loadProjects = useCallback(async () => {
    if (!adminToken) return
    setProjectsLoading(true)
    setProjectsError("")
    try {
      const data = await adminApiGet<{ projects: RegistryProject[] }>("/api/admin/projects", adminToken)
      setProjects(data.projects)
    } catch (err) {
      setProjectsError(String(err))
    } finally {
      setProjectsLoading(false)
    }
  }, [adminToken])

  useEffect(() => {
    if (adminToken) {
      loadStatus()
      loadProjects()
    }
  }, [adminToken, loadStatus, loadProjects])

  const handleSaveToken = () => {
    const trimmed = tokenInput.trim()
    setAdminToken(trimmed)
    setAdminTokenState(trimmed)
    setTokenSaved(!!trimmed)
  }

  const handleDeleteProject = async (id: string) => {
    if (!adminToken) return
    setDeletingId(id)
    try {
      await adminApiDelete(`/api/admin/projects/${id}`, adminToken)
      setProjects((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      setProjectsError(String(err))
    } finally {
      setDeletingId(null)
    }
  }

  const sectionSx = {
    p: 2,
    borderRadius: "12px",
    bgcolor: "rgba(28,25,23,0.6)",
    border: "1px solid rgba(245,243,239,0.06)",
  }

  const labelSx = {
    fontSize: "0.7rem",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "text.tertiary",
    mb: 1.5,
  }

  return (
    <Box
      sx={{
        height: "100%",
        overflowY: "auto",
        p: 3,
        bgcolor: "#1A1614",
      }}
    >
      <Stack spacing={3} sx={{ maxWidth: 720, mx: "auto" }}>
        {/* Header */}
        <Stack direction="row" spacing={1.5} sx={{ "alignItems": "center" }}>
          <AdminPanelSettings sx={{ fontSize: 22, color: "#C2410C" }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: "text.primary", fontSize: "1rem" }}>
            {t("admin.title")}
          </Typography>
        </Stack>

        {/* Access Control */}
        <Paper elevation={0} sx={sectionSx}>
          <Stack direction="row" spacing={1} sx={{ "alignItems": "center",  mb: 1.5 }}>
            {tokenSaved ? (
              <Lock sx={{ fontSize: 14, color: "#15803D" }} />
            ) : (
              <LockOpen sx={{ fontSize: 14, color: "#D97706" }} />
            )}
            <Typography sx={labelSx} style={{ marginBottom: 0 }}>
              {t("admin.accessControl")}
            </Typography>
          </Stack>
          <Divider sx={{ mb: 2, borderColor: "rgba(245,243,239,0.06)" }} />

          <Stack direction="row" spacing={1.5} sx={{ "alignItems": "flex-start" }}>
            <TextField
              size="small"
              type="password"
              label={t("admin.adminToken")}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveToken()}
              placeholder={t("admin.adminTokenPlaceholder")}
              sx={{
                flex: 1,
                "& .MuiOutlinedInput-root": {
                  bgcolor: "rgba(28,25,23,0.8)",
                  borderRadius: "8px",
                  "& fieldset": { borderColor: "rgba(245,243,239,0.1)" },
                  "&:hover fieldset": { borderColor: "rgba(245,243,239,0.2)" },
                  "&.Mui-focused fieldset": { borderColor: "#C2410C" },
                },
                "& .MuiInputLabel-root": { color: "text.tertiary" },
                "& .MuiInputLabel-root.Mui-focused": { color: "#C2410C" },
              }}
            />
            <Button
              variant="contained"
              size="small"
              onClick={handleSaveToken}
              sx={{
                bgcolor: "#C2410C",
                "&:hover": { bgcolor: "#9A3409" },
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "0.8rem",
                height: 40,
                px: 2,
              }}
            >
              {t("admin.saveToken")}
            </Button>
          </Stack>

          {tokenSaved && (
            <Typography sx={{ fontSize: "0.72rem", color: "#15803D", mt: 1 }}>
              {t("admin.tokenSaved")}
            </Typography>
          )}
        </Paper>

        {/* Server Status */}
        <Paper elevation={0} sx={sectionSx}>
          <Stack direction="row" sx={{ "alignItems": "center", "justifyContent": "space-between",  mb: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ "alignItems": "center" }}>
              <Memory sx={{ fontSize: 14, color: "text.tertiary" }} />
              <Typography sx={labelSx} style={{ marginBottom: 0 }}>
                {t("admin.serverStatus")}
              </Typography>
            </Stack>
            <Tooltip title={t("admin.refresh")} placement="left">
              <IconButton
                size="small"
                onClick={loadStatus}
                disabled={statusLoading || !adminToken}
                sx={{ color: "text.tertiary", "&:hover": { color: "text.primary" } }}
              >
                {statusLoading ? (
                  <CircularProgress size={14} sx={{ color: "text.tertiary" }} />
                ) : (
                  <Refresh sx={{ fontSize: 14 }} />
                )}
              </IconButton>
            </Tooltip>
          </Stack>
          <Divider sx={{ mb: 2, borderColor: "rgba(245,243,239,0.06)" }} />

          {!adminToken ? (
            <Typography sx={{ fontSize: "0.8rem", color: "text.tertiary" }}>
              {t("admin.tokenRequired")}
            </Typography>
          ) : statusError ? (
            <Alert severity="error" sx={{ fontSize: "0.78rem" }}>{statusError}</Alert>
          ) : status ? (
            <Stack spacing={2}>
              <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap" }}>
                <Box>
                  <Typography sx={{ fontSize: "0.68rem", color: "text.tertiary", mb: 0.25 }}>
                    {t("admin.uptime")}
                  </Typography>
                  <Typography sx={{ fontSize: "0.88rem", fontWeight: 600, color: "text.primary" }}>
                    {formatUptime(status.uptime)}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: "0.68rem", color: "text.tertiary", mb: 0.25 }}>
                    {t("admin.heapUsed")}
                  </Typography>
                  <Typography sx={{ fontSize: "0.88rem", fontWeight: 600, color: "text.primary" }}>
                    {status.memory.heapUsed} MB
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: "0.68rem", color: "text.tertiary", mb: 0.25 }}>
                    {t("admin.heapTotal")}
                  </Typography>
                  <Typography sx={{ fontSize: "0.88rem", fontWeight: 600, color: "text.primary" }}>
                    {status.memory.heapTotal} MB
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: "0.68rem", color: "text.tertiary", mb: 0.25 }}>
                    RSS
                  </Typography>
                  <Typography sx={{ fontSize: "0.88rem", fontWeight: 600, color: "text.primary" }}>
                    {status.memory.rss} MB
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                <Chip
                  label={`${t("admin.tasks.total")}: ${status.tasks.total}`}
                  size="small"
                  sx={{ fontSize: "0.72rem", bgcolor: "rgba(245,243,239,0.06)", color: "text.secondary" }}
                />
                {status.tasks.running > 0 && (
                  <Chip
                    label={`${t("admin.tasks.running")}: ${status.tasks.running}`}
                    size="small"
                    sx={{ fontSize: "0.72rem", bgcolor: "rgba(3,105,161,0.2)", color: "#38BDF8" }}
                  />
                )}
                {status.tasks.pending > 0 && (
                  <Chip
                    label={`${t("admin.tasks.pending")}: ${status.tasks.pending}`}
                    size="small"
                    sx={{ fontSize: "0.72rem", bgcolor: "rgba(217,119,6,0.2)", color: "#FCD34D" }}
                  />
                )}
                {status.tasks.done > 0 && (
                  <Chip
                    label={`${t("admin.tasks.done")}: ${status.tasks.done}`}
                    size="small"
                    sx={{ fontSize: "0.72rem", bgcolor: "rgba(21,128,61,0.2)", color: "#4ADE80" }}
                  />
                )}
                {status.tasks.error > 0 && (
                  <Chip
                    label={`${t("admin.tasks.error")}: ${status.tasks.error}`}
                    size="small"
                    sx={{ fontSize: "0.72rem", bgcolor: "rgba(185,28,28,0.2)", color: "#F87171" }}
                  />
                )}
              </Stack>
            </Stack>
          ) : (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={14} sx={{ color: "text.tertiary" }} />
              <Typography sx={{ fontSize: "0.8rem", color: "text.tertiary" }}>{t("admin.loading")}</Typography>
            </Box>
          )}
        </Paper>

        {/* Project Management */}
        <Paper elevation={0} sx={sectionSx}>
          <Stack direction="row" sx={{ "alignItems": "center", "justifyContent": "space-between",  mb: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ "alignItems": "center" }}>
              <FolderOpen sx={{ fontSize: 14, color: "text.tertiary" }} />
              <Typography sx={labelSx} style={{ marginBottom: 0 }}>
                {t("admin.projects")}
              </Typography>
            </Stack>
            <Tooltip title={t("admin.refresh")} placement="left">
              <IconButton
                size="small"
                onClick={loadProjects}
                disabled={projectsLoading || !adminToken}
                sx={{ color: "text.tertiary", "&:hover": { color: "text.primary" } }}
              >
                {projectsLoading ? (
                  <CircularProgress size={14} sx={{ color: "text.tertiary" }} />
                ) : (
                  <Refresh sx={{ fontSize: 14 }} />
                )}
              </IconButton>
            </Tooltip>
          </Stack>
          <Divider sx={{ mb: 2, borderColor: "rgba(245,243,239,0.06)" }} />

          {!adminToken ? (
            <Typography sx={{ fontSize: "0.8rem", color: "text.tertiary" }}>
              {t("admin.tokenRequired")}
            </Typography>
          ) : projectsError ? (
            <Alert severity="error" sx={{ fontSize: "0.78rem" }}>{projectsError}</Alert>
          ) : projects.length === 0 ? (
            <Typography sx={{ fontSize: "0.8rem", color: "text.tertiary" }}>
              {projectsLoading ? t("admin.loading") : t("admin.noProjects")}
            </Typography>
          ) : (
            <Stack spacing={1}>
              {projects.map((proj) => (
                <Stack
                  key={proj.id}
                  direction="row"
                  spacing={1.5}
                  sx={{
                    alignItems: "center",
                    px: 1.5,
                    py: 1,
                    borderRadius: "8px",
                    bgcolor: "rgba(245,243,239,0.03)",
                    border: "1px solid rgba(245,243,239,0.04)",
                    "&:hover": { bgcolor: "rgba(245,243,239,0.06)" },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{ fontSize: "0.84rem", fontWeight: 600, color: "text.primary", mb: 0.25 }}
                      noWrap
                    >
                      {proj.name}
                    </Typography>
                    <Typography
                      sx={{ fontSize: "0.7rem", color: "text.tertiary", fontFamily: "monospace" }}
                      noWrap
                    >
                      {proj.path}
                    </Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontSize: "0.64rem",
                      color: "text.tertiary",
                      fontFamily: "monospace",
                      flexShrink: 0,
                    }}
                  >
                    {proj.id.slice(0, 8)}…
                  </Typography>
                  <Tooltip title={t("admin.removeFromRegistry")} placement="left">
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteProject(proj.id)}
                      disabled={deletingId === proj.id}
                      sx={{
                        color: "text.tertiary",
                        flexShrink: 0,
                        "&:hover": { color: "#F87171" },
                      }}
                    >
                      {deletingId === proj.id ? (
                        <CircularProgress size={12} sx={{ color: "text.tertiary" }} />
                      ) : (
                        <DeleteForever sx={{ fontSize: 15 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                </Stack>
              ))}
            </Stack>
          )}
        </Paper>
      </Stack>
    </Box>
  )
}
