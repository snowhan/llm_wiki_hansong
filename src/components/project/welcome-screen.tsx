import { useEffect, useState } from "react"
import AddIcon from "@mui/icons-material/Add"
import CloseIcon from "@mui/icons-material/Close"
import FolderOpenIcon from "@mui/icons-material/FolderOpen"
import AutoStoriesIcon from "@mui/icons-material/AutoStories"
import LoginIcon from "@mui/icons-material/Login"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import ButtonBase from "@mui/material/ButtonBase"
import { alpha } from "@mui/material/styles"
import { Button } from "@/components/ui/button"
import { getRecentProjects, removeFromRecentProjects } from "@/lib/project-store"
import type { WikiProject } from "@/types/wiki"
import { useTranslation } from "react-i18next"
import { useAuthStore } from "@/stores/auth-store"

interface WelcomeScreenProps {
  onCreateProject: () => void
  onOpenProject: () => void
  onSelectProject: (project: WikiProject) => void
  onLogin: () => void
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
        position: "relative",
        overflow: "hidden",
        bgcolor: "#141218",
      }}
    >
      {/* Warm atmospheric gradient */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse 70% 50% at 50% -10%, rgba(194, 65, 12, 0.12), transparent),
            radial-gradient(ellipse 50% 40% at 80% 100%, rgba(217, 119, 6, 0.05), transparent),
            radial-gradient(ellipse 40% 50% at 10% 80%, rgba(194, 65, 12, 0.03), transparent)
          `,
          pointerEvents: "none",
        }}
      />

      {/* Subtle dot grid */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          backgroundImage: `radial-gradient(rgba(245,243,239,0.04) 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse 60% 60% at 50% 50%, black 20%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Decorative copper line */}
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%) rotate(-12deg)",
          width: "120%",
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(194, 65, 12, 0.15) 30%, rgba(194, 65, 12, 0.15) 70%, transparent)",
          pointerEvents: "none",
        }}
      />

      {/* Login button — top-right, only when not authenticated */}
      {!authUser && (
        <Box sx={{ position: "absolute", top: 16, right: 20, zIndex: 2 }}>
          <Button
            onClick={(e) => { (e.currentTarget as HTMLElement).blur(); onLogin() }}
            startIcon={<LoginIcon sx={{ fontSize: 16 }} />}
            sx={{
              color: "rgba(245,243,239,0.55)",
              fontSize: "0.8rem",
              px: 1.5,
              py: 0.6,
              borderRadius: "10px",
              border: "1px solid rgba(245,243,239,0.1)",
              "&:hover": {
                color: "#F5F3EF",
                border: "1px solid rgba(245,243,239,0.2)",
                bgcolor: "rgba(245,243,239,0.05)",
              },
              transition: "all 0.2s",
            }}
          >
            {t("auth.login")}
          </Button>
        </Box>
      )}

      {/* Content */}
      <Stack
        sx={{
          position: "relative",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1,
          px: 3,
        }}
      >
        {/* Logo + Title */}
        <Stack
          spacing={1.5}
          sx={{
            alignItems: "center",
            mb: 5,
            animation: "fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both",
            "@keyframes fadeInUp": {
              "0%": { opacity: 0, transform: "translateY(16px)" },
              "100%": { opacity: 1, transform: "translateY(0)" },
            },
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(145deg, #C2410C 0%, #EA580C 100%)",
              boxShadow: "0 8px 32px rgba(194, 65, 12, 0.35), 0 0 0 1px rgba(194, 65, 12, 0.1)",
              mb: 0.5,
            }}
          >
            <AutoStoriesIcon sx={{ fontSize: 28, color: "#fff" }} />
          </Box>
          <Typography
            variant="h4"
            component="h1"
            sx={{
              fontFamily: "'Playfair Display', 'PingFang SC', Georgia, serif",
              fontWeight: 700,
              color: "#F5F3EF",
              letterSpacing: "-0.02em",
              textAlign: "center",
              fontSize: "2rem",
            }}
          >
            {t("app.title")}
          </Typography>
          <Box
            sx={{
              width: 40,
              height: 2,
              bgcolor: "#C2410C",
              borderRadius: 1,
              opacity: 0.6,
            }}
          />
          <Typography
            sx={{
              color: "rgba(245,243,239,0.35)",
              fontSize: "0.9rem",
              textAlign: "center",
              maxWidth: 360,
              lineHeight: 1.7,
              letterSpacing: "0.01em",
            }}
          >
            {t("app.subtitle")}
          </Typography>
        </Stack>

        {/* Action buttons */}
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            mb: 5,
            animation: "fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both",
            "@keyframes fadeInUp": {
              "0%": { opacity: 0, transform: "translateY(16px)" },
              "100%": { opacity: 1, transform: "translateY(0)" },
            },
          }}
        >
          <Button
            onClick={onCreateProject}
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            sx={{
              bgcolor: "#C2410C",
              color: "#fff",
              px: 3,
              py: 1,
              fontSize: "0.875rem",
              fontWeight: 500,
              borderRadius: "12px",
              "&:hover": {
                bgcolor: "#EA580C",
                boxShadow: "0 4px 24px rgba(194, 65, 12, 0.35)",
              },
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            {t("welcome.newProject")}
          </Button>
          <Button
            variant="outline"
            onClick={onOpenProject}
            startIcon={<FolderOpenIcon sx={{ fontSize: 18 }} />}
            sx={{
              borderColor: "rgba(245,243,239,0.1)",
              color: "rgba(245,243,239,0.6)",
              px: 3,
              py: 1,
              fontSize: "0.875rem",
              fontWeight: 500,
              borderRadius: "12px",
              "&:hover": {
                borderColor: "rgba(194, 65, 12, 0.4)",
                bgcolor: "rgba(194, 65, 12, 0.06)",
                color: "#F5F3EF",
              },
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            {t("welcome.openProject")}
          </Button>
        </Stack>

        {/* Recent projects */}
        {recentProjects.length > 0 && (
          <Box
            sx={{
              width: "100%",
              maxWidth: 480,
              animation: "fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both",
              "@keyframes fadeInUp": {
                "0%": { opacity: 0, transform: "translateY(16px)" },
                "100%": { opacity: 1, transform: "translateY(0)" },
              },
            }}
          >
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mb: 1.5,
                px: 0.5,
                color: "rgba(245,243,239,0.25)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontSize: "0.65rem",
                fontWeight: 600,
              }}
            >
              {t("welcome.recentProjects")}
            </Typography>
            <Stack spacing={0.5}>
              {recentProjects.map((proj) => (
                <ButtonBase
                  component="div"
                  role="button"
                  tabIndex={0}
                  key={proj.id}
                  onClick={() => onSelectProject(proj)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onSelectProject(proj)
                    }
                  }}
                  sx={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    gap: 1.5,
                    px: 2,
                    py: 1.5,
                    borderRadius: "12px",
                    textAlign: "left",
                    border: "1px solid transparent",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    "&:hover": {
                      bgcolor: "rgba(245,243,239,0.03)",
                      borderColor: "rgba(245,243,239,0.06)",
                    },
                    "& [data-remove-recent]": { opacity: 0 },
                    "&:hover [data-remove-recent]": { opacity: 1 },
                  }}
                >
                  <Box
                    sx={{
                      width: 38,
                      height: 38,
                      borderRadius: "10px",
                      bgcolor: "rgba(194, 65, 12, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      border: "1px solid rgba(194, 65, 12, 0.08)",
                    }}
                  >
                    <AutoStoriesIcon sx={{ fontSize: 16, color: "#EA580C" }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ fontWeight: 500, color: "rgba(245,243,239,0.8)", fontSize: "0.875rem" }}
                    >
                      {proj.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{ color: "rgba(245,243,239,0.25)", fontSize: "0.75rem", display: "block" }}
                    >
                      {proj.id.slice(0, 8)}…
                    </Typography>
                  </Box>
                  <IconButton
                    data-remove-recent
                    size="small"
                    aria-label={t("common.close")}
                    onClick={(e) => handleRemoveRecent(e, proj.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRemoveRecent(e as unknown as React.MouseEvent, proj.id)
                    }}
                    sx={{
                      flexShrink: 0,
                      color: "rgba(245,243,239,0.2)",
                      transition: "all 0.2s ease",
                      "&:hover": {
                        color: "#B91C1C",
                        bgcolor: (theme) => alpha(theme.palette.error.main, 0.1),
                      },
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </ButtonBase>
              ))}
            </Stack>
          </Box>
        )}
      </Stack>
    </Box>
  )
}
