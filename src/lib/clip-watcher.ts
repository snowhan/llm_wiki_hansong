import { useWikiStore } from "@/stores/wiki-store"
import { autoIngest } from "./ingest"
import { listDirectory } from "@/commands/fs"

const POLL_INTERVAL = 3000
let intervalId: ReturnType<typeof setInterval> | null = null

/**
 * Start polling the backend clip service for new web clips.
 * When a clip is detected, triggers auto-ingest and refreshes the file tree.
 */
export function startClipWatcher() {
  if (intervalId) return

  intervalId = setInterval(async () => {
    try {
      const res = await fetch("/api/clip/status", { method: "GET" })
      const data = await res.json()

      if (!data.ok || !data.clips || data.clips.length === 0) return

      const store = useWikiStore.getState()
      const project = store.project

      for (const clip of data.clips) {
        const clipProjectPath: string = clip.projectPath
        const clipFilePath: string = clip.filePath

        if (project && clipProjectPath === project.path) {
          try {
            const tree = await listDirectory(project.path)
            store.setFileTree(tree)
          } catch {
            // ignore
          }

          const llmConfig = store.llmConfig
          if (llmConfig.apiKey || llmConfig.provider === "ollama" || llmConfig.provider === "wps") {
            autoIngest(clipProjectPath, clipFilePath, llmConfig).catch((err) => {
              console.error("Failed to auto-ingest web clip:", err)
            })
          }
        }
      }
    } catch {
      // Server not running or network error
    }
  }, POLL_INTERVAL)
}

export function stopClipWatcher() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
