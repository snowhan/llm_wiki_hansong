import { useState, useEffect, useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import IconButton from "@mui/material/IconButton"
import InputBase from "@mui/material/InputBase"
import Tooltip from "@mui/material/Tooltip"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Divider from "@mui/material/Divider"
import ChevronRight from "@mui/icons-material/ChevronRight"
import ExpandMore from "@mui/icons-material/ExpandMore"
import Description from "@mui/icons-material/Description"
import PeopleOutlineOutlined from "@mui/icons-material/PeopleOutlineOutlined"
import LightbulbOutlined from "@mui/icons-material/LightbulbOutlined"
import MenuBook from "@mui/icons-material/MenuBook"
import MergeType from "@mui/icons-material/MergeType"
import BarChart from "@mui/icons-material/BarChart"
import HelpOutlineOutlined from "@mui/icons-material/HelpOutlineOutlined"
import ViewModule from "@mui/icons-material/ViewModule"
import { TreeSkeleton } from "@/components/ui/tree-skeleton"
import Public from "@mui/icons-material/Public"
import MoreHoriz from "@mui/icons-material/MoreHoriz"
import DriveFileRenameOutline from "@mui/icons-material/DriveFileRenameOutline"
import DeleteOutlined from "@mui/icons-material/DeleteOutlined"
import type { SvgIconProps } from "@mui/material/SvgIcon"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile, writeFile, deleteFile, listDirectory } from "@/commands/fs"
import type { FileNode } from "@/types/wiki"

type IconComp = React.ComponentType<SvgIconProps>

interface WikiPageInfo {
  relativePath: string
  title: string
  type: string
  tags: string[]
  origin?: string
}

function canonicalTitleFromFileName(fileName: string): string {
  return fileName.replace(/\.md$/, "").replace(/-/g, " ").trim()
}

const TYPE_CONFIG: Record<string, { icon: IconComp; labelKey: string; iconColor: string; order: number }> = {
  overview:   { icon: ViewModule,               labelKey: "knowledgeTree.overview",    iconColor: "primary.main", order: 0 },
  entity:     { icon: PeopleOutlineOutlined,    labelKey: "knowledgeTree.entities",    iconColor: "info.main",    order: 1 },
  concept:    { icon: LightbulbOutlined,        labelKey: "knowledgeTree.concepts",    iconColor: "#9333ea",      order: 2 },
  source:     { icon: MenuBook,                 labelKey: "knowledgeTree.sources",     iconColor: "#0891b2",      order: 3 },
  synthesis:  { icon: MergeType,               labelKey: "knowledgeTree.synthesis",   iconColor: "error.main",   order: 4 },
  comparison: { icon: BarChart,                labelKey: "knowledgeTree.comparisons", iconColor: "success.main", order: 5 },
  query:      { icon: HelpOutlineOutlined,     labelKey: "knowledgeTree.queries",     iconColor: "success.dark", order: 6 },
}

const DEFAULT_CONFIG = {
  icon: Description,
  labelKey: "knowledgeTree.other",
  iconColor: "text.secondary",
  order: 99,
}

// ── Notion-style tree item ────────────────────────────────────────────────────
interface TreeItemProps {
  label: string
  isSelected: boolean
  isRenaming: boolean
  depth: number
  icon?: React.ReactNode
  onClick: () => void
  onDoubleClick: () => void
  onRenameSubmit: (newTitle: string) => void
  onContextMenu: (e: React.MouseEvent) => void
  onMoreClick: (e: React.MouseEvent) => void
}

function TreeItem({
  label,
  isSelected,
  isRenaming,
  depth,
  icon,
  onClick,
  onDoubleClick,
  onRenameSubmit,
  onContextMenu,
  onMoreClick,
}: TreeItemProps) {
  const [hovered, setHovered] = useState(false)
  const [renameValue, setRenameValue] = useState(label)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(label)
      setTimeout(() => {
        renameInputRef.current?.focus()
        renameInputRef.current?.select()
      }, 30)
    }
  }, [isRenaming, label])

  return (
    <Box
      component="button"
      type="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
      aria-current={isSelected ? "page" : undefined}
      sx={{
        font: "inherit",
        border: "none",
        background: "none",
        width: "100%",
        textAlign: "left",
        position: "relative",
        display: "flex",
        alignItems: "center",
        borderRadius: "5px",
        px: 1,
        py: 0.4,
        pl: `${8 + depth * 16}px`,
        cursor: "pointer",
        minHeight: 28,
        bgcolor: isSelected ? "rgba(35,131,226,0.10)" : "transparent",
        color: isSelected ? "text.primary" : "text.secondary",
        transition: "background-color var(--duration-fast) ease",
        "&:hover": {
          bgcolor: isSelected ? "rgba(35,131,226,0.14)" : "background.sidebarHover",
          color: "text.primary",
        },
      }}
      onClick={isRenaming ? undefined : onClick}
      onDoubleClick={isRenaming ? undefined : onDoubleClick}
    >
      {/* Hierarchy indent line */}
      {depth > 0 && (
        <Box
          sx={{
            position: "absolute",
            left: `${8 + (depth - 1) * 16 + 8}px`,
            top: 0,
            bottom: 0,
            width: "1px",
            bgcolor: "divider",
            opacity: 0.6,
          }}
        />
      )}

      {icon && (
        <Box sx={{ mr: 0.75, display: "flex", flexShrink: 0, opacity: 0.7 }}>
          {icon}
        </Box>
      )}

      {isRenaming ? (
        <InputBase
          inputRef={renameInputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => onRenameSubmit(renameValue)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onRenameSubmit(renameValue) }
            if (e.key === "Escape") onRenameSubmit(label) // cancel
          }}
          onClick={(e) => e.stopPropagation()}
          fullWidth
          inputProps={{ style: { padding: 0, fontSize: "0.8125rem", fontWeight: 500 } }}
          sx={{ flex: 1, fontSize: "0.8125rem" }}
        />
      ) : (
        <Typography
          variant="body2"
          noWrap
          sx={{ flex: 1, fontSize: "0.8125rem", fontWeight: 500, lineHeight: 1.4 }}
        >
          {label}
        </Typography>
      )}

      {/* Hover action: three-dot menu */}
      {hovered && !isRenaming && (
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onMoreClick(e) }}
          sx={{
            ml: 0.25,
            width: 20,
            height: 20,
            borderRadius: "4px",
            flexShrink: 0,
            color: "text.secondary",
            "&:hover": { bgcolor: "rgba(55,53,47,0.12)", color: "text.primary" },
          }}
        >
          <MoreHoriz sx={{ fontSize: 13 }} />
        </IconButton>
      )}
    </Box>
  )
}

// ── Group header ──────────────────────────────────────────────────────────────
interface GroupHeaderProps {
  icon: React.ReactNode
  label: string
  count: number
  isExpanded: boolean
  onToggle: () => void
}

function GroupHeader({ icon, label, count, isExpanded, onToggle }: GroupHeaderProps) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onToggle}
      sx={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        gap: 0.75,
        border: "none",
        background: "none",
        cursor: "pointer",
        font: "inherit",
        borderRadius: "5px",
        px: 1,
        py: 0.5,
        textAlign: "left",
        color: "text.secondary",
        transition: "background-color var(--duration-fast) ease",
        "&:hover": { bgcolor: "background.sidebarHover", color: "text.primary" },
      }}
    >
      {isExpanded ? (
        <ExpandMore sx={{ fontSize: 13, flexShrink: 0 }} />
      ) : (
        <ChevronRight sx={{ fontSize: 13, flexShrink: 0 }} />
      )}
      <Box sx={{ display: "flex", flexShrink: 0 }}>{icon}</Box>
      <Typography
        component="span"
        variant="caption"
        sx={{ flex: 1, fontWeight: 600, textAlign: "left", fontSize: "0.75rem", color: "inherit" }}
      >
        {label}
      </Typography>
      <Typography variant="caption" sx={{ fontSize: "0.7rem", color: "text.tertiary" }}>
        {count}
      </Typography>
    </Box>
  )
}

// ── Main KnowledgeTree ────────────────────────────────────────────────────────
export function KnowledgeTree() {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const activeTabPath = useWikiStore((s) => s.activeTabPath)
  const navigateInCurrentTab = useWikiStore((s) => s.navigateInCurrentTab)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const fileTree = useWikiStore((s) => s.fileTree)

  const [pages, setPages] = useState<WikiPageInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(
    new Set(["overview", "entity", "concept", "source"])
  )
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    page: WikiPageInfo
  } | null>(null)

  const loadPages = useCallback(async () => {
    if (!project) return
    setLoading(true)
    try {
      const wikiTree = await listDirectory(project.id, "wiki")
      const mdFiles = flattenMdFiles(wikiTree)
      const pageInfos: WikiPageInfo[] = []
      for (const file of mdFiles) {
        if (file.name === "index.md" || file.name === "log.md") continue
        try {
          const content = await readFile(project.id, file.relativePath)
          pageInfos.push(parsePageInfo(file.relativePath, file.name, content))
        } catch {
          pageInfos.push({
            relativePath: file.relativePath,
            title: file.name.replace(".md", "").replace(/-/g, " "),
            type: "other",
            tags: [],
          })
        }
      }
      setPages(pageInfos)
    } catch {
      setPages([])
    } finally {
      setLoading(false)
    }
  }, [project])

  useEffect(() => { loadPages() }, [loadPages, fileTree])

  if (!project) {
    return (
      <Box sx={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", p: 2 }}>
        <Typography variant="body2" color="text.secondary" align="center">
          {t("knowledgeTree.noProject")}
        </Typography>
      </Box>
    )
  }

  if (loading) {
    return <TreeSkeleton />
  }

  const grouped = new Map<string, WikiPageInfo[]>()
  for (const page of pages) {
    const list = grouped.get(page.type) ?? []
    list.push(page)
    grouped.set(page.type, list)
  }

  const sortedGroups = [...grouped.entries()].sort((a, b) => {
    const orderA = TYPE_CONFIG[a[0]]?.order ?? DEFAULT_CONFIG.order
    const orderB = TYPE_CONFIG[b[0]]?.order ?? DEFAULT_CONFIG.order
    return orderA - orderB
  })

  function toggleType(type: string) {
    setExpandedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  function handleContextMenu(e: React.MouseEvent, page: WikiPageInfo) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, page })
  }

  function handleCloseContextMenu() {
    setContextMenu(null)
  }

  function handleRenameSubmit(page: WikiPageInfo, newTitle: string) {
    setRenamingPath(null)
    const trimmed = newTitle.trim()
    if (!trimmed || trimmed === page.title) return

    // Optimistically update local state
    setPages((prev) =>
      prev.map((p) => (p.relativePath === page.relativePath ? { ...p, title: trimmed } : p))
    )

    // Persist: read → patch title in frontmatter → write
    if (project) {
      readFile(project.id, page.relativePath)
        .then((content) => {
          const patched = content.replace(
            /^title:\s*.*$/m,
            `title: ${trimmed}`,
          )
          // If no title field exists in frontmatter, insert it after first ---
          const updated = patched === content
            ? content.replace(/^---\n/, `---\ntitle: ${trimmed}\n`)
            : patched
          return writeFile(project.id, page.relativePath, updated)
        })
        .catch(() => {
          // Rollback optimistic update on error
          setPages((prev) =>
            prev.map((p) => (p.relativePath === page.relativePath ? { ...p, title: page.title } : p))
          )
        })
    }
  }

  return (
    <Box sx={{ height: "100%", overflow: "auto" }}>
      {/* Project name header */}
      <Box sx={{ px: 2, pt: 2, pb: 0.5 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            fontSize: "0.6875rem",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "text.secondary",
          }}
        >
          {project.name}
        </Typography>
      </Box>

      <Box sx={{ px: 1, pb: 2 }}>
        {sortedGroups.length === 0 && (
          <Box sx={{ px: 1, py: 4, textAlign: "center" }}>
            <Typography variant="caption" color="text.secondary">
              {t("knowledgeTree.noPages")}
            </Typography>
          </Box>
        )}

        {sortedGroups.map(([type, items]) => {
          const config = TYPE_CONFIG[type] ?? DEFAULT_CONFIG
          const Icon = config.icon
          const isExpanded = expandedTypes.has(type)

          return (
            <Box key={type} sx={{ mb: 0.25 }}>
              <GroupHeader
                icon={<Icon sx={{ fontSize: 13, color: config.iconColor }} />}
                label={t(config.labelKey)}
                count={items.length}
                isExpanded={isExpanded}
                onToggle={() => toggleType(type)}
              />

              {isExpanded && (
                <Box>
                  {items.map((page) => (
                    <TreeItem
                      key={page.relativePath}
                      label={page.title}
                      isSelected={activeTabPath === page.relativePath}
                      isRenaming={renamingPath === page.relativePath}
                      depth={1}
                      icon={
                        page.origin === "web-clip"
                          ? <Public sx={{ fontSize: 11, color: "info.light" }} />
                          : undefined
                      }
                      onClick={() => {
                        navigateInCurrentTab(page.relativePath)
                        setActiveView("wiki")
                      }}
                      onDoubleClick={() => setRenamingPath(page.relativePath)}
                      onRenameSubmit={(newTitle) => handleRenameSubmit(page, newTitle)}
                      onContextMenu={(e) => handleContextMenu(e, page)}
                      onMoreClick={(e) => handleContextMenu(e, page)}
                    />
                  ))}
                </Box>
              )}
            </Box>
          )
        })}

        <RawSourcesSection />
      </Box>

      {/* Context menu */}
      <Menu
        open={Boolean(contextMenu)}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
        slotProps={{
          paper: {
            sx: { minWidth: 180 },
          },
        }}
      >
        <MenuItem
          onClick={() => {
            if (contextMenu) setRenamingPath(contextMenu.page.relativePath)
            handleCloseContextMenu()
          }}
        >
          <DriveFileRenameOutline sx={{ fontSize: 14, mr: 1.5 }} />
          重命名
        </MenuItem>
        <Divider sx={{ my: 0.25 }} />
        <MenuItem
          onClick={() => {
            if (contextMenu && project) {
              const page = contextMenu.page
              handleCloseContextMenu()
              deleteFile(project.id, page.relativePath)
                .then(() => {
                  setPages((prev) => prev.filter((p) => p.relativePath !== page.relativePath))
                })
                .catch(() => {
                  // ignore - file may not exist
                })
            } else {
              handleCloseContextMenu()
            }
          }}
          sx={{ color: "error.main" }}
        >
          <DeleteOutlined sx={{ fontSize: 14, mr: 1.5 }} />
          删除
        </MenuItem>
      </Menu>
    </Box>
  )
}

// ── Raw Sources section ───────────────────────────────────────────────────────
function RawSourcesSection() {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const navigateInCurrentTab = useWikiStore((s) => s.navigateInCurrentTab)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const activeTabPath = useWikiStore((s) => s.activeTabPath)
  const [expanded, setExpanded] = useState(false)
  const [sources, setSources] = useState<FileNode[]>([])

  useEffect(() => {
    if (!project) return
    listDirectory(project.id, "raw/sources")
      .then((tree) => setSources(flattenAllFiles(tree)))
      .catch(() => setSources([]))
  }, [project])

  if (sources.length === 0) return null

  return (
    <Box sx={{ mt: 0.5, pt: 0.5, borderTop: "1px solid", borderColor: "divider" }}>
      <GroupHeader
        icon={<MenuBook sx={{ fontSize: 13, color: "#0891b2" }} />}
        label={t("knowledgeTree.rawSources")}
        count={sources.length}
        isExpanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded && (
        <Box>
          {sources.map((file) => (
            <TreeItem
              key={file.relativePath}
              label={file.name}
              isSelected={activeTabPath === file.relativePath}
              isRenaming={false}
              depth={1}
              onClick={() => {
                navigateInCurrentTab(file.relativePath)
                setActiveView("wiki")
              }}
              onDoubleClick={() => {}}
              onRenameSubmit={() => {}}
              onContextMenu={() => {}}
              onMoreClick={() => {}}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parsePageInfo(relativePath: string, fileName: string, content: string): WikiPageInfo {
  let type = "other"
  let title = canonicalTitleFromFileName(fileName)
  const tags: string[] = []
  let origin: string | undefined
  let frontmatterType: string | null = null

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (fmMatch) {
    const fm = fmMatch[1]
    const typeMatch = fm.match(/^type:\s*(.+)$/m)
    if (typeMatch) frontmatterType = typeMatch[1].trim().toLowerCase()

    const titleMatch = fm.match(/^title:\s*["']?(.+?)["']?\s*$/m)
    if (titleMatch) title = titleMatch[1].trim()

    const tagsMatch = fm.match(/^tags:\s*\[(.+?)\]/m)
    if (tagsMatch) {
      tags.push(...tagsMatch[1].split(",").map((t) => t.trim().replace(/["']/g, "")))
    }

    const originMatch = fm.match(/^origin:\s*(.+)$/m)
    if (originMatch) origin = originMatch[1].trim()
  }

  if (fileName === "overview.md") type = "overview"
  else if (relativePath.includes("/entities/")) type = "entity"
  else if (relativePath.includes("/concepts/")) type = "concept"
  else if (relativePath.includes("/sources/")) type = "source"
  else if (relativePath.includes("/queries/")) type = "query"
  else if (relativePath.includes("/comparisons/")) type = "comparison"
  else if (relativePath.includes("/synthesis/")) type = "synthesis"
  else if (frontmatterType) type = frontmatterType

  if (type === "overview") {
    if (!title || /^overview$/i.test(title)) title = "Wiki 总览"
  } else if (
    (type === "entity" || type === "concept" || type === "source") &&
    relativePath.startsWith("wiki/sources/")
  ) {
    title = canonicalTitleFromFileName(fileName)
  }

  return { relativePath, title, type, tags, origin }
}

function flattenMdFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) files.push(...flattenMdFiles(node.children))
    else if (!node.is_dir && node.name.endsWith(".md")) files.push(node)
  }
  return files
}

function flattenAllFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) files.push(...flattenAllFiles(node.children))
    else if (!node.is_dir && !node.relativePath.endsWith(".cache.txt")) files.push(node)
  }
  return files
}
