import { useState, useEffect, useCallback, useRef } from "react"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import CircularProgress from "@mui/material/CircularProgress"
import AddIcon from "@mui/icons-material/Add"
import DescriptionIcon from "@mui/icons-material/Description"
import RefreshIcon from "@mui/icons-material/Refresh"
import MenuBookIcon from "@mui/icons-material/MenuBook"
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome"
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined"
import FolderIcon from "@mui/icons-material/Folder"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import { useWikiStore } from "@/stores/wiki-store"
import { copyFile, copyDirectory, listDirectory, readFile, writeFile, deleteFile, findRelatedWikiPages, preprocessFile } from "@/commands/fs"
import type { PreprocessStage } from "@/commands/fs"
import { apiUpload } from "@/lib/api-client"
import type { FileNode } from "@/types/wiki"
import { useTranslation } from "react-i18next"
import { normalizePath, getFileName, getFileStem } from "@/lib/path-utils"
import { startServerIngest, subscribeIngestSSE, getAllServerTasks } from "@/commands/ingest"

export type PreprocessStatus = "idle" | "processing" | "done" | "error"
export type IngestStatus = "idle" | "ingesting" | "interrupted" | "done" | "error"

export function SourcesView() {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const selectedFile = useWikiStore((s) => s.selectedFile)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setFileContent = useWikiStore((s) => s.setFileContent)
  const setFileTree = useWikiStore((s) => s.setFileTree)
  const llmConfig = useWikiStore((s) => s.llmConfig)
  const ingestingPath = useWikiStore((s) => s.ingestingPath)
  const ingestStatuses = useWikiStore((s) => s.ingestStatuses)
  const setIngestingPath = useWikiStore((s) => s.setIngestingPath)
  const setIngestStatus = useWikiStore((s) => s.setIngestStatus)
  const serverTaskIds = useWikiStore((s) => s.serverTaskIds)
  const setServerTaskId = useWikiStore((s) => s.setServerTaskId)
  const [sources, setSources] = useState<FileNode[]>([])
  const [importing, setImporting] = useState(false)
  const [preprocessStatuses, setPreprocessStatuses] = useState<Record<string, PreprocessStatus>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const setFileStatus = useCallback((path: string, status: PreprocessStatus) => {
    setPreprocessStatuses((prev) => ({ ...prev, [path]: status }))
  }, [])

  const loadSources = useCallback(async () => {
    if (!project) return
    const pp = normalizePath(project.path)
    try {
      const tree = await listDirectory(`${pp}/raw/sources`)
      const filtered = filterTree(tree)
      setSources(filtered)
      // Also refresh main file tree so deleted empty wiki pages disappear
      const fullTree = await listDirectory(pp)
      setFileTree(fullTree)
      useWikiStore.getState().bumpDataVersion()
    } catch {
      setSources([])
    }
  }, [project, setFileTree])

  useEffect(() => {
    loadSources()
  }, [loadSources])

  // Check cache existence for all files when sources load
  useEffect(() => {
    if (!sources.length) return
    const allFiles = flattenAllFiles(sources)
    for (const file of allFiles) {
      // Check if .cache.txt exists → "done", else trigger preprocessing
      readFile(file.path + ".cache.txt")
        .then(() => setFileStatus(file.path, "done"))
        .catch(() => {
          // No cache — auto-trigger preprocessing
          setFileStatus(file.path, "processing")
          preprocessFile(file.path, (stage) => {
            if (stage === "done" || stage === "cached") setFileStatus(file.path, "done")
            else if (stage === "error") setFileStatus(file.path, "error")
          }).catch(() => setFileStatus(file.path, "error"))
        })
    }
  }, [sources, setFileStatus])

  // Check wiki ingest status for all source files on load
  useEffect(() => {
    if (!sources.length || !project) return
    const pp = normalizePath(project.path)
    const allFiles = flattenAllFiles(sources)
    for (const file of allFiles) {
      const stem = getFileStem(file.name)
      const wikiSourcePage = `${pp}/wiki/sources/${stem}.md`
      readFile(wikiSourcePage)
        .then(() => setIngestStatus(file.path, "done"))
        .catch(() => {
          // Don't overwrite "interrupted" — it means page was refreshed mid-ingest
          const current = useWikiStore.getState().ingestStatuses[file.path]
          if (current !== "interrupted") setIngestStatus(file.path, "idle")
        })
    }
  }, [sources, project, setIngestStatus])

  // ── Reconnect to running server tasks on mount ──────────────────────────
  useEffect(() => {
    if (!sources.length || !project) return
    const allFiles = flattenAllFiles(sources)

    ;(async () => {
      // 1. Reconnect to tasks that are stored but whose status may not be synced
      const runningServerTasks = await getAllServerTasks()
      const runningByPath = new Map(
        runningServerTasks
          .filter((t) => t.status === "running" || t.status === "pending")
          .map((t) => [t.sourcePath, t.id]),
      )

      for (const file of allFiles) {
        const storedTaskId = useWikiStore.getState().serverTaskIds[file.path]
        const liveTaskId = runningByPath.get(file.path) ?? (storedTaskId ? storedTaskId : null)

        if (!liveTaskId) continue

        // Mark as ingesting and subscribe
        useWikiStore.getState().setIngestStatus(file.path, "ingesting")
        useWikiStore.getState().setIngestingPath(file.path)

        subscribeIngestSSE(liveTaskId, {
          onUpdate: (task) => {
            useWikiStore.getState().setIngestStatus(
              file.path,
              task.status === "running" ? "ingesting" : task.status === "done" ? "done" : task.status === "error" ? "error" : "ingesting",
            )
          },
          onDone: async (task) => {
            const pp = normalizePath(project.path)
            useWikiStore.getState().setIngestStatus(file.path, task.filesWritten.length > 0 ? "done" : "error")
            useWikiStore.getState().setIngestingPath(null)
            useWikiStore.getState().setServerTaskId(file.path, null)
            if (task.filesWritten.length > 0) {
              try {
                const tree = await listDirectory(pp)
                useWikiStore.getState().setFileTree(tree)
                useWikiStore.getState().bumpDataVersion()
              } catch { /* non-critical */ }
            }
          },
          onError: () => {
            useWikiStore.getState().setIngestStatus(file.path, "error")
            useWikiStore.getState().setIngestingPath(null)
            useWikiStore.getState().setServerTaskId(file.path, null)
          },
        })
      }

      // 2. Auto-retry "interrupted" files that have no running server task
      const interruptedFiles = allFiles.filter(
        (f) =>
          useWikiStore.getState().ingestStatuses[f.path] === "interrupted" &&
          !runningByPath.has(f.path),
      )

      for (const file of interruptedFiles) {
        if (useWikiStore.getState().ingestingPath) break
        await triggerServerIngest(file)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, project])

  // ── Core: start a server-side ingest task and subscribe to its SSE ──────
  async function triggerServerIngest(node: FileNode, folderContext = "") {
    if (!project) return
    const pp = normalizePath(project.path)

    useWikiStore.getState().setIngestingPath(node.path)
    useWikiStore.getState().setIngestStatus(node.path, "ingesting")

    let taskId: string
    try {
      taskId = await startServerIngest({
        projectPath: pp,
        sourcePath: node.path,
        llmConfig,
        folderContext,
      })
    } catch (err) {
      console.error("[SourcesView] Failed to start server ingest:", err)
      useWikiStore.getState().setIngestStatus(node.path, "error")
      useWikiStore.getState().setIngestingPath(null)
      return
    }

    // Persist taskId so we can reconnect after page refresh
    useWikiStore.getState().setServerTaskId(node.path, taskId)

    subscribeIngestSSE(taskId, {
      onUpdate: (task) => {
        useWikiStore.getState().setIngestStatus(
          node.path,
          task.status === "running" ? "ingesting" : task.status === "done" ? "done" : task.status === "error" ? "error" : "ingesting",
        )
      },
      onDone: async (task) => {
        useWikiStore.getState().setIngestStatus(node.path, task.filesWritten.length > 0 ? "done" : "error")
        useWikiStore.getState().setIngestingPath(null)
        useWikiStore.getState().setServerTaskId(node.path, null)
        if (task.filesWritten.length > 0) {
          try {
            const tree = await listDirectory(pp)
            setFileTree(tree)
            useWikiStore.getState().bumpDataVersion()
          } catch { /* non-critical */ }
        }
      },
      onError: () => {
        useWikiStore.getState().setIngestStatus(node.path, "error")
        useWikiStore.getState().setIngestingPath(null)
        useWikiStore.getState().setServerTaskId(node.path, null)
      },
    })
  }

  function handleImport() {
    fileInputRef.current?.click()
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (!project || !e.target.files?.length) return

    setImporting(true)
    const pp = normalizePath(project.path)
    const destDir = `${pp}/raw/sources`

    try {
      const formData = new FormData()
      formData.append("destDir", destDir)
      for (const file of Array.from(e.target.files)) {
        formData.append("files", file)
      }

      const { paths: importedPaths } = await apiUpload("/api/fs/upload", formData)

      for (const destPath of importedPaths) {
        setFileStatus(destPath, "processing")
        preprocessFile(destPath, (stage: PreprocessStage) => {
          if (stage === "done" || stage === "cached") setFileStatus(destPath, "done")
          else if (stage === "error") setFileStatus(destPath, "error")
        }).catch(() => setFileStatus(destPath, "error"))
      }

      await loadSources()

      if (llmConfig.apiKey || llmConfig.provider === "ollama" || llmConfig.provider === "custom" || llmConfig.provider === "wps") {
        for (const destPath of importedPaths) {
          const node = { path: destPath, name: getFileName(destPath), is_dir: false }
          triggerServerIngest(node).catch((err) =>
            console.error(`Failed to start server ingest:`, err)
          )
        }
      }
    } catch (err) {
      console.error("Failed to import files:", err)
    } finally {
      setImporting(false)
      e.target.value = ""
    }
  }

  function handleImportFolder() {
    folderInputRef.current?.click()
  }

  async function handleFolderSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (!project || !e.target.files?.length) return

    setImporting(true)
    const pp = normalizePath(project.path)
    const files = Array.from(e.target.files)
    const firstRelPath = files[0]?.webkitRelativePath ?? ""
    const folderName = firstRelPath.split("/")[0] || "imported"
    const destDir = `${pp}/raw/sources/${folderName}`

    try {
      const formData = new FormData()
      formData.append("destDir", destDir)
      for (const file of files) {
        const relativePath = file.webkitRelativePath || file.name
        const pathWithinFolder = relativePath.split("/").slice(1).join("/") || file.name
        formData.append("files", file, pathWithinFolder)
      }

      const { paths: copiedFiles } = await apiUpload("/api/fs/upload", formData)

      console.log(`[Folder Import] Uploaded ${copiedFiles.length} files from ${folderName}`)

      for (const filePath of copiedFiles) {
        setFileStatus(filePath, "processing")
        preprocessFile(filePath, (stage: PreprocessStage) => {
          if (stage === "done" || stage === "cached") setFileStatus(filePath, "done")
          else if (stage === "error") setFileStatus(filePath, "error")
        }).catch(() => setFileStatus(filePath, "error"))
      }

      await loadSources()

      if (llmConfig.apiKey || llmConfig.provider === "ollama" || llmConfig.provider === "custom" || llmConfig.provider === "wps") {
        const tasks = copiedFiles
          .filter((fp) => {
            const ext = fp.split(".").pop()?.toLowerCase() ?? ""
            return ["md", "mdx", "txt", "pdf", "docx", "pptx", "xlsx", "xls",
                    "csv", "json", "html", "htm", "rtf", "xml", "yaml", "yml"].includes(ext)
          })
          .map((filePath) => {
            const relPath = filePath.replace(destDir + "/", "")
            const parts = relPath.split("/")
            parts.pop()
            const context = parts.length > 0
              ? `${folderName} > ${parts.join(" > ")}`
              : folderName
            return { sourcePath: filePath, folderContext: context }
          })

        if (tasks.length > 0) {
          for (const { sourcePath, folderContext } of tasks) {
            const node = { path: sourcePath, name: getFileName(sourcePath), is_dir: false }
            triggerServerIngest(node, folderContext).catch((err) =>
              console.error(`Failed to start server ingest:`, err)
            )
          }
          console.log(`[Folder Import] Triggered server ingest for ${tasks.length} files`)
        }
      }
    } catch (err) {
      console.error(`Failed to import folder:`, err)
    } finally {
      setImporting(false)
      e.target.value = ""
    }
  }

  async function handleOpenSource(node: FileNode) {
    setSelectedFile(node.path)
    try {
      const content = await readFile(node.path)
      setFileContent(content)
    } catch (err) {
      console.error("Failed to read source:", err)
    }
  }

  async function handleDelete(node: FileNode) {
    if (!project) return
    const pp = normalizePath(project.path)
    const fileName = node.name
    const confirmed = window.confirm(
      t("sources.deleteConfirm", { name: fileName })
    )
    if (!confirmed) return

    try {
      // Step 1: Find related wiki pages before deleting
      const relatedPages = await findRelatedWikiPages(pp, fileName)

      // Step 2: Delete the source file
      await deleteFile(node.path)

      // Step 3: Delete preprocessed cache
      try {
        await deleteFile(`${pp}/raw/sources/.cache/${fileName}.txt`)
      } catch {
        // cache file may not exist
      }

      // Step 4: Delete or update related wiki pages
      // If a page has multiple sources, only remove this filename from sources[]; don't delete the page
      const actuallyDeleted: string[] = []
      for (const pagePath of relatedPages) {
        try {
          const content = await readFile(pagePath)
          // Parse sources from frontmatter
          const sourcesMatch = content.match(/^sources:\s*\[([^\]]*)\]/m)
          if (sourcesMatch) {
            const sourcesList = sourcesMatch[1]
              .split(",")
              .map((s) => s.trim().replace(/["']/g, ""))
              .filter((s) => s.length > 0)

            if (sourcesList.length > 1) {
              // Multiple sources — just remove this file from the list, keep the page
              const updatedSources = sourcesList.filter(
                (s) => s.toLowerCase() !== fileName.toLowerCase()
              )
              const updatedContent = content.replace(
                /^sources:\s*\[([^\]]*)\]/m,
                `sources: [${updatedSources.map((s) => `"${s}"`).join(", ")}]`
              )
              await writeFile(pagePath, updatedContent)
              continue // Don't delete this page
            }
          }

          // Single source or no sources field — delete the page
          await deleteFile(pagePath)
          actuallyDeleted.push(pagePath)
        } catch (err) {
          console.error(`Failed to process wiki page ${pagePath}:`, err)
        }
      }

      // Step 5: Clean index.md — remove entries for actually deleted pages only
      const deletedPageSlugs = actuallyDeleted.map((p) => {
        const name = getFileName(p).replace(".md", "")
        return name
      }).filter(Boolean)

      if (deletedPageSlugs.length > 0) {
        try {
          const indexPath = `${pp}/wiki/index.md`
          const indexContent = await readFile(indexPath)
          const updatedIndex = indexContent
            .split("\n")
            .filter((line) => !deletedPageSlugs.some((slug) => line.toLowerCase().includes(slug.toLowerCase())))
            .join("\n")
          await writeFile(indexPath, updatedIndex)
        } catch {
          // non-critical
        }
      }

      // Step 6: Clean [[wikilinks]] to deleted pages from remaining wiki files
      if (deletedPageSlugs.length > 0) {
        try {
          const wikiTree = await listDirectory(`${pp}/wiki`)
          const allMdFiles = flattenMdFiles(wikiTree)
          for (const file of allMdFiles) {
            try {
              const content = await readFile(file.path)
              let updated = content
              for (const slug of deletedPageSlugs) {
                const linkRegex = new RegExp(`\\[\\[${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\|([^\\]]+))?\\]\\]`, "gi")
                updated = updated.replace(linkRegex, (_match, displayText) => displayText || slug)
              }
              if (updated !== content) {
                await writeFile(file.path, updated)
              }
            } catch {
              // skip
            }
          }
        } catch {
          // non-critical
        }
      }

      // Step 7: Append deletion record to log.md
      try {
        const logPath = `${pp}/wiki/log.md`
        const logContent = await readFile(logPath).catch(() => "# Wiki Log\n")
        const date = new Date().toISOString().slice(0, 10)
        const keptCount = relatedPages.length - actuallyDeleted.length
        const logEntry = `\n## [${date}] delete | ${fileName}\n\nDeleted source file and ${actuallyDeleted.length} wiki pages.${keptCount > 0 ? ` ${keptCount} shared pages kept (have other sources).` : ""}\n`
        await writeFile(logPath, logContent.trimEnd() + logEntry)
      } catch {
        // non-critical
      }

      // Step 8: Refresh everything
      await loadSources()
      const tree = await listDirectory(pp)
      setFileTree(tree)
      useWikiStore.getState().bumpDataVersion()

      // Clear selected file if it was the deleted one
      if (selectedFile === node.path || actuallyDeleted.includes(selectedFile ?? "")) {
        setSelectedFile(null)
      }
    } catch (err) {
      console.error("Failed to delete source:", err)
      window.alert(t("sources.failedToDelete", { err }))
    }
  }

  async function handleIngest(node: FileNode) {
    if (!project || ingestingPath) return
    await triggerServerIngest(node)
  }

  async function handleBatchIngest() {
    if (!project || ingestingPath) return
    const allFiles = flattenAllFiles(sources)
    for (const file of allFiles) {
      // Wait until no ingest is running before starting the next
      await new Promise<void>((resolve) => {
        const check = () => {
          if (!useWikiStore.getState().ingestingPath) { resolve(); return }
          setTimeout(check, 500)
        }
        check()
      })
      if (useWikiStore.getState().ingestingPath) break
      await triggerServerIngest(file)
    }
  }

  return (
    <Stack sx={{ height: 1 }}>
      <input
        type="file"
        ref={fileInputRef}
        multiple
        style={{ display: "none" }}
        onChange={handleFilesSelected}
      />
      <input
        type="file"
        ref={folderInputRef}
        // @ts-expect-error webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        directory=""
        multiple
        style={{ display: "none" }}
        onChange={handleFolderSelected}
      />
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          px: 2,
          py: 1.5,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {t("sources.title")}
        </Typography>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title={t("sources.refresh")} enterDelay={600}>
            <IconButton size="small" onClick={loadSources}>
              <RefreshIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={ingestingPath ? "正在生成中，请稍候" : "重新用 AI 生成所有 Wiki 页面"} enterDelay={ingestingPath ? 0 : 600}>
            <span>
              <IconButton
                size="small"
                disabled={!!ingestingPath}
                onClick={handleBatchIngest}
                sx={{ color: "text.secondary", "&:hover": { color: "#7c3aed", bgcolor: "rgba(124,58,237,0.06)" } }}
              >
                <AutoAwesomeIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Button size="small" variant="contained" onClick={handleImport} disabled={importing} startIcon={<AddIcon sx={{ fontSize: 18 }} />}>
            {importing ? t("sources.importing") : t("sources.import")}
          </Button>
          <Button size="small" variant="contained" onClick={handleImportFolder} disabled={importing} startIcon={<AddIcon sx={{ fontSize: 18 }} />}>
            {t("sources.importFolder")}
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {sources.length === 0 ? (
          <Stack
            sx={{
              alignItems: "center",
              justifyContent: "center",
              gap: 1.5,
              p: 4,
              textAlign: "center",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {t("sources.noSources")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("sources.importHint")}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" size="small" onClick={handleImport} startIcon={<AddIcon />}>
                {t("sources.importFiles")}
              </Button>
              <Button variant="outlined" size="small" onClick={handleImportFolder} startIcon={<AddIcon />}>
                {t("sources.importFolder")}
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Box sx={{ p: 1 }}>
            {/* Banner: show when some files haven't been ingested yet */}
            {(() => {
              const allFiles = flattenAllFiles(sources)
              const notIngested = allFiles.filter((f) => !ingestStatuses[f.path] || ingestStatuses[f.path] === "idle").length
              if (notIngested === 0) return null
              return (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, px: 1.5, py: 1, borderRadius: 1.5, bgcolor: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.18)" }}>
                  <AutoAwesomeIcon sx={{ fontSize: 14, color: "#7c3aed", flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ flex: 1, color: "#5b21b6", lineHeight: 1.4 }}>
                    {notIngested} 个文件尚未生成 Wiki
                  </Typography>
                  <Button
                    size="small"
                    disabled={!!ingestingPath}
                    onClick={handleBatchIngest}
                    sx={{ fontSize: "0.7rem", py: 0.25, px: 1, minHeight: 0, color: "#7c3aed", border: "1px solid rgba(124,58,237,0.3)", "&:hover": { bgcolor: "rgba(124,58,237,0.1)" } }}
                  >
                    全部生成
                  </Button>
                </Box>
              )
            })()}
            <SourceTree
              nodes={sources}
              onOpen={handleOpenSource}
              onIngest={handleIngest}
              onDelete={handleDelete}
              ingestingPath={ingestingPath}
              preprocessStatuses={preprocessStatuses}
              ingestStatuses={ingestStatuses}
              depth={0}
            />
          </Box>
        )}
      </Box>

      <Box sx={{ borderTop: 1, borderColor: "divider", px: 2, py: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {t("sources.sourceCount", { count: countFiles(sources) })}
        </Typography>
      </Box>
    </Stack>
  )
}

/**
 * Generate a unique destination path. If file already exists, adds date/counter suffix.
 * "file.pdf" → "file.pdf" (first time)
 * "file.pdf" → "file-20260406.pdf" (conflict)
 * "file.pdf" → "file-20260406-2.pdf" (second conflict same day)
 */
async function getUniqueDestPath(dir: string, fileName: string): Promise<string> {
  const basePath = `${dir}/${fileName}`

  // Check if file exists by trying to read it
  try {
    await readFile(basePath)
  } catch {
    // File doesn't exist — use original name
    return basePath
  }

  // File exists — add date suffix
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : ""
  const nameWithoutExt = ext ? fileName.slice(0, -ext.length) : fileName
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "")

  const withDate = `${dir}/${nameWithoutExt}-${date}${ext}`
  try {
    await readFile(withDate)
  } catch {
    return withDate
  }

  // Date suffix also exists — add counter
  for (let i = 2; i <= 99; i++) {
    const withCounter = `${dir}/${nameWithoutExt}-${date}-${i}${ext}`
    try {
      await readFile(withCounter)
    } catch {
      return withCounter
    }
  }

  // Shouldn't happen, but fallback
  return `${dir}/${nameWithoutExt}-${date}-${Date.now()}${ext}`
}

function filterTree(nodes: FileNode[]): FileNode[] {
  return nodes
    .filter((n) => !n.name.startsWith(".") && !n.name.endsWith(".cache.txt"))
    .map((n) => {
      if (n.is_dir && n.children) {
        return { ...n, children: filterTree(n.children) }
      }
      return n
    })
    .filter((n) => !n.is_dir || (n.children && n.children.length > 0))
}

function countFiles(nodes: FileNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      count += countFiles(node.children)
    } else if (!node.is_dir) {
      count++
    }
  }
  return count
}

function SourceTree({
  nodes,
  onOpen,
  onIngest,
  onDelete,
  ingestingPath,
  preprocessStatuses,
  ingestStatuses,
  depth,
}: {
  nodes: FileNode[]
  onOpen: (node: FileNode) => void
  onIngest: (node: FileNode) => void
  onDelete: (node: FileNode) => void
  ingestingPath: string | null
  preprocessStatuses: Record<string, PreprocessStatus>
  ingestStatuses: Record<string, IngestStatus>
  depth: number
}) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggle = (path: string) => {
    setCollapsed((prev) => ({ ...prev, [path]: !prev[path] }))
  }

  // Sort: folders first, then files, alphabetical within each group
  // Filter out .cache.txt sidecar files — these are internal artifacts, not user files
  const sorted = [...nodes]
    .filter((n) => !n.path.endsWith(".cache.txt"))
    .sort((a, b) => {
      if (a.is_dir && !b.is_dir) return -1
      if (!a.is_dir && b.is_dir) return 1
      return a.name.localeCompare(b.name)
    })

  return (
    <>
      {sorted.map((node) => {
        if (node.is_dir && node.children) {
          const isCollapsed = collapsed[node.path] ?? false
          // Folder progress: count done/total for preprocess
          const folderFiles = flattenAllFiles(node.children)
          const ppDone = folderFiles.filter((f) => preprocessStatuses[f.path] === "done").length
          const ppProcessing = folderFiles.filter((f) => preprocessStatuses[f.path] === "processing").length
          const ingestDone = folderFiles.filter((f) => ingestStatuses[f.path] === "done").length
          const ingestIngesting = folderFiles.filter((f) => ingestStatuses[f.path] === "ingesting").length
          const total = folderFiles.length
          return (
            <Box key={node.path}>
              <Button
                fullWidth
                onClick={() => toggle(node.path)}
                sx={{
                  justifyContent: "flex-start",
                  gap: 0.75,
                  px: 0.5,
                  py: 0.5,
                  minHeight: 0,
                  textTransform: "none",
                  fontSize: "0.875rem",
                  color: "text.secondary",
                  pl: `${depth * 16 + 4}px`,
                  "&:hover": { bgcolor: "action.hover", color: "text.primary" },
                }}
              >
                {isCollapsed ? (
                  <ChevronRightIcon sx={{ fontSize: 14, flexShrink: 0 }} />
                ) : (
                  <ExpandMoreIcon sx={{ fontSize: 14, flexShrink: 0 }} />
                )}
                <FolderIcon sx={{ fontSize: 18, flexShrink: 0, color: "warning.main" }} />
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0, textAlign: "left" }} noWrap>
                  {t(`folderNames.${node.name}`, { defaultValue: node.name })}
                </Typography>
                {/* Folder progress summary */}
                <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0, alignItems: "center" }}>
                  <Tooltip title={`提取文本：${ppDone}/${total} 完成${ppProcessing > 0 ? `，${ppProcessing} 处理中` : ""}`} enterDelay={600} placement="top">
                    <Typography variant="caption" sx={{ fontSize: "10px", fontWeight: 500, color: ppProcessing > 0 ? "#C2410C" : ppDone === total && total > 0 ? "#65a30d" : "text.secondary", opacity: 0.75, letterSpacing: "0.02em" }}>
                      {ppDone}/{total}
                    </Typography>
                  </Tooltip>
                  <Box sx={{ width: 1, height: 10, borderLeft: 1, borderColor: "divider", opacity: 0.4 }} />
                  <Tooltip title={`Wiki 生成：${ingestDone}/${total} 完成${ingestIngesting > 0 ? `，${ingestIngesting} 生成中` : ""}`} enterDelay={600} placement="top">
                    <Typography variant="caption" sx={{ fontSize: "10px", fontWeight: 500, color: ingestIngesting > 0 ? "#7c3aed" : ingestDone === total && total > 0 ? "#65a30d" : "text.secondary", opacity: 0.75, letterSpacing: "0.02em" }}>
                      {ingestDone}/{total}
                    </Typography>
                  </Tooltip>
                </Stack>
              </Button>
              {!isCollapsed && (
                <SourceTree
                  nodes={node.children}
                  onOpen={onOpen}
                  onIngest={onIngest}
                  onDelete={onDelete}
                  ingestingPath={ingestingPath}
                  preprocessStatuses={preprocessStatuses}
                  ingestStatuses={ingestStatuses}
                  depth={depth + 1}
                />
              )}
            </Box>
          )
        }

        const ppStatus = preprocessStatuses[node.path]
        const ingestStatus = ingestStatuses[node.path]
        const isProcessing = ppStatus === "processing"
        const isIngesting = ingestStatus === "ingesting" || ingestStatus === "interrupted"

        return (
          <Stack
            key={node.path}
            direction="row"
            spacing={0.5}
            sx={{
              width: 1,
              position: "relative",
              alignItems: "center",
              borderRadius: 1,
              px: 0.5,
              py: 0.5,
              pl: `${depth * 16 + 4}px`,
              fontSize: "0.875rem",
              color: "text.secondary",
              transition: (theme) => theme.transitions.create(["background-color", "color"]),
              "&:hover": { bgcolor: "action.hover", color: "text.primary" },
              ...(isProcessing && {
                "&::before": {
                  content: '""',
                  position: "absolute",
                  inset: 0,
                  borderRadius: "inherit",
                  background: "linear-gradient(90deg, transparent 0%, rgba(194,65,12,0.05) 50%, transparent 100%)",
                  backgroundSize: "200% 100%",
                  animation: "preprocess-shimmer 1.6s ease-in-out infinite",
                  pointerEvents: "none",
                },
              }),
            }}
          >
            <Button
              onClick={() => onOpen(node)}
              sx={{
                flex: 1,
                minWidth: 0,
                justifyContent: "flex-start",
                gap: 1,
                px: 1,
                py: 0.5,
                textTransform: "none",
                fontSize: "0.875rem",
                color: "inherit",
              }}
            >
              <DescriptionIcon
                sx={{
                  fontSize: 18,
                  flexShrink: 0,
                  color: isProcessing ? "#C2410C" : "inherit",
                  opacity: isProcessing ? 0.8 : 1,
                  animation: isProcessing ? "preprocess-pulse 1.4s ease-in-out infinite" : "none",
                }}
              />
              <Typography variant="body2" noWrap sx={{ textAlign: "left", flex: 1 }}>
                {node.name}
              </Typography>
            </Button>

            {/* Status indicators: preprocess + ingest */}
            <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0, alignItems: "center", pr: 0.5 }}>
              <Tooltip
                title={ppStatus === "processing" ? "正在提取文本…" : ppStatus === "done" ? "文本已提取" : ppStatus === "error" ? "提取失败" : "待提取"}
                enterDelay={800}
                placement="top"
              >
                <Box component="span" sx={{ display: "flex", alignItems: "center", cursor: "default" }}>
                  <StatusDot status={ppStatus} variant="preprocess" />
                </Box>
              </Tooltip>
              <Tooltip
                title={ingestStatus === "ingesting" ? "正在生成 Wiki…" : ingestStatus === "done" ? "Wiki 已生成" : ingestStatus === "error" ? "Wiki 生成失败" : ingestStatus === "interrupted" ? "刷新中断，正在自动恢复…" : "待生成 Wiki"}
                enterDelay={800}
                placement="top"
              >
                <Box component="span" sx={{ display: "flex", alignItems: "center", cursor: "default" }}>
                  <StatusDot status={ingestStatus} variant="ingest" />
                </Box>
              </Tooltip>
            </Stack>

            {/* Re-generate Wiki button */}
            <Tooltip
              title={
                isIngesting
                  ? "正在生成中，请稍候…"
                  : ingestingPath
                  ? "另一个文件正在生成，请稍候"
                  : "重新生成 Wiki"
              }
              enterDelay={isIngesting || ingestingPath ? 0 : 600}
              placement="top"
            >
              <span>
                <IconButton
                  size="small"
                  disabled={!!ingestingPath && !isIngesting}
                  onClick={() => {
                    if (isIngesting || ingestingPath) return
                    onIngest(node)
                  }}
                  sx={{
                    color: isIngesting ? "#7c3aed" : ingestStatus === "done" ? "#65a30d" : "text.secondary",
                    "&:hover": { color: isIngesting || ingestingPath ? undefined : "#7c3aed", bgcolor: isIngesting || ingestingPath ? undefined : "rgba(124,58,237,0.06)" },
                    cursor: isIngesting ? "not-allowed" : undefined,
                  }}
                >
                  {isIngesting
                    ? <CircularProgress size={14} thickness={5} sx={{ color: "#7c3aed" }} />
                    : <AutoAwesomeIcon sx={{ fontSize: 16 }} />
                  }
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="删除源文件" enterDelay={800} placement="top">
              <IconButton
                size="small"
                onClick={() => onDelete(node)}
                sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}
              >
                <DeleteOutlineOutlinedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        )
      })}
    </>
  )
}

/** Status dot for preprocess or ingest status */
function StatusDot({ status, variant }: { status: PreprocessStatus | IngestStatus | undefined; variant: "preprocess" | "ingest" }) {
  if (!status || status === "idle") {
    // show a dim placeholder dot so the layout is stable
    return (
      <Box component="span" sx={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", bgcolor: "divider", flexShrink: 0, mx: 0.25 }} />
    )
  }

  const colorMap: Record<string, string> = {
    processing: "#C2410C",
    ingesting: "#7c3aed",
    interrupted: "#d97706",
    done: "#65a30d",
    error: "#dc2626",
  }
  const color = colorMap[status] ?? "#aaa"
  const isActive = status === "processing" || status === "ingesting"

  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        width: 5,
        height: 5,
        borderRadius: "50%",
        bgcolor: color,
        flexShrink: 0,
        mx: 0.25,
        opacity: isActive ? 0.9 : 0.6,
        animation: isActive ? "preprocess-dot-pulse 1.4s ease-in-out infinite" : "none",
      }}
    />
  )
}

function flattenAllFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      files.push(...flattenAllFiles(node.children))
    } else if (!node.is_dir && !node.path.endsWith(".cache.txt")) {
      files.push(node)
    }
  }
  return files
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
