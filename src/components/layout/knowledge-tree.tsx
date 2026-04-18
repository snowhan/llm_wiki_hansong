import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
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
import Public from "@mui/icons-material/Public"
import type { SvgIconProps } from "@mui/material/SvgIcon"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile, listDirectory } from "@/commands/fs"
import type { FileNode } from "@/types/wiki"

type IconComp = React.ComponentType<SvgIconProps>

interface WikiPageInfo {
  relativePath: string
  title: string
  type: string
  tags: string[]
  origin?: string
}

const TYPE_CONFIG: Record<string, { icon: IconComp; labelKey: string; iconColor: string; order: number }> = {
  overview: { icon: ViewModule, labelKey: "knowledgeTree.overview", iconColor: "warning.main", order: 0 },
  entity: { icon: PeopleOutlineOutlined, labelKey: "knowledgeTree.entities", iconColor: "info.main", order: 1 },
  concept: { icon: LightbulbOutlined, labelKey: "knowledgeTree.concepts", iconColor: "#9333ea", order: 2 },
  source: { icon: MenuBook, labelKey: "knowledgeTree.sources", iconColor: "warning.dark", order: 3 },
  synthesis: { icon: MergeType, labelKey: "knowledgeTree.synthesis", iconColor: "error.main", order: 4 },
  comparison: { icon: BarChart, labelKey: "knowledgeTree.comparisons", iconColor: "success.main", order: 5 },
  query: { icon: HelpOutlineOutlined, labelKey: "knowledgeTree.queries", iconColor: "success.dark", order: 6 },
}

const DEFAULT_CONFIG = {
  icon: Description,
  labelKey: "knowledgeTree.other",
  iconColor: "text.secondary",
  order: 99,
}

export function KnowledgeTree() {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const selectedFile = useWikiStore((s) => s.selectedFile)
  const navigateInCurrentTab = useWikiStore((s) => s.navigateInCurrentTab)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const fileTree = useWikiStore((s) => s.fileTree)
  const [pages, setPages] = useState<WikiPageInfo[]>([])
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(["overview", "entity", "concept", "source"]))

  const loadPages = useCallback(async () => {
    if (!project) return
    try {
      const wikiTree = await listDirectory(project.id, "wiki")
      const mdFiles = flattenMdFiles(wikiTree)

      const pageInfos: WikiPageInfo[] = []
      for (const file of mdFiles) {
        if (file.name === "index.md" || file.name === "log.md") continue
        try {
          const content = await readFile(project.id, file.relativePath)
          const info = parsePageInfo(file.relativePath, file.name, content)
          pageInfos.push(info)
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
    }
  }, [project])

  useEffect(() => {
    loadPages()
  }, [loadPages, fileTree])

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
        {t("knowledgeTree.noProject")}
      </Box>
    )
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

  return (
    <Box sx={{ height: "100%", overflow: "auto" }}>
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

        {sortedGroups.length === 0 && (
          <Typography variant="caption" sx={{ display: "block", px: 1, py: 2, textAlign: "center", color: "text.secondary" }}>
            {t("knowledgeTree.noPages")}
          </Typography>
        )}

        {sortedGroups.map(([type, items]) => {
          const config = TYPE_CONFIG[type] ?? DEFAULT_CONFIG
          const Icon = config.icon
          const isExpanded = expandedTypes.has(type)

          return (
            <Box key={type} sx={{ mb: 0.5 }}>
              <Box
                component="button"
                type="button"
                onClick={() => toggleType(type)}
                sx={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  gap: 0.75,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  font: "inherit",
                  borderRadius: 1,
                  px: 1,
                  py: 0.75,
                  textAlign: "left",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                {isExpanded ? (
                  <ExpandMore sx={{ fontSize: 14, flexShrink: 0, color: "text.secondary" }} />
                ) : (
                  <ChevronRight sx={{ fontSize: 14, flexShrink: 0, color: "text.secondary" }} />
                )}
                <Icon sx={{ fontSize: 14, flexShrink: 0, color: config.iconColor }} />
                <Typography component="span" variant="body2" sx={{ flex: 1, fontWeight: 500, textAlign: "left" }}>
                  {t(config.labelKey)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {items.length}
                </Typography>
              </Box>

              {isExpanded && (
                <Box sx={{ ml: 1.5 }}>
                  {items.map((page) => {
                    const isSelected = selectedFile === page.relativePath
                    return (
                      <Box
                        key={page.relativePath}
                        component="button"
                        type="button"
                        onClick={() => { navigateInCurrentTab(page.relativePath); setActiveView("wiki") }}
                        title={page.relativePath}
                        sx={{
                          display: "flex",
                          width: "100%",
                          alignItems: "center",
                          gap: 0.75,
                          border: "none",
                          borderRadius: 1,
                          px: 1,
                          py: 0.5,
                          background: isSelected ? "action.selected" : "none",
                          cursor: "pointer",
                          font: "inherit",
                          textAlign: "left",
                          color: isSelected ? "text.primary" : "text.secondary",
                          "&:hover": { bgcolor: "action.hover", color: "text.primary" },
                        }}
                      >
                        {page.origin === "web-clip" && (
                          <Public sx={{ fontSize: 12, flexShrink: 0, color: "info.light" }} />
                        )}
                        <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                          {page.title}
                        </Typography>
                      </Box>
                    )
                  })}
                </Box>
              )}
            </Box>
          )
        })}

        <RawSourcesSection />
      </Box>
    </Box>
  )
}

function RawSourcesSection() {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const navigateInCurrentTab = useWikiStore((s) => s.navigateInCurrentTab)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const selectedFile = useWikiStore((s) => s.selectedFile)
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
    <Box sx={{ mt: 1, borderTop: 1, borderColor: "divider", pt: 1 }}>
      <Box
        component="button"
        type="button"
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          gap: 0.75,
          border: "none",
          background: "none",
          cursor: "pointer",
          font: "inherit",
          borderRadius: 1,
          px: 1,
          py: 0.75,
          textAlign: "left",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        {expanded ? (
          <ExpandMore sx={{ fontSize: 14, flexShrink: 0, color: "text.secondary" }} />
        ) : (
          <ChevronRight sx={{ fontSize: 14, flexShrink: 0, color: "text.secondary" }} />
        )}
        <MenuBook sx={{ fontSize: 14, flexShrink: 0, color: "warning.dark" }} />
        <Typography component="span" variant="body2" sx={{ flex: 1, fontWeight: 500, textAlign: "left", color: "text.secondary" }}>
          {t("knowledgeTree.rawSources")}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {sources.length}
        </Typography>
      </Box>
      {expanded && (
        <Box sx={{ ml: 1.5 }}>
          {sources.map((file) => {
            const isSelected = selectedFile === file.relativePath
            return (
              <Box
                key={file.relativePath}
                component="button"
                type="button"
                onClick={() => { navigateInCurrentTab(file.relativePath); setActiveView("wiki") }}
                sx={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  gap: 0.75,
                  border: "none",
                  borderRadius: 1,
                  px: 1,
                  py: 0.5,
                  background: isSelected ? "action.selected" : "none",
                  cursor: "pointer",
                  font: "inherit",
                  textAlign: "left",
                  color: isSelected ? "text.primary" : "text.secondary",
                  "&:hover": { bgcolor: "action.hover", color: "text.primary" },
                }}
              >
                <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                  {file.name}
                </Typography>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}

function parsePageInfo(relativePath: string, fileName: string, content: string): WikiPageInfo {
  let type = "other"
  let title = fileName.replace(".md", "").replace(/-/g, " ")
  const tags: string[] = []
  let origin: string | undefined

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (fmMatch) {
    const fm = fmMatch[1]
    const typeMatch = fm.match(/^type:\s*(.+)$/m)
    if (typeMatch) type = typeMatch[1].trim().toLowerCase()

    const titleMatch = fm.match(/^title:\s*["']?(.+?)["']?\s*$/m)
    if (titleMatch) title = titleMatch[1].trim()

    const tagsMatch = fm.match(/^tags:\s*\[(.+?)\]/m)
    if (tagsMatch) {
      tags.push(...tagsMatch[1].split(",").map((t) => t.trim().replace(/["']/g, "")))
    }

    const originMatch = fm.match(/^origin:\s*(.+)$/m)
    if (originMatch) origin = originMatch[1].trim()
  }

  if (type === "other") {
    if (relativePath.includes("/entities/")) type = "entity"
    else if (relativePath.includes("/concepts/")) type = "concept"
    else if (relativePath.includes("/sources/")) type = "source"
    else if (relativePath.includes("/queries/")) type = "query"
    else if (relativePath.includes("/comparisons/")) type = "comparison"
    else if (relativePath.includes("/synthesis/")) type = "synthesis"
    else if (fileName === "overview.md") type = "overview"
  }

  return { relativePath, title, type, tags, origin }
}

function flattenMdFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      files.push(...flattenMdFiles(node.children))
    } else if (!node.is_dir && node.name.endsWith(".md")) {
      files.push(node)
    }
  }
  return files
}

function flattenAllFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      files.push(...flattenAllFiles(node.children))
    } else if (!node.is_dir && !node.relativePath.endsWith(".cache.txt")) {
      files.push(node)
    }
  }
  return files
}
