import { useEffect, useState } from "react"
import AddIcon from "@mui/icons-material/Add"
import CloseIcon from "@mui/icons-material/Close"
import FolderOpenIcon from "@mui/icons-material/FolderOpen"
import ScheduleIcon from "@mui/icons-material/Schedule"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import List from "@mui/material/List"
import ListItemButton from "@mui/material/ListItemButton"
import ListItemText from "@mui/material/ListItemText"
import Paper from "@mui/material/Paper"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import { alpha } from "@mui/material/styles"
import { Button } from "@/components/ui/button"
import { getRecentProjects, removeFromRecentProjects } from "@/lib/project-store"
import type { WikiProject } from "@/types/wiki"
import { useTranslation } from "react-i18next"

interface WelcomeScreenProps {
  onCreateProject: () => void
  onOpenProject: () => void
  onSelectProject: (project: WikiProject) => void
}

export function WelcomeScreen({
  onCreateProject,
  onOpenProject,
  onSelectProject,
}: WelcomeScreenProps) {
  const { t } = useTranslation()
  const [recentProjects, setRecentProjects] = useState<WikiProject[]>([])

  useEffect(() => {
    getRecentProjects().then(setRecentProjects).catch(() => {})
  }, [])

  async function handleRemoveRecent(e: React.MouseEvent, path: string) {
    e.stopPropagation()
    await removeFromRecentProjects(path)
    const updated = await getRecentProjects()
    setRecentProjects(updated)
  }

  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
      }}
    >
      <Stack spacing={4} sx={{ alignItems: "center", px: 2 }}>
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            {t("app.title")}
          </Typography>
          <Typography sx={{ mt: 1, color: "text.secondary" }}>{t("app.subtitle")}</Typography>
        </Box>

        <Stack direction="row" spacing={1.5}>
          <Button onClick={onCreateProject} startIcon={<AddIcon sx={{ fontSize: 18 }} />}>
            {t("welcome.newProject")}
          </Button>
          <Button variant="outline" onClick={onOpenProject} startIcon={<FolderOpenIcon sx={{ fontSize: 18 }} />}>
            {t("welcome.openProject")}
          </Button>
        </Stack>

        {recentProjects.length > 0 && (
          <Box sx={{ width: "100%", maxWidth: 448 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1, color: "text.secondary" }}>
              <ScheduleIcon sx={{ fontSize: 16 }} />
              <Typography variant="body2">{t("welcome.recentProjects")}</Typography>
            </Stack>
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
              <List disablePadding>
                {recentProjects.map((proj, index) => (
                  <ListItemButton
                    key={proj.path}
                    onClick={() => onSelectProject(proj)}
                    sx={{
                      py: 1.5,
                      px: 2,
                      borderBottom: index < recentProjects.length - 1 ? 1 : 0,
                      borderColor: "divider",
                      "&:hover": { bgcolor: "action.hover" },
                      "& [data-remove-recent]": { opacity: 0 },
                      "&:hover [data-remove-recent]": { opacity: 1 },
                    }}
                  >
                    <ListItemText
                      primary={proj.name}
                      secondary={proj.path}
                      slotProps={{
                        primary: { variant: "body2", noWrap: true, sx: { fontWeight: 500 } },
                        secondary: { variant: "caption", color: "text.secondary", noWrap: true },
                      }}
                      sx={{ flex: "1 1 auto", minWidth: 0, mr: 1 }}
                    />
                    <IconButton
                      data-remove-recent
                      size="small"
                      aria-label={t("common.close")}
                      onClick={(e) => handleRemoveRecent(e, proj.path)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRemoveRecent(e as unknown as React.MouseEvent, proj.path)
                      }}
                      sx={{
                        flexShrink: 0,
                        "&:hover": { bgcolor: (theme) => alpha(theme.palette.error.main, 0.1) },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                    </IconButton>
                  </ListItemButton>
                ))}
              </List>
            </Paper>
          </Box>
        )}
      </Stack>
    </Box>
  )
}
