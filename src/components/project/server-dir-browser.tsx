import { useState, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import List from "@mui/material/List"
import ListItemButton from "@mui/material/ListItemButton"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import FolderIcon from "@mui/icons-material/Folder"
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward"
import CircularProgress from "@mui/material/CircularProgress"
import LockIcon from "@mui/icons-material/Lock"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiGet } from "@/lib/api-client"

interface ServerDirBrowserProps {
  open: boolean
  onClose: () => void
  onSelect: (path: string) => void
  title?: string
  initialPath?: string
  /** When set, navigation is locked to this directory and its descendants. */
  rootConstraint?: string
}

interface BrowseResult {
  dirs: string[]
  files: string[]
}

export function ServerDirBrowser({
  open: isOpen,
  onClose,
  onSelect,
  title,
  initialPath,
  rootConstraint,
}: ServerDirBrowserProps) {
  const { t } = useTranslation()
  const [currentPath, setCurrentPath] = useState("")
  const [dirs, setDirs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [inputPath, setInputPath] = useState("")
  const [inputWarning, setInputWarning] = useState("")
  // Track whether we're currently open to avoid stale closure updates
  const isOpenRef = useRef(isOpen)
  isOpenRef.current = isOpen

  // Each time dialog opens, reset to the constrained root immediately
  // Do NOT depend on currentPath here — navigation is handled explicitly below
  useEffect(() => {
    if (!isOpen) return
    const startPath = rootConstraint || initialPath || "/"
    setCurrentPath(startPath)
    setInputPath(startPath)
    setDirs([])
    setError("")
    setInputWarning("")
    void browseDir(startPath)
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  async function browseDir(dirPath: string) {
    setLoading(true)
    setError("")
    try {
      const result = await apiGet<BrowseResult>(
        `/api/project/browse?path=${encodeURIComponent(dirPath)}`
      )
      if (!isOpenRef.current) return // dialog closed while loading
      setDirs(result.dirs)
    } catch (err) {
      if (!isOpenRef.current) return
      const msg = err instanceof Error ? err.message : String(err)
      setError(
        msg.includes("Authentication required") || msg.includes("401")
          ? "需要管理员身份验证，请先登录"
          : msg,
      )
      setDirs([])
    } finally {
      if (isOpenRef.current) setLoading(false)
    }
  }

  function norm(p: string) {
    return p.replace(/\/+$/, "")
  }

  function isAtConstraintRoot() {
    if (!rootConstraint) return false
    return norm(currentPath) === norm(rootConstraint)
  }

  function navigateUp() {
    if (!currentPath || isAtConstraintRoot()) return
    const parent = currentPath.replace(/\/[^/]+\/?$/, "") || rootConstraint || "/"
    setCurrentPath(parent)
    setInputPath(parent)
    void browseDir(parent)
  }

  function navigateInto(dir: string) {
    setCurrentPath(dir)
    setInputPath(dir)
    void browseDir(dir)
  }

  function handleGoToPath() {
    const trimmed = inputPath.trim()
    if (!trimmed) return

    if (rootConstraint) {
      const normConstraint = norm(rootConstraint)
      const normInput = norm(trimmed)
      if (normInput !== normConstraint && !normInput.startsWith(normConstraint + "/")) {
        setInputWarning(`只能在持久化目录 ${rootConstraint} 内选择`)
        const fallback = rootConstraint
        setInputPath(fallback)
        setCurrentPath(fallback)
        void browseDir(fallback)
        return
      }
    }

    setInputWarning("")
    setCurrentPath(trimmed)
    void browseDir(trimmed)
  }

  function handleConfirm() {
    onSelect(currentPath)
    onClose()
  }

  const dirName = (fullPath: string) => fullPath.split("/").pop() || fullPath
  const atRoot = isAtConstraintRoot()

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()} maxWidth="sm" fullWidth>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title || t("project.browseDirectory")}</DialogTitle>
        </DialogHeader>

        <Stack spacing={1.5} sx={{ py: 1 }}>
          {rootConstraint && (
            <Stack
              direction="row"
              spacing={0.75}
              sx={{
                alignItems: "center",
                px: 1.5,
                py: 0.75,
                bgcolor: "primary.50",
                borderRadius: 1,
                border: "1px solid",
                borderColor: "primary.200",
              }}
            >
              <LockIcon sx={{ fontSize: 14, color: "primary.main", flexShrink: 0 }} />
              <Typography variant="caption" color="primary.main" sx={{ lineHeight: 1.4 }}>
                仅显示持久化存储目录，Docker 重启后数据不会丢失
              </Typography>
            </Stack>
          )}

          <Stack direction="row" spacing={1} sx={{ alignItems: "stretch" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Input
                value={inputPath}
                onChange={(e) => {
                  setInputPath(e.target.value)
                  setInputWarning("")
                }}
                placeholder="/path/to/directory"
                onKeyDown={(e) => e.key === "Enter" && handleGoToPath()}
              />
            </Box>
            <Button variant="outline" onClick={handleGoToPath}>
              {t("project.go")}
            </Button>
          </Stack>

          {inputWarning && (
            <Typography variant="caption" color="warning.main">
              {inputWarning}
            </Typography>
          )}

          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}

          <Box
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              height: 280,
              overflow: "auto",
            }}
          >
            {loading ? (
              <Stack sx={{ height: 1, alignItems: "center", justifyContent: "center" }}>
                <CircularProgress size={24} />
              </Stack>
            ) : (
              <List dense disablePadding>
                {/* Hide ".." when at constraint root or filesystem root */}
                {currentPath && currentPath !== "/" && !atRoot && (
                  <ListItemButton onClick={navigateUp}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <ArrowUpwardIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary=".." />
                  </ListItemButton>
                )}
                {dirs.map((dir) => (
                  <ListItemButton
                    key={dir}
                    onDoubleClick={() => navigateInto(dir)}
                    onClick={() => {
                      setCurrentPath(dir)
                      setInputPath(dir)
                    }}
                    selected={currentPath === dir}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <FolderIcon fontSize="small" sx={{ color: "primary.main" }} />
                    </ListItemIcon>
                    <ListItemText primary={dirName(dir)} />
                  </ListItemButton>
                ))}
                {dirs.length === 0 && !loading && (
                  <Box sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="body2" color="text.secondary">
                      {currentPath ? t("project.noSubdirs") : t("project.enterPath")}
                    </Typography>
                  </Box>
                )}
              </List>
            )}
          </Box>

          <Typography variant="caption" color="text.secondary" noWrap>
            {t("project.selected")}: {currentPath || "—"}
          </Typography>
        </Stack>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("project.cancel")}</Button>
          <Button onClick={handleConfirm} disabled={!currentPath}>
            {t("project.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
