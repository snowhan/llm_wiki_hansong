import { useState } from "react"
import { useTranslation } from "react-i18next"
import FolderOpenIcon from "@mui/icons-material/FolderOpen"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createProject, writeFile, createDirectory } from "@/commands/fs"
import { getTemplate } from "@/lib/templates"
import { TemplatePicker } from "@/components/project/template-picker"
import { ServerDirBrowser } from "@/components/project/server-dir-browser"
import type { WikiProject } from "@/types/wiki"

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (project: WikiProject) => void
}

export function CreateProjectDialog({ open: isOpen, onOpenChange, onCreated }: CreateProjectDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [path, setPath] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState("general")
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)
  const [showBrowse, setShowBrowse] = useState(false)

  function handleBrowse() {
    setShowBrowse(true)
  }

  function handleBrowseSelect(selected: string) {
    setPath(selected)
  }

  async function handleCreate() {
    if (!name.trim() || !path.trim()) {
      setError(t("project.namePathRequired"))
      return
    }
    setCreating(true)
    setError("")
    try {
      const project = await createProject(name.trim(), path.trim())

      const template = getTemplate(selectedTemplate)
      await writeFile(project.id, "schema.md", template.schema)
      await writeFile(project.id, "purpose.md", template.purpose)
      for (const dir of template.extraDirs) {
        await createDirectory(project.id, dir)
      }

      onCreated(project)
      onOpenChange(false)
      setName("")
      setPath("")
      setSelectedTemplate("general")
    } catch (err) {
      setError(String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange} maxWidth="sm" fullWidth>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("project.createTitle")}</DialogTitle>
        </DialogHeader>
        <Stack spacing={2} sx={{ py: 2 }}>
          <Stack spacing={1}>
            <Label htmlFor="name">{t("project.name")}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("project.namePlaceholder")} />
          </Stack>
          <Stack spacing={1}>
            <Label>{t("project.template")}</Label>
            <TemplatePicker selected={selectedTemplate} onSelect={setSelectedTemplate} />
          </Stack>
          <Stack spacing={1}>
            <Label htmlFor="path">{t("project.parentDir")}</Label>
            <Stack direction="row" spacing={1} sx={{ alignItems: "stretch" }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Input
                  id="path"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder={t("project.parentDirPlaceholder")}
                />
              </Box>
              <Button variant="outline" size="icon" onClick={handleBrowse} type="button" sx={{ flexShrink: 0 }}>
                <FolderOpenIcon sx={{ fontSize: 18 }} />
              </Button>
            </Stack>
          </Stack>
          {error ? (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          ) : null}
        </Stack>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("project.cancel")}</Button>
          <Button onClick={handleCreate} disabled={creating}>{creating ? t("project.creating") : t("project.create")}</Button>
        </DialogFooter>
      </DialogContent>
      <ServerDirBrowser
        open={showBrowse}
        onClose={() => setShowBrowse(false)}
        onSelect={handleBrowseSelect}
        title={t("project.selectParentDir")}
      />
    </Dialog>
  )
}
