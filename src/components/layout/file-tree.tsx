import { useState } from "react"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import ChevronRight from "@mui/icons-material/ChevronRight"
import ExpandMore from "@mui/icons-material/ExpandMore"
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined"
import FolderOutlined from "@mui/icons-material/FolderOutlined"
import { useWikiStore } from "@/stores/wiki-store"
import { useAuthStore } from "@/stores/auth-store"
import type { FileNode } from "@/types/wiki"
import { useTranslation } from "react-i18next"

/** Folders visible only to admin users. */
const ADMIN_ONLY_FOLDERS = new Set(["logs", "深度研究"])

function TreeNode({ node, depth, isAdmin }: { node: FileNode; depth: number; isAdmin: boolean }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(depth < 1)
  const activeTabPath = useWikiStore((s) => s.activeTabPath)
  const navigateInCurrentTab = useWikiStore((s) => s.navigateInCurrentTab)
  const setActiveView = useWikiStore((s) => s.setActiveView)

  const isSelected = activeTabPath === node.relativePath
  const paddingLeft = 12 + depth * 16

  // Hide internal cache sidecar files
  if (!node.is_dir && node.relativePath.endsWith(".cache.txt")) return null

  // Hide admin-only folders from non-admin users
  if (node.is_dir && ADMIN_ONLY_FOLDERS.has(node.name) && !isAdmin) return null

  if (node.is_dir) {
    return (
      <Box>
        <Box
          component="button"
          type="button"
          onClick={() => setExpanded(!expanded)}
          sx={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            gap: 0.5,
            py: 0.5,
            border: "none",
            background: "none",
            cursor: "pointer",
            font: "inherit",
            textAlign: "left",
            color: "text.secondary",
            pl: `${paddingLeft}px`,
            "&:hover": { bgcolor: "action.hover", color: "text.primary" },
          }}
        >
          {expanded ? (
            <ExpandMore sx={{ fontSize: 14, flexShrink: 0 }} />
          ) : (
            <ChevronRight sx={{ fontSize: 14, flexShrink: 0 }} />
          )}
          <FolderOutlined sx={{ fontSize: 14, flexShrink: 0, color: "info.light" }} />
          <Typography component="span" variant="body2" noWrap sx={{ flex: 1 }}>
            {t(`folderNames.${node.name}`, { defaultValue: node.name })}
          </Typography>
        </Box>
        {expanded && node.children?.filter(c => !c.relativePath.endsWith(".cache.txt")).map((child) => (
          <TreeNode key={child.relativePath} node={child} depth={depth + 1} isAdmin={isAdmin} />
        ))}
      </Box>
    )
  }

  return (
    <Box
      component="button"
      type="button"
      aria-current={isSelected ? "page" : undefined}
      onClick={() => { navigateInCurrentTab(node.relativePath); setActiveView("wiki") }}
      sx={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        gap: 0.5,
        py: 0.5,
        border: "none",
        background: isSelected ? "action.selected" : "none",
        cursor: "pointer",
        font: "inherit",
        textAlign: "left",
        color: isSelected ? "text.primary" : "text.secondary",
        pl: `${paddingLeft + 14}px`,
        "&:hover": { bgcolor: "action.hover", color: "text.primary" },
      }}
    >
      <InsertDriveFileOutlined sx={{ fontSize: 14, flexShrink: 0 }} />
      <Typography component="span" variant="body2" noWrap sx={{ flex: 1 }}>
        {node.name}
      </Typography>
    </Box>
  )
}

export function FileTree() {
  const { t } = useTranslation()
  const fileTree = useWikiStore((s) => s.fileTree)
  const project = useWikiStore((s) => s.project)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === "admin"

  if (!project) {
    return (
      <Box
        sx={{
          display: "flex",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          p: 2,
          typography: "body2",
          color: "text.secondary",
        }}
      >
        {t("fileTree.noProject")}
      </Box>
    )
  }

  return (
    <Box
      sx={{
        height: "100%",
        minWidth: 0,
        overflow: "auto",
      }}
    >
      <Box sx={{ p: 1 }}>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            mb: 1,
            px: 1,
            fontWeight: 600,
            textTransform: "uppercase",
            color: "text.secondary",
          }}
        >
          {project.name}
        </Typography>
        {fileTree.map((node) => (
          <TreeNode key={node.relativePath} node={node} depth={0} isAdmin={isAdmin} />
        ))}
      </Box>
    </Box>
  )
}
