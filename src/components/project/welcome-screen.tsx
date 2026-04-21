import { useEffect, useState } from "react"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import ButtonBase from "@mui/material/ButtonBase"
import IconButton from "@mui/material/IconButton"
import Chip from "@mui/material/Chip"
import Divider from "@mui/material/Divider"
import Add from "@mui/icons-material/Add"
import FolderOpen from "@mui/icons-material/FolderOpen"
import Close from "@mui/icons-material/Close"
import Description from "@mui/icons-material/Description"
import Login from "@mui/icons-material/Login"
import AutoStoriesIcon from "@mui/icons-material/AutoStories"
import { getRecentProjects, removeFromRecentProjects } from "@/lib/project-store"
import type { WikiProject } from "@/types/wiki"
import { useTranslation } from "react-i18next"
import { useAuthStore } from "@/stores/auth-store"

interface WelcomeScreenProps {
  onCreateProject: () => void
  onOpenProject: () => void
  onSelectProject: (project: WikiProject) => void
  onLogin?: () => void
}

export function WelcomeScreen({
  onCreateProject,
  onOpenProject,
  onSelectProject,
  onLogin,
}: WelcomeScreenProps) {
  const { t } = useTranslation()
  const [recentProjects, setRecentProjects] = useState<WikiProject[]>([])
  const authUser = useAuthStore((s) => s.user)

  useEffect(() => {
    getRecentProjects().then(setRecentProjects).catch(() => {})
  }, [])

  async function handleRemoveRecent(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    await removeFromRecentProjects(id)
    setRecentProjects(await getRecentProjects())
  }

  function truncateId(id: string) {
    return id.length > 8 ? id.slice(0, 8) + "…" : id
  }

  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        bgcolor: "background.default",
        color: "text.primary",
        fontFamily: "inherit",
      }}
    >
      {/* Left panel — brand + actions */}
      <Box
        sx={{
          width: { xs: "100%", md: 320 },
          flexShrink: 0,
          bgcolor: "background.sidebar",
          borderRight: { md: "1px solid" },
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          px: 4,
          py: 5,
          gap: 0,
          animation: "stagger-in 400ms var(--ease-spring) both",
        }}
      >
        {/* Logo + wordmark */}
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 4 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "8px",
              bgcolor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 10px rgba(35,131,226,0.3)",
              flexShrink: 0,
            }}
          >
            <AutoStoriesIcon sx={{ fontSize: 18, color: "#fff" }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.01em" }}>
              LLM Wiki
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
              AI 知识库
            </Typography>
          </Box>
        </Stack>

        {/* Auth status */}
        {authUser ? (
          <Box
            sx={{
              mb: 3,
              px: 1.5,
              py: 1,
              bgcolor: "rgba(35,131,226,0.06)",
              borderRadius: "8px",
              border: "1px solid rgba(35,131,226,0.12)",
            }}
          >
            <Typography variant="caption" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              已登录为
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {authUser.username}
            </Typography>
          </Box>
        ) : (
          <ButtonBase
            onClick={onLogin}
            sx={{
              mb: 3,
              px: 1.5,
              py: 1,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px",
              display: "flex",
              gap: 1,
              alignItems: "center",
              textAlign: "left",
              color: "text.secondary",
              transition: "background-color var(--duration-fast) ease",
              "&:hover": { bgcolor: "background.sidebarHover", color: "text.primary" },
            }}
          >
            <Login sx={{ fontSize: 16 }} />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {t("auth.login")}
            </Typography>
          </ButtonBase>
        )}

        {/* Primary actions */}
        <Stack spacing={1}>
          <Button
            variant="contained"
            fullWidth
            startIcon={<Add />}
            onClick={onCreateProject}
            sx={{ borderRadius: "8px", fontWeight: 600, height: 40 }}
          >
            {t("welcome.newProject")}
          </Button>
          <Button
            variant="outlined"
            fullWidth
            startIcon={<FolderOpen />}
            onClick={onOpenProject}
            sx={{ borderRadius: "8px", fontWeight: 500, height: 40 }}
          >
            {t("welcome.openProject")}
          </Button>
        </Stack>

        {/* Keyboard hint */}
        <Box sx={{ mt: "auto", pt: 4 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
            使用{" "}
            <Box component="kbd" sx={{
              display: "inline",
              px: 0.5,
              py: 0.1,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "4px",
              fontSize: "0.7rem",
              fontFamily: "var(--font-mono)",
            }}>
              ⌘K
            </Box>
            {" "}打开命令面板
          </Typography>
        </Box>
      </Box>

      {/* Right panel — recent projects */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          px: 6,
          py: 5,
          overflow: "auto",
        }}
      >
        <Typography
          variant="h5"
          sx={{
            fontWeight: 700,
            mb: 1,
            letterSpacing: "-0.02em",
            animation: "stagger-in 400ms var(--ease-spring) 80ms both",
          }}
        >
          {t("welcome.recentProjects")}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 4, animation: "stagger-in 400ms var(--ease-spring) 120ms both" }}
        >
          {t("welcome.selectProject")}
        </Typography>

        {recentProjects.length === 0 ? (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 2,
              opacity: 0.5,
              animation: "notion-fade-in 400ms var(--ease-out) 200ms both",
            }}
          >
            <Description sx={{ fontSize: 48, color: "text.secondary" }} />
            <Typography variant="body2" color="text.secondary">
              还没有最近打开的项目
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 1.5,
            }}
          >
            {recentProjects.map((project, i) => (
              <Box
                key={project.id ?? project.name}
                sx={{
                  position: "relative",
                  borderRadius: "10px",
                  animation: `stagger-in 400ms var(--ease-spring) ${160 + i * 40}ms both`,
                  "&:hover .recent-remove-btn": { opacity: 0.6 },
                }}
              >
                <ButtonBase
                  onClick={() => onSelectProject(project)}
                  sx={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    borderRadius: "10px",
                    border: "1px solid",
                    borderColor: "divider",
                    p: 2,
                    transition: "background-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease",
                    "&:hover": {
                      bgcolor: "background.sidebarHover",
                      boxShadow: 2,
                      borderColor: "rgba(35,131,226,0.3)",
                    },
                  }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: "8px",
                        bgcolor: "rgba(35,131,226,0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Description sx={{ fontSize: 18, color: "primary.main" }} />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, fontSize: "0.875rem", mb: 0.25 }}
                        noWrap
                      >
                        {project.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: "0.7rem", display: "block" }}
                        noWrap
                      >
                        {project.path ?? truncateId(project.id ?? "")}
                      </Typography>
                    </Box>
                  </Stack>
                </ButtonBase>

                {/* Remove button — sibling of ButtonBase to avoid nested <button> */}
                <IconButton
                  size="small"
                  aria-label={t("common.close")}
                  className="recent-remove-btn"
                  onClick={(e) => handleRemoveRecent(e, project.id ?? project.path ?? "")}
                  sx={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 22,
                    height: 22,
                    borderRadius: "4px",
                    opacity: 0,
                    color: "text.secondary",
                    transition: "opacity var(--duration-fast) ease",
                    "&:hover": { bgcolor: "background.sidebarHover", opacity: 1 },
                  }}
                >
                  <Close sx={{ fontSize: 13 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
