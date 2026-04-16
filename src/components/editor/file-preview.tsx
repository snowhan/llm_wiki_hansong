import { convertFileSrc } from "@tauri-apps/api/core"
import { useTranslation } from "react-i18next"
import AudiotrackIcon from "@mui/icons-material/Audiotrack"
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined"
import ImageIcon from "@mui/icons-material/Image"
import MovieIcon from "@mui/icons-material/Movie"
import TableChartIcon from "@mui/icons-material/TableChart"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import { alpha } from "@mui/material/styles"
import { MarkdownView } from "@/components/ui/markdown-view"
import { getFileCategory, getCodeLanguage } from "@/lib/file-types"
import type { FileCategory } from "@/lib/file-types"
import { getFileName } from "@/lib/path-utils"

interface FilePreviewProps {
  filePath: string
  textContent: string
}

export function FilePreview({ filePath, textContent }: FilePreviewProps) {
  const { t } = useTranslation()
  const category = getFileCategory(filePath)
  const fileName = getFileName(filePath)

  switch (category) {
    case "image":
      return <ImagePreview filePath={filePath} fileName={fileName} />
    case "video":
      return <VideoPreview filePath={filePath} fileName={fileName} />
    case "audio":
      return <AudioPreview filePath={filePath} fileName={fileName} />
    case "pdf":
      return <TextPreview filePath={filePath} content={textContent} label={t("preview.pdfExtracted")} />
    case "code":
      return <CodePreview filePath={filePath} content={textContent} />
    case "data":
      return <CodePreview filePath={filePath} content={textContent} />
    case "text":
      return <TextPreview filePath={filePath} content={textContent} label={t("preview.text")} />
    case "document":
      return <BinaryPlaceholder filePath={filePath} fileName={fileName} category={category} />
    default:
      return <BinaryPlaceholder filePath={filePath} fileName={fileName} category={category} />
  }
}

function ImagePreview({ filePath, fileName }: { filePath: string; fileName: string }) {
  const src = convertFileSrc(filePath)
  return (
    <Box sx={{ display: "flex", height: "100%", flexDirection: "column", p: 3 }}>
      <Typography variant="caption" sx={{ mb: 2, color: "text.secondary" }}>
        {filePath}
      </Typography>
      <Box
        sx={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          overflow: "auto",
          borderRadius: 2,
          bgcolor: (theme) => alpha(theme.palette.action.hover, 0.2),
        }}
      >
        <Box
          component="img"
          src={src}
          alt={fileName}
          sx={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
        />
      </Box>
    </Box>
  )
}

function VideoPreview({ filePath, fileName }: { filePath: string; fileName: string }) {
  const src = convertFileSrc(filePath)
  return (
    <Box sx={{ display: "flex", height: "100%", flexDirection: "column", p: 3 }}>
      <Typography variant="caption" sx={{ mb: 2, color: "text.secondary" }}>
        {filePath}
      </Typography>
      <Box
        sx={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          overflow: "auto",
          borderRadius: 2,
          bgcolor: "#000",
        }}
      >
        <Box
          component="video"
          src={src}
          controls
          sx={{ maxHeight: "100%", maxWidth: "100%" }}
        >
          <track kind="captions" label={fileName} />
        </Box>
      </Box>
    </Box>
  )
}

function AudioPreview({ filePath, fileName }: { filePath: string; fileName: string }) {
  const src = convertFileSrc(filePath)
  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        p: 3,
      }}
    >
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {filePath}
      </Typography>
      <AudiotrackIcon sx={{ fontSize: 64, color: "action.disabled" }} />
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {fileName}
      </Typography>
      <Box
        component="audio"
        src={src}
        controls
        sx={{ width: "100%", maxWidth: 448 }}
      >
        <track kind="captions" label={fileName} />
      </Box>
    </Box>
  )
}

function CodePreview({ filePath, content }: { filePath: string; content: string }) {
  const lang = getCodeLanguage(filePath)
  return (
    <Box sx={{ height: "100%", overflow: "auto", p: 3 }}>
      <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {filePath}
        </Typography>
        <Typography
          component="span"
          variant="caption"
          sx={{
            borderRadius: 1,
            bgcolor: "action.hover",
            px: 0.75,
            py: 0.25,
            fontSize: 10,
            textTransform: "uppercase",
            lineHeight: 1.2,
          }}
        >
          {lang}
        </Typography>
      </Box>
      <Box
        component="pre"
        sx={{
          m: 0,
          whiteSpace: "pre-wrap",
          borderRadius: 2,
          bgcolor: (theme) => alpha(theme.palette.action.hover, 0.2),
          p: 2,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: "0.875rem",
        }}
      >
        {content}
      </Box>
    </Box>
  )
}

function TextPreview({ filePath, content, label }: { filePath: string; content: string; label: string }) {
  return (
    <Box sx={{ height: "100%", overflow: "auto", p: 3 }}>
      <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {filePath}
        </Typography>
        <Typography
          component="span"
          variant="caption"
          sx={{
            borderRadius: 1,
            bgcolor: "action.hover",
            px: 0.75,
            py: 0.25,
            fontSize: 10,
            textTransform: "uppercase",
            lineHeight: 1.2,
          }}
        >
          {label}
        </Typography>
      </Box>
      <MarkdownView markdown={content} sx={{ fontSize: "0.875rem" }} />
    </Box>
  )
}

const iconMap: Record<string, typeof HelpOutlineOutlinedIcon> = {
  document: TableChartIcon,
  unknown: HelpOutlineOutlinedIcon,
  image: ImageIcon,
  video: MovieIcon,
}

function BinaryPlaceholder({
  filePath,
  fileName,
  category,
}: {
  filePath: string
  fileName: string
  category: FileCategory
}) {
  const { t } = useTranslation()
  const Icon = iconMap[category] ?? HelpOutlineOutlinedIcon

  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        p: 3,
        textAlign: "center",
      }}
    >
      <Icon sx={{ fontSize: 64, color: "action.disabled" }} />
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {fileName}
        </Typography>
        <Typography variant="caption" sx={{ mt: 0.5, display: "block", color: "text.secondary" }}>
          {filePath}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {t("preview.notAvailable")}
      </Typography>
    </Box>
  )
}
