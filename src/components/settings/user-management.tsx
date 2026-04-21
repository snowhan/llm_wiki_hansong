import { useEffect, useState, useCallback } from "react"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import Chip from "@mui/material/Chip"
import CircularProgress from "@mui/material/CircularProgress"
import Alert from "@mui/material/Alert"
import Divider from "@mui/material/Divider"
import { useTranslation } from "react-i18next"
import { useAuthStore } from "@/stores/auth-store"
import { apiGet, apiPatch } from "@/lib/api-client"

interface UserRow {
  id: string
  username: string
  role: "member" | "admin"
  status: "pending" | "active" | "suspended"
  createdAt: string
}

export function UserManagement() {
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<{ users: UserRow[] }>("/api/admin/users")
      setUsers(data.users)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  async function updateStatus(userId: string, status: "active" | "suspended" | "pending") {
    setActionLoading(userId + "-status")
    try {
      await apiPatch(`/api/admin/users/${userId}/status`, { status })
      await fetchUsers()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  async function updateRole(userId: string, role: "member" | "admin") {
    setActionLoading(userId + "-role")
    try {
      await apiPatch(`/api/admin/users/${userId}/role`, { role })
      await fetchUsers()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  const pendingCount = users.filter((u) => u.status === "pending").length

  function statusColor(status: string): "warning" | "success" | "error" | "default" {
    if (status === "pending") return "warning"
    if (status === "active") return "success"
    if (status === "suspended") return "error"
    return "default"
  }

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }} mb={2}>
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: 15 }}>
          {t("userManagement.title")}
        </Typography>
        {pendingCount > 0 && (
          <Chip
            label={t("userManagement.pendingCount", { count: pendingCount })}
            color="warning"
            size="small"
            sx={{ fontWeight: 600 }}
          />
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : users.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("userManagement.noUsers")}
        </Typography>
      ) : (
        <Stack spacing={0} divider={<Divider />}>
          {users.map((user) => (
            <Stack
              key={user.id}
              direction="row"
              sx={{ alignItems: "center", justifyContent: "space-between" }}
              py={1.5}
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 120 }}>
                  {user.username}
                  {user.id === currentUser?.id && (
                    <Typography component="span" variant="caption" color="text.secondary" ml={0.5}>
                      (you)
                    </Typography>
                  )}
                </Typography>
                <Chip
                  label={t(`userManagement.status_${user.status}`)}
                  color={statusColor(user.status)}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: 11 }}
                />
                <Chip
                  label={t(`userMenu.role.${user.role}`)}
                  size="small"
                  variant="outlined"
                  color={user.role === "admin" ? "primary" : "default"}
                  sx={{ fontSize: 11 }}
                />
              </Stack>

              {user.id !== currentUser?.id && (
                <Stack direction="row" spacing={1}>
                  {user.status === "pending" && (
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      disabled={actionLoading === user.id + "-status"}
                      onClick={() => updateStatus(user.id, "active")}
                      sx={{ fontSize: 12, py: 0.5 }}
                    >
                      {actionLoading === user.id + "-status" ? (
                        <CircularProgress size={14} />
                      ) : (
                        t("userManagement.approve")
                      )}
                    </Button>
                  )}
                  {user.status === "active" && (
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      disabled={actionLoading === user.id + "-status"}
                      onClick={() => updateStatus(user.id, "suspended")}
                      sx={{ fontSize: 12, py: 0.5 }}
                    >
                      {t("userManagement.suspend")}
                    </Button>
                  )}
                  {user.status === "suspended" && (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={actionLoading === user.id + "-status"}
                      onClick={() => updateStatus(user.id, "active")}
                      sx={{ fontSize: 12, py: 0.5 }}
                    >
                      {t("userManagement.reactivate")}
                    </Button>
                  )}
                  {user.role === "member" && user.status === "active" && (
                    <Button
                      size="small"
                      variant="outlined"
                      color="primary"
                      disabled={actionLoading === user.id + "-role"}
                      onClick={() => updateRole(user.id, "admin")}
                      sx={{ fontSize: 12, py: 0.5 }}
                    >
                      {t("userManagement.promoteAdmin")}
                    </Button>
                  )}
                  {user.role === "admin" && (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={actionLoading === user.id + "-role"}
                      onClick={() => updateRole(user.id, "member")}
                      sx={{ fontSize: 12, py: 0.5 }}
                    >
                      {t("userManagement.demoteMember")}
                    </Button>
                  )}
                </Stack>
              )}
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  )
}
