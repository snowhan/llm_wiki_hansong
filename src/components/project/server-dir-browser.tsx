import { useState, useEffect } from "react"
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
}: ServerDirBrowserProps) {
  const { t } = useTranslation()
  const defaultPath = initialPath || "/"
  const [currentPath, setCurrentPath] = useState(defaultPath)
  const [dirs, setDirs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [inputPath, setInputPath] = useState(defaultPath)

  useEffect(() => {
    if (isOpen) {
      const pathToBrowse = currentPath || defaultPath
      if (!currentPath) {
        setCurrentPath(pathToBrowse)
        setInputPath(pathToBrowse)
      }
      browse(pathToBrowse)
    }
  }, [isOpen, currentPath])

  async function browse(dirPath: string) {
    setLoading(true)
    setError("")
    try {
      const result = await apiGet<BrowseResult>(
        `/api/project/browse?path=${encodeURIComponent(dirPath)}`
      )
      setDirs(result.dirs)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDirs([])
    } finally {
      setLoading(false)
    }
  }

  function navigateUp() {
    const parent = currentPath.replace(/\/[^/]+\/?$/, "") || "/"
    setCurrentPath(parent)
    setInputPath(parent)
  }

  function navigateInto(dir: string) {
    setCurrentPath(dir)
    setInputPath(dir)
  }

  function handleGoToPath() {
    if (inputPath.trim()) {
      setCurrentPath(inputPath.trim())
    }
  }

  function handleConfirm() {
    onSelect(currentPath)
    onClose()
  }

  const dirName = (fullPath: string) => fullPath.split("/").pop() || fullPath

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()} maxWidth="sm" fullWidth>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title || t("project.browseDirectory")}</DialogTitle>
        </DialogHeader>

        <Stack spacing={1.5} sx={{ py: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "stretch" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Input
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                placeholder="/path/to/directory"
                onKeyDown={(e) => e.key === "Enter" && handleGoToPath()}
              />
            </Box>
            <Button variant="outline" onClick={handleGoToPath}>
              {t("project.go")}
            </Button>
          </Stack>

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
                {currentPath && currentPath !== "/" && (
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
                      <FolderIcon fontSize="small" sx={{ color: "warning.main" }} />
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
