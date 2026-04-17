import { useState } from "react"
import Box from "@mui/material/Box"
import ButtonBase from "@mui/material/ButtonBase"
import Stack from "@mui/material/Stack"
import { useTranslation } from "react-i18next"
import { KnowledgeTree } from "./knowledge-tree"
import { FileTree } from "./file-tree"

type Mode = "knowledge" | "files"

export function SidebarPanel() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>("knowledge")

  const tabs: { value: Mode; label: string }[] = [
    { value: "knowledge", label: t("sidebar.knowledge") },
    { value: "files", label: t("sidebar.files") },
  ]

  return (
    <Box sx={{ display: "flex", height: "100%", flexDirection: "column" }}>
      <Stack
        direction="row"
        sx={{
          flexShrink: 0,
          px: 1,
          pt: 1.25,
          pb: 0.75,
          gap: 0.25,
        }}
      >
        {tabs.map((tab) => (
          <ButtonBase
            key={tab.value}
            onClick={() => setMode(tab.value)}
            sx={{
              position: "relative",
              px: 1.5,
              py: 0.5,
              borderRadius: "8px",
              fontSize: "0.75rem",
              fontWeight: mode === tab.value ? 600 : 500,
              color: mode === tab.value ? "#C2410C" : "text.tertiary",
              bgcolor: mode === tab.value ? "rgba(194, 65, 12, 0.06)" : "transparent",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              "&:hover": {
                bgcolor: mode === tab.value ? "rgba(194, 65, 12, 0.08)" : "rgba(28,25,23,0.04)",
                color: mode === tab.value ? "#C2410C" : "text.secondary",
              },
            }}
          >
            {tab.label}
          </ButtonBase>
        ))}
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {mode === "knowledge" ? <KnowledgeTree /> : <FileTree />}
      </Box>
    </Box>
  )
}
