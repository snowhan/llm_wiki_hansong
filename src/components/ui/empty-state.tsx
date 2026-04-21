import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"

interface EmptyStateProps {
  /** SVG illustration or icon React element */
  illustration?: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ illustration, title, description, action }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: 240,
        gap: 2,
        py: 6,
        px: 4,
        textAlign: "center",
        animation: "notion-fade-in 300ms var(--ease-out) both",
      }}
    >
      {illustration && (
        <Box
          sx={{
            width: 80,
            height: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.5,
            color: "text.secondary",
            animation: "stagger-in 400ms var(--ease-spring) 60ms both",
          }}
        >
          {illustration}
        </Box>
      )}

      <Box sx={{ animation: "stagger-in 400ms var(--ease-spring) 120ms both" }}>
        <Typography
          variant="body1"
          sx={{ fontWeight: 600, color: "text.primary", mb: 0.5 }}
        >
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300 }}>
            {description}
          </Typography>
        )}
      </Box>

      {action && (
        <Box sx={{ animation: "stagger-in 400ms var(--ease-spring) 180ms both" }}>
          <Button
            variant="outlined"
            size="small"
            onClick={action.onClick}
            sx={{ borderRadius: "6px", fontWeight: 500 }}
          >
            {action.label}
          </Button>
        </Box>
      )}
    </Box>
  )
}

// ── Preset empty state SVG illustrations ─────────────────────────────────────

export function WikiEmptyIllustration() {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect x="10" y="12" width="60" height="8" rx="3" fill="currentColor" opacity="0.3"/>
      <rect x="10" y="26" width="45" height="5" rx="2.5" fill="currentColor" opacity="0.2"/>
      <rect x="10" y="36" width="55" height="5" rx="2.5" fill="currentColor" opacity="0.2"/>
      <rect x="10" y="46" width="40" height="5" rx="2.5" fill="currentColor" opacity="0.15"/>
      <rect x="10" y="58" width="50" height="4" rx="2" fill="currentColor" opacity="0.12"/>
      <rect x="10" y="66" width="35" height="4" rx="2" fill="currentColor" opacity="0.12"/>
    </svg>
  )
}

export function SearchEmptyIllustration() {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <circle cx="34" cy="34" r="18" stroke="currentColor" strokeWidth="4" opacity="0.3"/>
      <line x1="47" y1="47" x2="68" y2="68" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.3"/>
      <line x1="28" y1="34" x2="40" y2="34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.4"/>
      <line x1="34" y1="28" x2="34" y2="40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.2"/>
    </svg>
  )
}

export function GraphEmptyIllustration() {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <circle cx="40" cy="20" r="8" fill="currentColor" opacity="0.3"/>
      <circle cx="16" cy="56" r="8" fill="currentColor" opacity="0.25"/>
      <circle cx="64" cy="56" r="8" fill="currentColor" opacity="0.25"/>
      <line x1="40" y1="28" x2="16" y2="48" stroke="currentColor" strokeWidth="2" opacity="0.2"/>
      <line x1="40" y1="28" x2="64" y2="48" stroke="currentColor" strokeWidth="2" opacity="0.2"/>
      <line x1="24" y1="56" x2="56" y2="56" stroke="currentColor" strokeWidth="2" opacity="0.15"/>
    </svg>
  )
}
