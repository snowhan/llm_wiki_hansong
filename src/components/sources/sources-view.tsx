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
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome"
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined"
import FolderIcon from "@mui/icons-material/Folder"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import { useWikiStore } from "@/stores/wiki-store"
import {
  listDirectory,
  readFile,
  writeFile,
  deleteFile,
  findRelatedWikiPages,
  preprocessFile,
  uploadFiles,
} from "@/commands/fs"
import type { PreprocessStage } from "@/commands/fs"
import type { FileNode } from "@/types/wiki"
import { useTranslation } from "react-i18next"
import { getFileName, getFileStem } from "@/lib/path-utils"
import { startServerIngest, subscribeIngestSSE, getAllServerTasks } from "@/commands/ingest"
import { useActivityStore } from "@/stores/activity-store"

export type PreprocessStatus = "idle" | "processing" | "done" | "error"
export type IngestStatus = "idle" | "ingesting" | "interrupted" | "done" | "error"

// ── Module-level SSE connection registry ─────────────────────────────────────
// Keyed by `${projectId}:${relativePath}` so connections survive Tab switches
// without being tied to React component lifecycle.
interface SseEntry { taskId: string; dispose: () => void }
const _activeSse = new Map<string, SseEntry>()

function sseKey(projectId: string, relativePath: string) {
  return `${projectId}:${relativePath}`
}

function hasSseConnection(projectId: string, relativePath: string, taskId?: string): boolean {
  const e = _activeSse.get(sseKey(projectId, relativePath))
  return taskId ? e?.taskId === taskId : !!e
}

function registerSse(projectId: string, relativePath: string, taskId: string, dispose: () => void) {
  const key = sseKey(projectId, relativePath)
  const existing = _activeSse.get(key)
  if (existing && existing.taskId !== taskId) {
    try { existing.dispose() } catch { /* ignore */ }
  }
  _activeSse.set(key, { taskId, dispose })
}

function clearSse(projectId: string, relativePath: string) {
  _activeSse.delete(sseKey(projectId, relativePath))
}

function clearAllSseForProject(projectId: string) {
  for (const [key, entry] of _activeSse) {
    if (key.startsWith(`${projectId}:`)) {
      try { entry.dispose() } catch { /* ignore */ }
      _activeSse.delete(key)
    }
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export function SourcesView() {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const setFileTree = useWikiStore((s) => s.setFileTree)
  const ingestingPath = useWikiStore((s) => s.ingestingPath)
  const ingestStatuses = useWikiStore((s) => s.ingestStatuses)
  const setIngestStatus = useWikiStore((s) => s.setIngestStatus)
  const serverTaskIds = useWikiStore((s) => s.serverTaskIds)
  const [sources, setSources] = useState<FileNode[]>([])
  const [importing, setImporting] = useState(false)
  const [preprocessStatuses, setPreprocessStatuses] = useState<Record<string, PreprocessStatus>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const reconnectRanRef = useRef(false)
  // Track the project ID we last ran reconnect for, so we reset on project switch
  const reconnectProjectRef = useRef<string | null>(null)

  const setFileStatus = useCallback((relativePath: string, status: PreprocessStatus) => {
    setPreprocessStatuses((prev) => ({ ...prev, [relativePath]: status }))
  }, [])

  const loadSources = useCallback(async () => {
    if (!project) return
    try {
      const tree = await listDirectory(project.id, "raw/sources")
      const filtered = filterTree(tree)
      setSources(filtered)
      const fullTree = await listDirectory(project.id)
      setFileTree(fullTree)
      useWikiStore.getState().bumpDataVersion()
    } catch {
      setSources([])
    }
  }, [project, setFileTree])

  useEffect(() => {
    loadSources()
  }, [loadSources])

  // Check cache existence and auto-trigger preprocessing for new files
  useEffect(() => {
    if (!sources.length || !project) return
    const allFiles = flattenAllFiles(sources)
    for (const file of allFiles) {
      readFile(project.id, file.relativePath + ".cache.txt")
        .then(() => setFileStatus(file.relativePath, "done"))
        .catch(() => {
          setFileStatus(file.relativePath, "processing")
          preprocessFile(project.id, file.relativePath, (stage) => {
            if (stage === "done" || stage === "cached") setFileStatus(file.relativePath, "done")
            else if (stage === "error") setFileStatus(file.relativePath, "error")
          }).catch(() => setFileStatus(file.relativePath, "error"))
        })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources])

  // Check wiki ingest status for all source files on load
  useEffect(() => {
    if (!sources.length || !project) return
    const allFiles = flattenAllFiles(sources)
    for (const file of allFiles) {
      const stem = getFileStem(file.name)
      readFile(project.id, `wiki/sources/${stem}.md`)
        .then(() => setIngestStatus(file.relativePath, "done"))
        .catch(() => {
          const current = useWikiStore.getState().ingestStatuses[file.relativePath]
          if (current !== "interrupted") setIngestStatus(file.relativePath, "idle")
        })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources])

  // ── Reconnect to running server tasks on mount ────────────────────────────
  useEffect(() => {
    if (!sources.length || !project) return

    // Reset reconnect flag when project changes (not on Tab switch)
    if (reconnectProjectRef.current !== project.id) {
      if (reconnectProjectRef.current !== null) {
        clearAllSseForProject(reconnectProjectRef.current)
      }
      reconnectRanRef.current = false
      reconnectProjectRef.current = project.id
    }

    if (reconnectRanRef.current) return
    reconnectRanRef.current = true

    let cancelled = false
    const currentProjectId = project.id
    const allFiles = flattenAllFiles(sources)

    ;(async () => {
      const runningServerTasks = await getAllServerTasks()
      if (cancelled) return

      // Only look at tasks that are confirmed running/pending on the server
      const runningByRelPath = new Map(
        runningServerTasks
          .filter((t) => t.status === "running" || t.status === "pending")
          .map((t) => [t.sourcePath, t.id]),
      )

      for (const file of allFiles) {
        if (cancelled) break

        // Clear stale serverTaskIds — tasks that are no longer running on server
        const storedTaskId = useWikiStore.getState().serverTaskIds[file.relativePath]
        if (storedTaskId && !runningByRelPath.get(file.relativePath)) {
          useWikiStore.getState().setServerTaskId(file.relativePath, null)
        }

        // Only subscribe to tasks confirmed running on the server
        const serverTaskId = runningByRelPath.get(file.relativePath)
        if (!serverTaskId) continue

        // Skip if we already have an active SSE connection for this exact task
        if (hasSseConnection(currentProjectId, file.relativePath, serverTaskId)) continue

        useWikiStore.getState().setIngestStatus(file.relativePath, "ingesting")
        useWikiStore.getState().setIngestingPath(file.relativePath)
        useWikiStore.getState().setServerTaskId(file.relativePath, serverTaskId)

        const actId = useActivityStore.getState().addItem({
          type: "ingest",
          title: getFileName(file.relativePath),
          status: "running",
          detail: "Reconnecting...",
          filesWritten: [],
        })

        const disposeFunc = subscribeIngestSSE(serverTaskId, {
          onUpdate: (task) => {
            useWikiStore.getState().setIngestStatus(
              file.relativePath,
              task.status === "running" ? "ingesting"
                : task.status === "done" ? "done"
                : task.status === "error" ? "error"
                : "ingesting",
            )
            useActivityStore.getState().updateItem(actId, { detail: task.detail })
          },
          onDone: async (task) => {
            clearSse(currentProjectId, file.relativePath)
            useWikiStore.getState().setIngestStatus(
              file.relativePath,
              task.filesWritten.length > 0 ? "done" : "error",
            )
            useWikiStore.getState().setIngestingPath(null)
            useWikiStore.getState().setServerTaskId(file.relativePath, null)
            useActivityStore.getState().updateItem(actId, {
              status: task.filesWritten.length > 0 ? "done" : "error",
              detail: task.filesWritten.length > 0
                ? `${task.filesWritten.length} files written`
                : (task.error ?? "No files generated"),
              filesWritten: task.filesWritten,
            })
            if (task.filesWritten.length > 0) {
              try {
                const tree = await listDirectory(currentProjectId)
                useWikiStore.getState().setFileTree(tree)
                useWikiStore.getState().bumpDataVersion()
              } catch { /* non-critical */ }
            }
          },
          onError: (msg) => {
            clearSse(currentProjectId, file.relativePath)
            useWikiStore.getState().setIngestStatus(file.relativePath, "interrupted")
            useWikiStore.getState().setIngestingPath(null)
            useWikiStore.getState().setServerTaskId(file.relativePath, null)
            const displayMsg = msg === "SSE connection error" ? "连接中断，可手动重新生成" : msg
            useActivityStore.getState().updateItem(actId, { status: "error", detail: displayMsg })
          },
        })

        registerSse(currentProjectId, file.relativePath, serverTaskId, disposeFunc)
      }

      // Auto-retry files that were interrupted (and not currently running/reconnecting)
      // Only retry if the wiki output file does NOT already exist.
      if (!cancelled) {
        const interruptedFiles = allFiles.filter((f) => {
          const status = useWikiStore.getState().ingestStatuses[f.relativePath]
          return (
            status === "interrupted" &&
            !runningByRelPath.has(f.relativePath) &&
            !hasSseConnection(currentProjectId, f.relativePath)
          )
        })

        for (const file of interruptedFiles) {
          if (cancelled) break
          // Skip retry if the wiki output already exists — just mark as done
          const stem = getFileStem(file.name)
          try {
            await readFile(currentProjectId, `wiki/sources/${stem}.md`)
            useWikiStore.getState().setIngestStatus(file.relativePath, "done")
          } catch {
            // Wiki doesn't exist yet — retry generation
            await triggerServerIngest(file)
          }
        }
      }
    })()

    return () => {
      cancelled = true
      // Do NOT close SSE connections or reset reconnectRanRef here.
      // SSE connections live at module level and survive Tab switches.
      // reconnectRanRef is reset only on project change (above).
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, project])

  // ── Core: start a server-side ingest task ─────────────────────────────────
  async function triggerServerIngest(node: FileNode, folderContext = "") {
    if (!project) return

    const store = useWikiStore.getState()
    const currentStatus = store.ingestStatuses[node.relativePath]

    // Guard: already ingesting in this session
    if (currentStatus === "ingesting") {
      console.log(`[ingest] skip – already ingesting: ${node.name}`)
      return
    }
    // Guard: already have a live SSE connection for this file
    if (hasSseConnection(project.id, node.relativePath)) {
      console.log(`[ingest] skip – live SSE connection exists: ${node.name}`)
      return
    }

    const projectId = project.id
    const activity = useActivityStore.getState()
    useWikiStore.getState().setIngestingPath(node.relativePath)
    useWikiStore.getState().setIngestStatus(node.relativePath, "ingesting")

    const activityId = activity.addItem({
      type: "ingest",
      title: node.name,
      status: "running",
      detail: "Starting...",
      filesWritten: [],
    })

    let taskId: string
    try {
      taskId = await startServerIngest({
        projectId,
        sourcePath: node.relativePath,
        folderContext,
      })
    } catch (err) {
      console.error("[SourcesView] Failed to start server ingest:", err)
      useWikiStore.getState().setIngestStatus(node.relativePath, "error")
      useWikiStore.getState().setIngestingPath(null)
      activity.updateItem(activityId, {
        status: "error",
        detail: `Failed to start: ${err instanceof Error ? err.message : String(err)}`,
      })
      return
    }

    // If server returned the same taskId as an existing running task (server-side dedup)
    // and we already have a live SSE for it, just update the stored taskId and return.
    if (hasSseConnection(projectId, node.relativePath, taskId)) {
      useWikiStore.getState().setServerTaskId(node.relativePath, taskId)
      activity.updateItem(activityId, { status: "running", detail: "Task already running (reconnected)" })
      return
    }

    useWikiStore.getState().setServerTaskId(node.relativePath, taskId)

    const disposeFunc = subscribeIngestSSE(taskId, {
      onUpdate: (task) => {
        useWikiStore.getState().setIngestStatus(
          node.relativePath,
          task.status === "running" ? "ingesting"
            : task.status === "done" ? "done"
            : task.status === "error" ? "error"
            : "ingesting",
        )
        activity.updateItem(activityId, { detail: task.detail })
      },
      onDone: async (task) => {
        clearSse(projectId, node.relativePath)
        const currentProject = useWikiStore.getState().project
        useWikiStore.getState().setIngestStatus(
          node.relativePath,
          task.filesWritten.length > 0 ? "done" : "error",
        )
        useWikiStore.getState().setIngestingPath(null)
        useWikiStore.getState().setServerTaskId(node.relativePath, null)
        activity.updateItem(activityId, {
          status: task.filesWritten.length > 0 ? "done" : "error",
          detail: task.filesWritten.length > 0
            ? `${task.filesWritten.length} files written`
            : (task.error ?? "No files generated"),
          filesWritten: task.filesWritten,
        })
        if (task.filesWritten.length > 0 && currentProject) {
          try {
            const tree = await listDirectory(currentProject.id)
            setFileTree(tree)
            useWikiStore.getState().bumpDataVersion()
          } catch { /* non-critical */ }
        }
      },
      onError: (msg) => {
        clearSse(projectId, node.relativePath)
        useWikiStore.getState().setIngestStatus(node.relativePath, "interrupted")
        useWikiStore.getState().setIngestingPath(null)
        useWikiStore.getState().setServerTaskId(node.relativePath, null)
        const displayMsg = msg === "SSE connection error" ? "连接中断，可手动重新生成" : msg
        activity.updateItem(activityId, { status: "error", detail: displayMsg })
      },
    })

    registerSse(projectId, node.relativePath, taskId, disposeFunc)
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (!project || !e.target.files?.length) return

    setImporting(true)
    try {
      const formData = new FormData()
      for (const file of Array.from(e.target.files)) {
        formData.append("files", file)
      }

      const { paths: importedRelPaths } = await uploadFiles(
        project.id,
        "raw/sources",
        formData,
      )

      for (const relPath of importedRelPaths) {
        setFileStatus(relPath, "processing")
        preprocessFile(project.id, relPath, (stage: PreprocessStage) => {
          if (stage === "done" || stage === "cached") setFileStatus(relPath, "done")
          else if (stage === "error") setFileStatus(relPath, "error")
        }).catch(() => setFileStatus(relPath, "error"))
      }

      await loadSources()

      for (const relPath of importedRelPaths) {
        const node: FileNode = {
          name: getFileName(relPath),
          relativePath: relPath,
          is_dir: false,
        }
        triggerServerIngest(node).catch((err) =>
          console.error("Failed to start server ingest:", err)
        )
      }
    } catch (err) {
      console.error("Failed to import files:", err)
    } finally {
      setImporting(false)
      e.target.value = ""
    }
  }

  async function handleFolderSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (!project || !e.target.files?.length) return

    setImporting(true)
    const files = Array.from(e.target.files)
    const firstRelPath = files[0]?.webkitRelativePath ?? ""
    const folderName = firstRelPath.split("/")[0] || "imported"
    const destDir = `raw/sources/${folderName}`

    try {
      const formData = new FormData()
      for (const file of files) {
        const relativePath = file.webkitRelativePath || file.name
        const pathWithinFolder = relativePath.split("/").slice(1).join("/") || file.name
        formData.append("files", file, pathWithinFolder)
      }

      const { paths: copiedRelPaths } = await uploadFiles(project.id, destDir, formData)

      for (const relPath of copiedRelPaths) {
        setFileStatus(relPath, "processing")
        preprocessFile(project.id, relPath, (stage: PreprocessStage) => {
          if (stage === "done" || stage === "cached") setFileStatus(relPath, "done")
          else if (stage === "error") setFileStatus(relPath, "error")
        }).catch(() => setFileStatus(relPath, "error"))
      }

      await loadSources()

      const ingestablePaths = copiedRelPaths.filter((rp) => {
        const ext = rp.split(".").pop()?.toLowerCase() ?? ""
        return ["md", "mdx", "txt", "pdf", "docx", "pptx", "xlsx", "xls",
                "csv", "json", "html", "htm", "rtf", "xml", "yaml", "yml"].includes(ext)
      })

      for (const relPath of ingestablePaths) {
        const parts = relPath.replace(`${destDir}/`, "").split("/")
        parts.pop()
        const context = parts.length > 0
          ? `${folderName} > ${parts.join(" > ")}`
          : folderName
        const node: FileNode = {
          name: getFileName(relPath),
          relativePath: relPath,
          is_dir: false,
        }
        triggerServerIngest(node, context).catch((err) =>
          console.error("Failed to start server ingest:", err)
        )
      }
    } catch (err) {
      console.error("Failed to import folder:", err)
    } finally {
      setImporting(false)
      e.target.value = ""
    }
  }

  async function handleOpenSource(node: FileNode) {
    if (!project) return
    useWikiStore.getState().navigateInCurrentTab(node.relativePath, node.name)
  }

  async function handleDelete(node: FileNode) {
    if (!project) return
    const fileName = node.name
    const confirmed = window.confirm(t("sources.deleteConfirm", { name: fileName }))
    if (!confirmed) return

    try {
      const relatedPages = await findRelatedWikiPages(project.id, fileName)
      await deleteFile(project.id, node.relativePath)

      // Try to delete the cache file
      try {
        await deleteFile(project.id, `raw/sources/.cache/${fileName}.txt`)
      } catch { /* cache may not exist */ }

      const actuallyDeleted: string[] = []
      for (const pagePath of relatedPages) {
        try {
          const content = await readFile(project.id, pagePath)
          const sourcesMatch = content.match(/^sources:\s*\[([^\]]*)\]/m)
          if (sourcesMatch) {
            const sourcesList = sourcesMatch[1]
              .split(",")
              .map((s) => s.trim().replace(/["']/g, ""))
              .filter((s) => s.length > 0)

            if (sourcesList.length > 1) {
              const updatedSources = sourcesList.filter(
                (s) => s.toLowerCase() !== fileName.toLowerCase(),
              )
              const updatedContent = content.replace(
                /^sources:\s*\[([^\]]*)\]/m,
                `sources: [${updatedSources.map((s) => `"${s}"`).join(", ")}]`,
              )
              await writeFile(project.id, pagePath, updatedContent)
              continue
            }
          }

          await deleteFile(project.id, pagePath)
          actuallyDeleted.push(pagePath)
        } catch (err) {
          console.error(`Failed to process wiki page ${pagePath}:`, err)
        }
      }

      const deletedPageSlugs = actuallyDeleted.map((p) =>
        getFileName(p).replace(".md", ""),
      ).filter(Boolean)

      if (deletedPageSlugs.length > 0) {
        try {
          const indexContent = await readFile(project.id, "wiki/index.md")
          const updatedIndex = indexContent
            .split("\n")
            .filter((line) =>
              !deletedPageSlugs.some((slug) =>
                line.toLowerCase().includes(slug.toLowerCase()),
              ),
            )
            .join("\n")
          await writeFile(project.id, "wiki/index.md", updatedIndex)
        } catch { /* non-critical */ }
      }

      if (deletedPageSlugs.length > 0) {
        try {
          const wikiTree = await listDirectory(project.id, "wiki")
          const allMdFiles = flattenMdFiles(wikiTree)
          for (const file of allMdFiles) {
            try {
              const content = await readFile(project.id, file.relativePath)
              let updated = content
              for (const slug of deletedPageSlugs) {
                const linkRegex = new RegExp(
                  `\\[\\[${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\|([^\\]]+))?\\]\\]`,
                  "gi",
                )
                updated = updated.replace(linkRegex, (_match, displayText: string | undefined) =>
                  displayText ?? slug,
                )
              }
              if (updated !== content) {
                await writeFile(project.id, file.relativePath, updated)
              }
            } catch { /* skip */ }
          }
        } catch { /* non-critical */ }
      }

      try {
        const logContent = await readFile(project.id, "wiki/log.md").catch(() => "# Wiki Log\n")
        const date = new Date().toISOString().slice(0, 10)
        const keptCount = relatedPages.length - actuallyDeleted.length
        const logEntry =
          `\n## [${date}] delete | ${fileName}\n\n` +
          `Deleted source file and ${actuallyDeleted.length} wiki pages.` +
          (keptCount > 0 ? ` ${keptCount} shared pages kept.` : "") + "\n"
        await writeFile(project.id, "wiki/log.md", logContent.trimEnd() + logEntry)
      } catch { /* non-critical */ }

      await loadSources()
      const tree = await listDirectory(project.id)
      setFileTree(tree)
      useWikiStore.getState().bumpDataVersion()

      const selectedFile = useWikiStore.getState().selectedFile
      if (selectedFile === node.relativePath || actuallyDeleted.includes(selectedFile ?? "")) {
        useWikiStore.getState().setSelectedFile(null)
      }
    } catch (err) {
      console.error("Failed to delete source:", err)
      window.alert(t("sources.failedToDelete", { err }))
    }
  }

  async function handleIngest(node: FileNode) {
    if (!project) return
    const status = ingestStatuses[node.relativePath]
    const hasLiveTask = !!serverTaskIds[node.relativePath]
    if (status === "ingesting" || hasLiveTask) return
    await triggerServerIngest(node)
  }

  async function handleBatchIngest() {
    if (!project) return
    const allFiles = flattenAllFiles(sources)
    for (const file of allFiles) {
      const status = useWikiStore.getState().ingestStatuses[file.relativePath]
      const hasLiveTask = !!useWikiStore.getState().serverTaskIds[file.relativePath]
      if (status === "ingesting" || hasLiveTask) continue
      await triggerServerIngest(file)
      await new Promise<void>((resolve) => setTimeout(resolve, 200))
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
        // @ts-expect-error webkitdirectory is non-standard
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
          <Tooltip
            title={ingestingPath ? "正在生成中，请稍候" : "重新用 AI 生成所有 Wiki 页面"}
            enterDelay={ingestingPath ? 0 : 600}
          >
            <span>
              <IconButton
                size="small"
                onClick={handleBatchIngest}
                sx={{
                  color: "text.secondary",
                  "&:hover": { color: "#7c3aed", bgcolor: "rgba(124,58,237,0.06)" },
                }}
              >
                <AutoAwesomeIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Button
            size="small"
            variant="contained"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
          >
            {importing ? t("sources.importing") : t("sources.import")}
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={() => folderInputRef.current?.click()}
            disabled={importing}
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
          >
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
              <Button
                variant="outlined"
                size="small"
                onClick={() => fileInputRef.current?.click()}
                startIcon={<AddIcon />}
              >
                {t("sources.importFiles")}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => folderInputRef.current?.click()}
                startIcon={<AddIcon />}
              >
                {t("sources.importFolder")}
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Box sx={{ p: 1 }}>
            {(() => {
              const allFiles = flattenAllFiles(sources)
              const notIngested = allFiles.filter((f) => {
                const s = ingestStatuses[f.relativePath]
                return !s || s === "idle"
              }).length
              const canTrigger = allFiles.filter((f) => {
                const s = ingestStatuses[f.relativePath]
                const hasTask = !!serverTaskIds[f.relativePath]
                return (!s || s === "idle") && !hasTask
              }).length
              if (notIngested === 0) return null
              return (
                <Box sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mb: 1,
                  px: 1.5,
                  py: 1,
                  borderRadius: 1.5,
                  bgcolor: "rgba(124,58,237,0.06)",
                  border: "1px solid rgba(124,58,237,0.18)",
                }}>
                  <AutoAwesomeIcon sx={{ fontSize: 14, color: "#7c3aed", flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ flex: 1, color: "#5b21b6", lineHeight: 1.4 }}>
                    {notIngested} 个文件尚未生成 Wiki
                  </Typography>
                  <Button
                    size="small"
                    disabled={canTrigger === 0}
                    onClick={handleBatchIngest}
                    sx={{
                      fontSize: "0.7rem",
                      py: 0.25,
                      px: 1,
                      minHeight: 0,
                      color: "#7c3aed",
                      border: "1px solid rgba(124,58,237,0.3)",
                      "&:hover": { bgcolor: "rgba(124,58,237,0.1)" },
                    }}
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
              serverTaskIds={serverTaskIds}
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
    if (node.is_dir && node.children) count += countFiles(node.children)
    else if (!node.is_dir) count++
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
  serverTaskIds,
  depth,
}: {
  nodes: FileNode[]
  onOpen: (node: FileNode) => void
  onIngest: (node: FileNode) => void
  onDelete: (node: FileNode) => void
  ingestingPath: string | null
  preprocessStatuses: Record<string, PreprocessStatus>
  ingestStatuses: Record<string, IngestStatus>
  serverTaskIds: Record<string, string>
  depth: number
}) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggle = (relativePath: string) => {
    setCollapsed((prev) => ({ ...prev, [relativePath]: !prev[relativePath] }))
  }

  const sorted = [...nodes]
    .filter((n) => !n.relativePath.endsWith(".cache.txt"))
    .sort((a, b) => {
      if (a.is_dir && !b.is_dir) return -1
      if (!a.is_dir && b.is_dir) return 1
      return a.name.localeCompare(b.name)
    })

  return (
    <>
      {sorted.map((node) => {
        if (node.is_dir && node.children) {
          const isCollapsed = collapsed[node.relativePath] ?? false
          const folderFiles = flattenAllFiles(node.children)
          const ppDone = folderFiles.filter((f) => preprocessStatuses[f.relativePath] === "done").length
          const ppProcessing = folderFiles.filter((f) => preprocessStatuses[f.relativePath] === "processing").length
          const ingestDone = folderFiles.filter((f) => ingestStatuses[f.relativePath] === "done").length
          const ingestIngesting = folderFiles.filter((f) => ingestStatuses[f.relativePath] === "ingesting").length
          const total = folderFiles.length
          return (
            <Box key={node.relativePath}>
              <Button
                fullWidth
                onClick={() => toggle(node.relativePath)}
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
                <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0, alignItems: "center" }}>
                  <Tooltip
                    title={`提取文本：${ppDone}/${total} 完成${ppProcessing > 0 ? `，${ppProcessing} 处理中` : ""}`}
                    enterDelay={600}
                    placement="top"
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: "10px",
                        fontWeight: 500,
                        color: ppProcessing > 0 ? "#C2410C"
                          : ppDone === total && total > 0 ? "#65a30d"
                          : "text.secondary",
                        opacity: 0.75,
                      }}
                    >
                      {ppDone}/{total}
                    </Typography>
                  </Tooltip>
                  <Box sx={{ width: 1, height: 10, borderLeft: 1, borderColor: "divider", opacity: 0.4 }} />
                  <Tooltip
                    title={`Wiki 生成：${ingestDone}/${total} 完成${ingestIngesting > 0 ? `，${ingestIngesting} 生成中` : ""}`}
                    enterDelay={600}
                    placement="top"
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: "10px",
                        fontWeight: 500,
                        color: ingestIngesting > 0 ? "#7c3aed"
                          : ingestDone === total && total > 0 ? "#65a30d"
                          : "text.secondary",
                        opacity: 0.75,
                      }}
                    >
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
                  serverTaskIds={serverTaskIds}
                  depth={depth + 1}
                />
              )}
            </Box>
          )
        }

        const ppStatus = preprocessStatuses[node.relativePath]
        const ingestStatus = ingestStatuses[node.relativePath]
        const isProcessing = ppStatus === "processing"
        const isIngesting = ingestStatus === "ingesting" || !!serverTaskIds[node.relativePath]
        const canIngest = !isIngesting

        return (
          <Stack
            key={node.relativePath}
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
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(194,65,12,0.05) 50%, transparent 100%)",
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

            <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0, alignItems: "center", pr: 0.5 }}>
              <Tooltip
                title={
                  ppStatus === "processing" ? "正在提取文本…"
                    : ppStatus === "done" ? "文本已提取"
                    : ppStatus === "error" ? "提取失败"
                    : "待提取"
                }
                enterDelay={800}
                placement="top"
              >
                <Box component="span" sx={{ display: "flex", alignItems: "center", cursor: "default" }}>
                  <StatusDot status={ppStatus} />
                </Box>
              </Tooltip>
              <Tooltip
                title={
                  ingestStatus === "ingesting" ? "正在生成 Wiki…"
                    : ingestStatus === "done" ? "Wiki 已生成"
                    : ingestStatus === "error" ? "Wiki 生成失败"
                    : ingestStatus === "interrupted" ? "刷新中断，正在自动恢复…"
                    : "待生成 Wiki"
                }
                enterDelay={800}
                placement="top"
              >
                <Box component="span" sx={{ display: "flex", alignItems: "center", cursor: "default" }}>
                  <StatusDot status={ingestStatus} />
                </Box>
              </Tooltip>
            </Stack>

            <Tooltip
              title={isIngesting ? "正在生成中，请稍候…" : "重新生成 Wiki"}
              enterDelay={isIngesting ? 0 : 600}
              placement="top"
            >
              <span>
                <IconButton
                  size="small"
                  disabled={!canIngest}
                  onClick={() => { if (canIngest) onIngest(node) }}
                  sx={{
                    color: isIngesting ? "#7c3aed"
                      : ingestStatus === "done" ? "#65a30d"
                      : "text.secondary",
                    "&:hover": {
                      color: canIngest ? "#7c3aed" : undefined,
                      bgcolor: canIngest ? "rgba(124,58,237,0.06)" : undefined,
                    },
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

function StatusDot({ status }: { status: PreprocessStatus | IngestStatus | undefined }) {
  if (!status || status === "idle") {
    return (
      <Box
        component="span"
        sx={{
          display: "inline-block",
          width: 5,
          height: 5,
          borderRadius: "50%",
          bgcolor: "divider",
          flexShrink: 0,
          mx: 0.25,
        }}
      />
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
    } else if (!node.is_dir && !node.relativePath.endsWith(".cache.txt")) {
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
