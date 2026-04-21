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
import SummarizeIcon from "@mui/icons-material/Summarize"
import MergeIcon from "@mui/icons-material/MergeType"
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
import { getFileCategory, needsVisionIngest } from "@/lib/file-types"
import { supportsVision } from "@/lib/vision-capability"
import { startServerIngest, subscribeIngestSSE, getAllServerTasks, getServerIngestStatus, rebuildWikiSummary, getRebuildSummaryStatus, deduplicateWiki, getDeduplicateStatus } from "@/commands/ingest"
import type { SseCallbacks } from "@/commands/ingest"
import { useActivityStore } from "@/stores/activity-store"

export type PreprocessStatus = "idle" | "processing" | "done" | "error"
export type IngestStatus = "idle" | "ingesting" | "interrupted" | "done" | "error"

// ── Module-level SSE connection registry ─────────────────────────────────────
// Keyed by `${projectId}:${relativePath}` so connections survive Tab switches
// without being tied to React component lifecycle.
interface SseEntry { taskId: string; dispose: () => void }
const _activeSse = new Map<string, SseEntry>()
const MAX_SSE_RECONNECT_ATTEMPTS = 3

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

// Test helper: reset module-level SSE registry between test cases to avoid cross-test leakage.
export function __resetSourcesViewTestState() {
  for (const [, entry] of _activeSse) {
    try { entry.dispose() } catch { /* ignore */ }
  }
  _activeSse.clear()
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
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [preprocessStatuses, setPreprocessStatuses] = useState<Record<string, PreprocessStatus>>({})
  const [rebuildSummaryState, setRebuildSummaryState] = useState<"idle" | "running" | "done" | "error">("idle")
  const rebuildSummaryPollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [deduplicateState, setDeduplicateState] = useState<"idle" | "running" | "done" | "error">("idle")
  const deduplicatePollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    setSourcesLoading(true)
    // Fetch sources list and full tree independently.
    // The full-tree call must NOT clear sources on failure — a transient server
    // error during heavy ingest (e.g. 3 concurrent LLM streams) must not wipe
    // the source list that was already loaded successfully.
    try {
      const tree = await listDirectory(project.id, "raw/sources")
      setSources(filterTree(tree))
    } catch {
      setSources([])
    } finally {
      setSourcesLoading(false)
    }
    try {
      const fullTree = await listDirectory(project.id)
      setFileTree(fullTree)
      useWikiStore.getState().bumpDataVersion()
    } catch {
      // Non-critical: file tree update failure should not affect sources display
    }
  }, [project, setFileTree])

  useEffect(() => {
    loadSources()
  }, [loadSources])

  // Check cache existence only — do NOT auto-trigger preprocessing.
  // Text extraction is initiated manually by the user (via the generate button).
  useEffect(() => {
    if (!sources.length || !project) return
    const allFiles = flattenAllFiles(sources)
    for (const file of allFiles) {
      readFile(project.id, file.relativePath + ".cache.txt")
        .then((content) => {
          const isFallback =
            content.startsWith("[Binary file:") &&
            content.includes("markitdown is not installed")
          setFileStatus(file.relativePath, isFallback ? "idle" : "done")
        })
        .catch(() => {
          const current = preprocessStatuses[file.relativePath]
          if (current !== "processing") setFileStatus(file.relativePath, "idle")
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
          if (current !== "interrupted" && current !== "done" && current !== "ingesting") {
            setIngestStatus(file.relativePath, "idle")
          }
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
      const allServerTasks = await getAllServerTasks()
      if (cancelled) return

      // Only look at tasks that are confirmed running/pending on the server
      const runningByRelPath = new Map(
        allServerTasks
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

        let reconnectAttempts = 0
        const reconnectCallbacks: SseCallbacks = {
          onUpdate: (task) => {
            useWikiStore.getState().setIngestStatus(
              file.relativePath,
              task.status === "running" ? "ingesting"
                : task.status === "done" ? "done"
                : task.status === "error" ? "error"
                : "ingesting",
            )
          },
          onDone: async (task) => {
            clearSse(currentProjectId, file.relativePath)
            useWikiStore.getState().setIngestStatus(
              file.relativePath,
              task.filesWritten.length > 0 ? "done" : "error",
            )
            useWikiStore.getState().setIngestingPath(null)
            useWikiStore.getState().setServerTaskId(file.relativePath, null)
            if (task.filesWritten.length > 0) {
              try {
                const tree = await listDirectory(currentProjectId)
                useWikiStore.getState().setFileTree(tree)
                useWikiStore.getState().bumpDataVersion()
              } catch { /* non-critical */ }
            }
          },
          onError: (_msg) => {
            clearSse(currentProjectId, file.relativePath)
            useWikiStore.getState().setIngestStatus(file.relativePath, "interrupted")
            useWikiStore.getState().setIngestingPath(null)
            useWikiStore.getState().setServerTaskId(file.relativePath, null)
          },
          onConnectionLost: async () => {
            clearSse(currentProjectId, file.relativePath)
            useWikiStore.getState().setIngestingPath(null)
            useWikiStore.getState().setServerTaskId(file.relativePath, null)

            const serverTask = await getServerIngestStatus(serverTaskId).catch(() => null)

            if (serverTask?.status === "done") {
              useWikiStore.getState().setIngestStatus(
                file.relativePath,
                serverTask.filesWritten.length > 0 ? "done" : "error",
              )
              if (serverTask.filesWritten.length > 0) {
                try {
                  const tree = await listDirectory(currentProjectId)
                  useWikiStore.getState().setFileTree(tree)
                  useWikiStore.getState().bumpDataVersion()
                } catch { /* non-critical */ }
              }
              return
            }

            if (serverTask?.status === "error") {
              useWikiStore.getState().setIngestStatus(file.relativePath, "error")
              return
            }

            if (
              (serverTask?.status === "running" || serverTask?.status === "pending") &&
              reconnectAttempts < MAX_SSE_RECONNECT_ATTEMPTS
            ) {
              reconnectAttempts += 1
              useWikiStore.getState().setIngestStatus(file.relativePath, "ingesting")
              useWikiStore.getState().setIngestingPath(file.relativePath)
              useWikiStore.getState().setServerTaskId(file.relativePath, serverTaskId)
              const disposeFunc = subscribeIngestSSE(serverTaskId, reconnectCallbacks)
              registerSse(currentProjectId, file.relativePath, serverTaskId, disposeFunc)
              return
            }

            useWikiStore.getState().setIngestStatus(file.relativePath, "interrupted")
          },
        }

        const disposeFunc = subscribeIngestSSE(serverTaskId, reconnectCallbacks)

        registerSse(currentProjectId, file.relativePath, serverTaskId, disposeFunc)
      }

      // NOTE: Intentionally no auto-retry here.
      // Auto-retrying interrupted files on every component mount caused a new task
      // to be created each time the user navigated to the Sources tab, because
      // reconnectRanRef resets on unmount/remount. Interrupted files are left for
      // the user to manually regenerate via the "重新生成" button.
      // (Files whose wiki page already exists are handled by the wiki-check effect
      //  above, which sets their status to "done" automatically.)
    })()

    return () => {
      cancelled = true
      // Do NOT close SSE connections or reset reconnectRanRef here.
      // SSE connections live at module level and survive Tab switches.
      // reconnectRanRef is reset only on project change (above).
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, project])

  // Reconcile stale running activity items with the file-level ingest status shown in Sources.
  // This keeps the left activity panel consistent with the right status dots when terminal
  // states are reached via reconnect/recovery flows.
  useEffect(() => {
    if (!project || !sources.length) return

    const fileNamesByPath = new Map(
      flattenAllFiles(sources).map((file) => [file.relativePath, file.name]),
    )
    const activity = useActivityStore.getState()

    for (const [relativePath, ingestStatus] of Object.entries(ingestStatuses)) {
      if (!["done", "error", "interrupted"].includes(ingestStatus)) continue
      if (serverTaskIds[relativePath]) continue

      const fileName = fileNamesByPath.get(relativePath)
      if (!fileName) continue

      const staleItems = activity.items.filter((item) => {
        if (item.type !== "ingest" || item.status !== "running") return false
        if (item.projectId !== project.id) return false
        if (item.sourcePath) return item.sourcePath === relativePath
        // Backward compatibility: old persisted items might not have sourcePath.
        return item.title === fileName
      })
      if (staleItems.length === 0) continue

      for (const staleItem of staleItems) {
        if (ingestStatus === "done") {
          activity.updateItem(staleItem.id, { status: "done" })
        } else if (ingestStatus === "error") {
          activity.updateItem(staleItem.id, { status: "error" })
        } else {
          activity.updateItem(staleItem.id, {
            status: "error",
            detail: "连接中断，可手动重新生成",
          })
        }
      }
    }
  }, [ingestStatuses, project, serverTaskIds, sources])

  // ── Core: start a server-side ingest task ─────────────────────────────────
  async function triggerServerIngest(node: FileNode, folderContext = "", force = false) {
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
    // Guard: stored server task ID (persists across page refresh via wiki store).
    // If the reconnect effect confirmed a task is still running on the server,
    // or a task was started in this session and not yet finished, skip to avoid
    // creating duplicate activity items and duplicate server tasks.
    if (store.serverTaskIds[node.relativePath]) {
      console.log(`[ingest] skip – server task already running: ${node.name}`)
      return
    }

    const projectId = project.id
    const activity = useActivityStore.getState()
    useWikiStore.getState().setIngestingPath(node.relativePath)
    useWikiStore.getState().setIngestStatus(node.relativePath, "ingesting")

    const activityId = activity.addItem({
      type: "ingest",
      projectId,
      sourcePath: node.relativePath,
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
        force,
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

    // Named callbacks object so onConnectionLost can re-subscribe with the same handlers.
    let reconnectAttempts = 0
    const callbacks: SseCallbacks = {
      onUpdate: (task) => {
        useWikiStore.getState().setIngestStatus(
          node.relativePath,
          task.status === "running" ? "ingesting"
            : task.status === "done" ? "done"
            : task.status === "error" ? "error"
            : "ingesting",
        )
        // For terminal states arriving via type:"state" (reconnect to already-finished
        // task), mirror the full update so the activity icon reflects the real status.
        if (task.status === "done" || task.status === "error") {
          activity.updateItem(activityId, {
            status: task.status === "done"
              ? (task.filesWritten.length > 0 ? "done" : "error")
              : "error",
            detail: task.filesWritten.length > 0
              ? `${task.filesWritten.length} files written`
              : (task.error ?? task.detail ?? "No files generated"),
            filesWritten: task.filesWritten,
          })
        } else {
          activity.updateItem(activityId, { detail: task.detail })
        }
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
      onConnectionLost: async () => {
        clearSse(projectId, node.relativePath)
        useWikiStore.getState().setIngestingPath(null)
        useWikiStore.getState().setServerTaskId(node.relativePath, null)

        // Query server before declaring failure.
        const serverTask = await getServerIngestStatus(taskId).catch(() => null)

        if (serverTask?.status === "done") {
          const currentProject = useWikiStore.getState().project
          useWikiStore.getState().setIngestStatus(
            node.relativePath,
            serverTask.filesWritten.length > 0 ? "done" : "error",
          )
          activity.updateItem(activityId, {
            status: serverTask.filesWritten.length > 0 ? "done" : "error",
            detail: serverTask.filesWritten.length > 0
              ? `${serverTask.filesWritten.length} files written`
              : (serverTask.error ?? "No files generated"),
            filesWritten: serverTask.filesWritten,
          })
          if (serverTask.filesWritten.length > 0 && currentProject) {
            try {
              const tree = await listDirectory(currentProject.id)
              setFileTree(tree)
              useWikiStore.getState().bumpDataVersion()
            } catch { /* non-critical */ }
          }
          return
        }

        if (serverTask?.status === "error") {
          useWikiStore.getState().setIngestStatus(node.relativePath, "error")
          activity.updateItem(activityId, {
            status: "error",
            detail: serverTask.error ?? serverTask.detail ?? "任务失败",
          })
          return
        }

        // Task still running/pending — reconnect once.
        if (
          (serverTask?.status === "running" || serverTask?.status === "pending") &&
          reconnectAttempts < MAX_SSE_RECONNECT_ATTEMPTS
        ) {
          reconnectAttempts += 1
          useWikiStore.getState().setIngestStatus(node.relativePath, "ingesting")
          useWikiStore.getState().setIngestingPath(node.relativePath)
          useWikiStore.getState().setServerTaskId(node.relativePath, taskId)
          activity.updateItem(activityId, { detail: serverTask.detail })
          const disposeFunc = subscribeIngestSSE(taskId, callbacks)
          registerSse(projectId, node.relativePath, taskId, disposeFunc)
          return
        }

        // Task not found on server or already reconnected once — truly interrupted.
        useWikiStore.getState().setIngestStatus(node.relativePath, "interrupted")
        activity.updateItem(activityId, { status: "error", detail: "连接中断，可手动重新生成" })
      },
    }

    const disposeFunc = subscribeIngestSSE(taskId, callbacks)
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

      await uploadFiles(project.id, "raw/sources", formData)
      await loadSources()
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

      await uploadFiles(project.id, destDir, formData)
      await loadSources()
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

    // If text hasn't been extracted yet, run preprocessing first
    const ppStatus = preprocessStatuses[node.relativePath]
    if (ppStatus !== "done") {
      setFileStatus(node.relativePath, "processing")
      try {
        await preprocessFile(project.id, node.relativePath, (stage: PreprocessStage) => {
          if (stage === "done" || stage === "cached") setFileStatus(node.relativePath, "done")
          else if (stage === "error") setFileStatus(node.relativePath, "error")
        })
      } catch {
        setFileStatus(node.relativePath, "error")
        return
      }
    }

    await triggerServerIngest(node, "", true)
  }

  async function handleBatchIngest() {
    const allFiles = flattenAllFiles(sources)
    for (const file of allFiles) {
      const status = useWikiStore.getState().ingestStatuses[file.relativePath]
      const hasLiveTask = !!useWikiStore.getState().serverTaskIds[file.relativePath]
      if (status === "ingesting" || hasLiveTask) continue

      // Preprocess first if text hasn't been extracted yet
      const ppStatus = preprocessStatuses[file.relativePath]
      if (ppStatus !== "done") {
        setFileStatus(file.relativePath, "processing")
        try {
          await preprocessFile(project.id, file.relativePath, (stage: PreprocessStage) => {
            if (stage === "done" || stage === "cached") setFileStatus(file.relativePath, "done")
            else if (stage === "error") setFileStatus(file.relativePath, "error")
          })
        } catch {
          setFileStatus(file.relativePath, "error")
          continue
        }
      }

      await triggerServerIngest(file, "", true)
      await new Promise<void>((resolve) => setTimeout(resolve, 200))
    }
  }

  async function handleRebuildSummary() {
    if (!project || rebuildSummaryState === "running") return
    setRebuildSummaryState("running")

    try {
      const taskId = await rebuildWikiSummary(project.id)

      const poll = async () => {
        const task = await getRebuildSummaryStatus(taskId)
        if (!task || task.status === "running" || task.status === "pending") {
          rebuildSummaryPollRef.current = setTimeout(() => { void poll() }, 1500)
          return
        }
        setRebuildSummaryState(task.status === "done" ? "done" : "error")
        if (task.status === "done") {
          try {
            const tree = await listDirectory(project.id)
            setFileTree(tree)
            useWikiStore.getState().bumpDataVersion()
          } catch { /* non-critical */ }
        }
      }
      void poll()
    } catch {
      setRebuildSummaryState("error")
    }
  }

  async function handleDeduplicate() {
    if (!project || deduplicateState === "running") return
    setDeduplicateState("running")

    try {
      const taskId = await deduplicateWiki(project.id)

      const poll = async () => {
        const task = await getDeduplicateStatus(taskId)
        if (!task || task.status === "running" || task.status === "pending") {
          deduplicatePollRef.current = setTimeout(() => { void poll() }, 1500)
          return
        }
        setDeduplicateState(task.status === "done" ? "done" : "error")
        if (task.status === "done") {
          try {
            const tree = await listDirectory(project.id)
            setFileTree(tree)
            useWikiStore.getState().bumpDataVersion()
          } catch { /* non-critical */ }
        }
      }
      void poll()
    } catch {
      setDeduplicateState("error")
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
            title={
              rebuildSummaryState === "running" ? "正在重建中，请稍候…"
                : rebuildSummaryState === "done" ? "重建完成"
                : rebuildSummaryState === "error" ? "重建失败，点击重试"
                : "用 AI 重建 Wiki 摘要（index 和 overview）"
            }
            enterDelay={rebuildSummaryState === "running" ? 0 : 600}
          >
            <span>
              <Button
                size="small"
                disabled={rebuildSummaryState === "running"}
                onClick={handleRebuildSummary}
                startIcon={
                  rebuildSummaryState === "running"
                    ? <CircularProgress size={14} thickness={5} sx={{ color: "inherit" }} />
                    : <SummarizeIcon sx={{ fontSize: 16 }} />
                }
                sx={{
                  fontSize: "0.75rem",
                  color: rebuildSummaryState === "done" ? "#65a30d"
                    : rebuildSummaryState === "error" ? "error.main"
                    : "text.secondary",
                  border: "1px solid",
                  borderColor: rebuildSummaryState === "done" ? "rgba(101,163,13,0.4)"
                    : rebuildSummaryState === "error" ? "error.light"
                    : "divider",
                  "&:hover": { bgcolor: "rgba(124,58,237,0.06)", color: "#7c3aed", borderColor: "rgba(124,58,237,0.3)" },
                }}
              >
                重建摘要
              </Button>
            </span>
          </Tooltip>
          <Tooltip
            title={
              deduplicateState === "running" ? "正在去重中，请稍候…"
                : deduplicateState === "done" ? "去重完成"
                : deduplicateState === "error" ? "去重失败，点击重试"
                : "用 AI 识别并合并重复/近义词条"
            }
            enterDelay={deduplicateState === "running" ? 0 : 600}
          >
            <span>
              <Button
                size="small"
                disabled={deduplicateState === "running"}
                onClick={handleDeduplicate}
                startIcon={
                  deduplicateState === "running"
                    ? <CircularProgress size={14} thickness={5} sx={{ color: "inherit" }} />
                    : <MergeIcon sx={{ fontSize: 16 }} />
                }
                sx={{
                  fontSize: "0.75rem",
                  color: deduplicateState === "done" ? "#65a30d"
                    : deduplicateState === "error" ? "error.main"
                    : "text.secondary",
                  border: "1px solid",
                  borderColor: deduplicateState === "done" ? "rgba(101,163,13,0.4)"
                    : deduplicateState === "error" ? "error.light"
                    : "divider",
                  "&:hover": { bgcolor: "rgba(124,58,237,0.06)", color: "#7c3aed", borderColor: "rgba(124,58,237,0.3)" },
                }}
              >
                去重词条
              </Button>
            </span>
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
        {sourcesLoading ? (
          <Stack sx={{ alignItems: "center", justifyContent: "center", p: 4 }}>
            <CircularProgress size={24} />
          </Stack>
        ) : sources.length === 0 ? (
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
                <FolderIcon sx={{ fontSize: 18, flexShrink: 0, color: "primary.main" }} />
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
                        color: ppProcessing > 0 ? "#2383E2"
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
        const fileNeedsVision = needsVisionIngest(getFileCategory(node.relativePath))
        const llmCfg = useWikiStore.getState().llmConfig
        const visionSupported = !fileNeedsVision || (!!llmCfg && supportsVision(llmCfg.provider, llmCfg.model ?? ""))

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
                  color: isProcessing ? "#2383E2" : "inherit",
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
              title={
                isIngesting ? "正在生成中，请稍候…"
                  : !visionSupported ? "当前模型不支持视觉识别，图片文件将被忽略。请切换到支持视觉的模型（如 gpt-4o、claude-3）后重试。"
                  : "提取文本并生成 Wiki"
              }
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
                      : !visionSupported ? "#d97706"
                      : ingestStatus === "done" ? "#65a30d"
                      : "text.secondary",
                    "&:hover": {
                      color: canIngest && visionSupported ? "#7c3aed" : canIngest ? "#d97706" : undefined,
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
    processing: "#2383E2",
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
