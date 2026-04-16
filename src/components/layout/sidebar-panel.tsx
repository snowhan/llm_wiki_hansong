import { useState } from "react"
import Box from "@mui/material/Box"
import Tab from "@mui/material/Tab"
import Tabs from "@mui/material/Tabs"
import { useTranslation } from "react-i18next"
import { KnowledgeTree } from "./knowledge-tree"
import { FileTree } from "./file-tree"

export function SidebarPanel() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<"knowledge" | "files">("knowledge")

  return (
    <Box sx={{ display: "flex", height: "100%", flexDirection: "column" }}>
      <Tabs
        value={mode}
        onChange={(_, v) => setMode(v)}
        variant="fullWidth"
        sx={{
          flexShrink: 0,
          minHeight: 36,
          borderBottom: 1,
          borderColor: "divider",
          "& .MuiTab-root": {
            minHeight: 36,
            py: 0.75,
            fontSize: 12,
            fontWeight: 500,
            textTransform: "none",
          },
        }}
      >
        <Tab value="knowledge" label={t("sidebar.knowledge")} />
        <Tab value="files" label={t("sidebar.files")} />
      </Tabs>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {mode === "knowledge" ? <KnowledgeTree /> : <FileTree />}
      </Box>
    </Box>
  )
}
