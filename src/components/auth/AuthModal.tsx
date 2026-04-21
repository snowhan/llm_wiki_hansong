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
            bgcolor: "rgba(8, 7, 12, 0.75)",
            backdropFilter: "blur(8px)",
          },
        },
        paper: {
          sx: {
            width: 380,
            borderRadius: "20px",
            bgcolor: "#0F0D14",
            backgroundImage: "none",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
            overflow: "hidden",
            animation: "modalIn 0.35s cubic-bezier(0.16,1,0.3,1) both",
            "@keyframes modalIn": {
              "0%": { opacity: 0, transform: "translateY(24px) scale(0.97)" },
              "100%": { opacity: 1, transform: "translateY(0) scale(1)" },
            },
          },
        },
      }}
    >
      {/* Copper accent bar at top */}
      <Box sx={{
        height: 3,
        background: "linear-gradient(90deg, transparent 0%, #C2410C 30%, #EA580C 60%, transparent 100%)",
        opacity: 0.9,
      }} />

      <Box sx={{ px: 3.5, pt: 3.5, pb: 4 }}>
        {/* Logo + Title */}
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 3.5 }}>
          <Box sx={{
            width: 34,
            height: 34,
            borderRadius: "10px",
            background: "linear-gradient(145deg, #C2410C, #EA580C)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 16px rgba(194,65,12,0.35)",
            flexShrink: 0,
          }}>
            <AutoStoriesIcon sx={{ fontSize: 17, color: "#fff" }} />
          </Box>
          <Box>
            <Typography sx={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "1.05rem",
              fontWeight: 700,
              color: "#F5F3EF",
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}>
              LLM Wiki
            </Typography>
            <Typography sx={{
              fontSize: "0.7rem",
              color: "rgba(245,243,239,0.3)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              lineHeight: 1,
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
            {/* Custom tab switcher */}
            <Box sx={{
              display: "flex",
              position: "relative",
              mb: 3.5,
              bgcolor: "rgba(255,255,255,0.04)",
              borderRadius: "10px",
              p: "3px",
            }}>
              {/* Sliding pill */}
              <Box sx={{
                position: "absolute",
                top: 3,
                left: tab === "login" ? 3 : "calc(50% + 1.5px)",
                width: "calc(50% - 4.5px)",
                height: "calc(100% - 6px)",
                borderRadius: "8px",
                bgcolor: "#1C1926",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                transition: "left 0.25s cubic-bezier(0.4,0,0.2,1)",
              }} />
              {(["login", "register"] as AuthTab[]).map((v) => (
                <Box
                  key={v}
                  onClick={() => handleTabChange(v)}
                  sx={{
                    flex: 1,
                    py: 0.8,
                    textAlign: "center",
                    cursor: "pointer",
                    position: "relative",
                    zIndex: 1,
                    fontSize: "0.8rem",
                    fontWeight: tab === v ? 600 : 400,
                    color: tab === v ? "#F5F3EF" : "rgba(245,243,239,0.35)",
                    letterSpacing: "0.04em",
                    transition: "color 0.2s",
                    userSelect: "none",
                    borderRadius: "8px",
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
                bgcolor: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderLeft: "3px solid rgba(239,68,68,0.7)",
              }}>
                <Typography sx={{ fontSize: "0.78rem", color: "rgba(252,165,165,0.9)", lineHeight: 1.5 }}>
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
                    py: 1.2,
                    border: "none",
                    outline: "none",
                    borderRadius: "10px",
                    cursor: loading || !username || !password ? "not-allowed" : "pointer",
                    background: loading || !username || !password
                      ? "rgba(194,65,12,0.25)"
                      : "linear-gradient(135deg, #C2410C 0%, #EA580C 100%)",
                    color: loading || !username || !password ? "rgba(245,243,239,0.3)" : "#fff",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1,
                    transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
                    boxShadow: loading || !username || !password
                      ? "none"
                      : "0 4px 20px rgba(194,65,12,0.3)",
                    "&:hover:not(:disabled)": {
                      background: "linear-gradient(135deg, #B33A0A 0%, #D95208 100%)",
                      boxShadow: "0 6px 28px rgba(194,65,12,0.45)",
                      transform: "translateY(-1px)",
                    },
                    "&:active:not(:disabled)": {
                      transform: "translateY(0)",
                    },
                  }}
                >
                  {loading
                    ? <CircularProgress size={16} sx={{ color: "rgba(245,243,239,0.5)" }} />
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
    <Stack spacing={2.5} sx={{ alignItems: "center",
      py: 2,
      animation: "fadeIn 0.4s ease both",
      "@keyframes fadeIn": { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "none" } },
    }}>
      {/* Animated check ring */}
      <Box sx={{
        width: 56,
        height: 56,
        borderRadius: "50%",
        border: "2px solid rgba(34,197,94,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: -4,
          borderRadius: "50%",
          border: "1px solid rgba(34,197,94,0.15)",
        },
      }}>
        <Box sx={{
          fontSize: "1.5rem",
          lineHeight: 1,
          color: "#22C55E",
          animation: "popIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both",
          "@keyframes popIn": {
            "0%": { transform: "scale(0)", opacity: 0 },
            "100%": { transform: "scale(1)", opacity: 1 },
          },
        }}>
          ✓
        </Box>
      </Box>

      <Box sx={{ textAlign: "center" }}>
        <Typography sx={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "1.1rem",
          fontWeight: 700,
          color: "#F5F3EF",
          mb: 0.75,
        }}>
          {t("auth.registerPendingTitle")}
        </Typography>
        <Typography sx={{
          fontSize: "0.8rem",
          color: "rgba(245,243,239,0.4)",
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
          py: 0.8,
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "8px",
          bgcolor: "transparent",
          color: "rgba(245,243,239,0.6)",
          fontSize: "0.78rem",
          letterSpacing: "0.04em",
          cursor: "pointer",
          transition: "all 0.2s",
          "&:hover": {
            borderColor: "rgba(255,255,255,0.2)",
            color: "#F5F3EF",
            bgcolor: "rgba(255,255,255,0.04)",
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
    color: "#1A1726",
    fontSize: "0.95rem",
    letterSpacing: "0.01em",
    "&::before": {
      borderBottomColor: "rgba(26,23,38,0.18)",
      transition: "border-color 0.2s",
    },
    "&:hover:not(.Mui-disabled)::before": {
      borderBottomColor: "rgba(26,23,38,0.35)",
    },
    "&::after": {
      borderBottomColor: "#C2410C",
      transition: "transform 0.2s cubic-bezier(0.4,0,0.2,1)",
    },
  },
  "& .MuiInput-input": {
    color: "#1A1726",
    caretColor: "#C2410C",
    "&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus": {
      WebkitBoxShadow: "0 0 0 100px #fff inset",
      WebkitTextFillColor: "#1A1726",
      caretColor: "#C2410C",
      transition: "background-color 9999s ease-in-out 0s",
    },
  },
  "& .MuiInputLabel-root": {
    color: "rgba(26,23,38,0.4)",
    fontSize: "0.78rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    fontWeight: 500,
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#C2410C",
  },
  "& .MuiInputLabel-shrink": {
    color: "rgba(26,23,38,0.5)",
  },
  "& .MuiFormHelperText-root": {
    color: "rgba(245,243,239,0.25)",
    fontSize: "0.7rem",
    mt: 0.5,
  },
}
