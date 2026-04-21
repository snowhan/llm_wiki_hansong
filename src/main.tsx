import React from "react"
import ReactDOM from "react-dom/client"
import { ThemeProvider } from "@mui/material/styles"
import CssBaseline from "@mui/material/CssBaseline"
import { theme } from "@/themes"
import App from "./App"
import "./index.css"
import "@/i18n"
import "@fontsource/plus-jakarta-sans/400.css"
import "@fontsource/plus-jakarta-sans/500.css"
import "@fontsource/plus-jakarta-sans/600.css"
import "@fontsource/plus-jakarta-sans/700.css"
import "@fontsource/geist-mono/400.css"
import "@fontsource/geist-mono/500.css"
import { useWikiStore } from "@/stores/wiki-store"

// Read wiki-store's persisted colorScheme synchronously before first render
// so MUI CssVarsProvider initializes with the correct mode immediately.
const persistedMode = useWikiStore.getState().colorScheme ?? "system"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={theme} defaultMode={persistedMode}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
)
