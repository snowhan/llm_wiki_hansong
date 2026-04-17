import { useEffect, useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import IconButton from "@mui/material/IconButton"
import Close from "@mui/icons-material/Close"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile, writeFile } from "@/commands/fs"
import { getFileCategory, isBinary } from "@/lib/file-types"
import { WikiEditor } from "@/components/editor/wiki-editor"
import { FilePreview } from "@/components/editor/file-preview"
import { getFileName, splitFrontmatter } from "@/lib/path-utils"

export function PreviewPanel() {
  const { t } = useTranslation()
  const selectedFile = useWikiStore((s) => s.selectedFile)
  const fileContent = useWikiStore((s) => s.fileContent)
  const setFileContent = useWikiStore((s) => s.setFileContent)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!selectedFile) {
      setFileContent("")
      return
    }

    const category = getFileCategory(selectedFile)

    if (isBinary(category)) {
      setFileContent("")
      return
    }

    readFile(selectedFile)
      .then(setFileContent)
      .catch((err) => setFileContent(t("preview.errorLoading", { err })))
  }, [selectedFile, setFileContent, t])

  const { frontmatter, body: markdownBody } = splitFrontmatter(fileContent)

  const handleSave = useCallback(
    (markdown: string) => {
      if (!selectedFile) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        writeFile(selectedFile, frontmatter + markdown).catch((err) =>
          console.error("Failed to save:", err)
        )
      }, 1000)
    },
    [selectedFile, frontmatter]
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  if (!selectedFile) {
    return (
      <Box
        sx={{
          display: "flex",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          typography: "body2",
          color: "text.secondary",
        }}
      >
        {t("preview.selectFile")}
      </Box>
    )
  }

  const category = getFileCategory(selectedFile)
  const fileName = getFileName(selectedFile)

  return (
    <Box sx={{ display: "flex", height: "100%", flexDirection: "column" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          px: 1.5,
          py: 0.75,
        }}
      >
        <Typography variant="caption" noWrap sx={{ color: "text.secondary", flex: 1, minWidth: 0 }} title={selectedFile}>
          {fileName}
        </Typography>
        <IconButton
          size="small"
          onClick={() => setSelectedFile(null)}
          sx={{ flexShrink: 0, color: "text.secondary", "&:hover": { bgcolor: "action.hover" } }}
          aria-label="Close"
        >
          <Close sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, overflow: "auto" }}>
        {category === "markdown" ? (
          <WikiEditor
            key={selectedFile}
            content={markdownBody}
            onSave={handleSave}
          />
        ) : (
          <FilePreview
            key={selectedFile}
            filePath={selectedFile}
            textContent={fileContent}
          />
        )}
      </Box>
    </Box>
  )
}
