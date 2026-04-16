import { Component, type ReactNode } from "react"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import i18n from "@/i18n"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <Box
          sx={{
            display: "flex",
            height: "100%",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1.5,
            p: 3,
            fontSize: "0.875rem",
            color: "text.secondary",
          }}
        >
          <Typography color="error" component="p" sx={{ fontWeight: 500 }}>
            {i18n.t("error.somethingWrong")}
          </Typography>
          <Typography variant="caption" sx={{ maxWidth: "28rem", textAlign: "center" }}>
            {this.state.error?.message}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            sx={{ fontSize: "0.75rem", px: 1.5, py: 0.5 }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            {i18n.t("error.retry")}
          </Button>
        </Box>
      )
    }
    return this.props.children
  }
}
