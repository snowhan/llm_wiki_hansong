import { useState } from "react"
import Dialog from "@mui/material/Dialog"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import TextField from "@mui/material/TextField"
import CircularProgress from "@mui/material/CircularProgress"
import AutoStoriesIcon from "@mui/icons-material/AutoStories"
import { useAuthStore } from "@/stores/auth-store"
import { useTranslation } from "react-i18next"

interface AuthModalProps {
  open: boolean
  onClose: () => void
}

type AuthTab = "login" | "register"

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<AuthTab>("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registerSuccess, setRegisterSuccess] = useState(false)

  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)

  function reset() {
    setUsername("")
    setPassword("")
    setError(null)
    setRegisterSuccess(false)
  }

  function handleTabChange(newTab: AuthTab) {
    if (newTab === tab) return
    setTab(newTab)
    reset()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (tab === "login") {
        await login(username, password)
        reset()
        onClose()
      } else {
        const { isPending } = await register(username, password)
        if (isPending) {
          setRegisterSuccess(true)
        } else {
          reset()
          onClose()
        }
      }
    } catch (err) {
      setError((err as Error).message ?? t("auth.unknownError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      slotProps={{
        backdrop: {
          sx: {
            bgcolor: "rgba(55,53,47,0.45)",
            backdropFilter: "blur(6px)",
          },
        },
        paper: {
          sx: {
            width: 360,
            borderRadius: "16px",
            bgcolor: "background.paper",
            backgroundImage: "none",
            border: "1px solid",
            borderColor: "divider",
            boxShadow: 4,
            overflow: "hidden",
            animation: "notion-scale-in 0.2s var(--ease-spring) both",
          },
        },
      }}
    >
      {/* Notion blue accent bar */}
      <Box sx={{
        height: 3,
        background: "linear-gradient(90deg, transparent 0%, #2383E2 30%, #4B9FEA 60%, transparent 100%)",
        opacity: 0.8,
      }} />

      <Box sx={{ px: 3.5, pt: 3.5, pb: 4 }}>
        {/* Logo + title */}
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 3.5 }}>
          <Box sx={{
            width: 34,
            height: 34,
            borderRadius: "10px",
            bgcolor: "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(35,131,226,0.3)",
            flexShrink: 0,
          }}>
            <AutoStoriesIcon sx={{ fontSize: 17, color: "#fff" }} />
          </Box>
          <Box>
            <Typography sx={{
              fontFamily: "inherit",
              fontSize: "1rem",
              fontWeight: 700,
              color: "text.primary",
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}>
              LLM Wiki
            </Typography>
            <Typography sx={{
              fontSize: "0.7rem",
              color: "text.secondary",
              lineHeight: 1,
              mt: 0.25,
            }}>
              {tab === "login" ? t("auth.signInToContinue") : t("auth.createAccount")}
            </Typography>
          </Box>
        </Stack>

        {registerSuccess ? (
          <RegisterSuccess
            onBackToLogin={() => { reset(); setTab("login") }}
            t={t}
          />
        ) : (
          <>
            {/* Tab switcher */}
            <Box sx={{
              display: "flex",
              position: "relative",
              mb: 3.5,
              bgcolor: "background.sidebar",
              borderRadius: "10px",
              p: "3px",
              border: "1px solid",
              borderColor: "divider",
            }}>
              {/* Sliding pill */}
              <Box sx={{
                position: "absolute",
                top: 3,
                left: tab === "login" ? 3 : "calc(50% + 1.5px)",
                width: "calc(50% - 4.5px)",
                height: "calc(100% - 6px)",
                borderRadius: "7px",
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
                boxShadow: 1,
                transition: "left 0.22s cubic-bezier(0.4,0,0.2,1)",
              }} />
              {(["login", "register"] as AuthTab[]).map((v) => (
                <Box
                  key={v}
                  onClick={() => handleTabChange(v)}
                  sx={{
                    flex: 1,
                    py: 0.75,
                    textAlign: "center",
                    cursor: "pointer",
                    position: "relative",
                    zIndex: 1,
                    fontSize: "0.8rem",
                    fontWeight: tab === v ? 600 : 400,
                    color: tab === v ? "text.primary" : "text.secondary",
                    transition: "color 0.2s",
                    userSelect: "none",
                    borderRadius: "7px",
                  }}
                >
                  {v === "login" ? t("auth.login") : t("auth.register")}
                </Box>
              ))}
            </Box>

            {/* Error */}
            {error && (
              <Box sx={{
                mb: 2.5,
                px: 1.5,
                py: 1,
                borderRadius: "8px",
                bgcolor: "rgba(235,87,87,0.06)",
                border: "1px solid rgba(235,87,87,0.2)",
                borderLeft: "3px solid rgba(235,87,87,0.6)",
              }}>
                <Typography sx={{ fontSize: "0.78rem", color: "error.main", lineHeight: 1.5 }}>
                  {error}
                </Typography>
              </Box>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <Stack spacing={0}>
                <TextField
                  label={t("auth.username")}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  required
                  variant="standard"
                  slotProps={{ htmlInput: { autoComplete: "username" } }}
                  sx={inputSx}
                />
                <TextField
                  label={t("auth.password")}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  variant="standard"
                  slotProps={{ htmlInput: { autoComplete: tab === "login" ? "current-password" : "new-password" } }}
                  helperText={tab === "register" ? t("auth.passwordHint") : undefined}
                  sx={{ ...inputSx, mt: 2.5 }}
                />

                <Box
                  component="button"
                  type="submit"
                  disabled={loading || !username || !password}
                  sx={{
                    mt: 3.5,
                    width: "100%",
                    py: 1.1,
                    border: "none",
                    outline: "none",
                    borderRadius: "10px",
                    cursor: loading || !username || !password ? "not-allowed" : "pointer",
                    bgcolor: loading || !username || !password ? "rgba(35,131,226,0.15)" : "primary.main",
                    color: loading || !username || !password ? "text.disabled" : "#fff",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1,
                    transition: "all 0.15s ease",
                    boxShadow: loading || !username || !password
                      ? "none"
                      : "0 4px 14px rgba(35,131,226,0.25)",
                    "&:hover:not(:disabled)": {
                      bgcolor: "primary.dark",
                      boxShadow: "0 6px 20px rgba(35,131,226,0.35)",
                      transform: "translateY(-1px)",
                    },
                    "&:active:not(:disabled)": {
                      transform: "translateY(0)",
                    },
                  }}
                >
                  {loading
                    ? <CircularProgress size={15} sx={{ color: "rgba(255,255,255,0.6)" }} />
                    : tab === "login" ? t("auth.loginButton") : t("auth.registerButton")
                  }
                </Box>
              </Stack>
            </form>
          </>
        )}
      </Box>
    </Dialog>
  )
}

function RegisterSuccess({ onBackToLogin, t }: { onBackToLogin: () => void; t: (k: string) => string }) {
  return (
    <Stack spacing={2.5} sx={{
      alignItems: "center",
      py: 2,
      animation: "notion-fade-in 0.4s ease both",
    }}>
      <Box sx={{
        width: 52,
        height: 52,
        borderRadius: "50%",
        border: "2px solid",
        borderColor: "success.main",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.85,
      }}>
        <Box sx={{
          fontSize: "1.4rem",
          lineHeight: 1,
          color: "success.main",
          animation: "notion-scale-in 0.35s var(--ease-spring) 0.1s both",
        }}>
          ✓
        </Box>
      </Box>

      <Box sx={{ textAlign: "center" }}>
        <Typography sx={{
          fontSize: "1rem",
          fontWeight: 700,
          color: "text.primary",
          mb: 0.75,
          letterSpacing: "-0.01em",
        }}>
          {t("auth.registerPendingTitle")}
        </Typography>
        <Typography sx={{
          fontSize: "0.8rem",
          color: "text.secondary",
          lineHeight: 1.6,
          maxWidth: 260,
        }}>
          {t("auth.registerPendingDesc")}
        </Typography>
      </Box>

      <Box
        component="button"
        onClick={onBackToLogin}
        sx={{
          mt: 0.5,
          px: 3,
          py: 0.75,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "8px",
          bgcolor: "transparent",
          color: "text.secondary",
          fontSize: "0.78rem",
          cursor: "pointer",
          transition: "all 0.15s ease",
          "&:hover": {
            borderColor: "primary.main",
            color: "primary.main",
            bgcolor: "rgba(35,131,226,0.04)",
          },
        }}
      >
        {t("auth.backToLogin")}
      </Box>
    </Stack>
  )
}

const inputSx = {
  width: "100%",
  "& .MuiInput-root": {
    fontSize: "0.9rem",
    color: "text.primary",
    "&::before": {
      borderBottomColor: "divider",
      transition: "border-color 0.2s",
    },
    "&:hover:not(.Mui-disabled)::before": {
      borderBottomColor: "text.secondary",
    },
    "&::after": {
      borderBottomColor: "primary.main",
    },
  },
  "& .MuiInput-input": {
    color: "text.primary",
    caretColor: "#2383E2",
    "&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus": {
      WebkitBoxShadow: "0 0 0 100px transparent inset",
      WebkitTextFillColor: "inherit",
      caretColor: "#2383E2",
      transition: "background-color 9999s ease-in-out 0s",
    },
  },
  "& .MuiInputLabel-root": {
    color: "text.secondary",
    fontSize: "0.78rem",
    letterSpacing: "0.04em",
    fontWeight: 500,
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "primary.main",
  },
  "& .MuiInputLabel-shrink": {
    color: "text.secondary",
  },
  "& .MuiFormHelperText-root": {
    color: "text.disabled",
    fontSize: "0.7rem",
    mt: 0.5,
  },
}
