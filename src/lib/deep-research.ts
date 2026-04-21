import { startServerResearch } from "@/commands/research"
import { useResearchStore } from "@/stores/research-store"
import type { LlmConfig, SearchApiConfig } from "@/stores/wiki-store"

/**
 * Queue a deep research task on the server.
 * The server runs web search + LLM synthesis + file write — tasks survive
 * browser close/refresh.
 *
 * This function:
 *  1. Adds an optimistic task to the local research store for immediate UI feedback
 *  2. Opens the research panel
 *  3. Calls the server API asynchronously
 *  4. Updates the local task with the server-assigned ID so SSE can be connected
 */
export function queueResearch(
  projectId: string,
  topic: string,
  _llmConfig: LlmConfig,        // kept for API compatibility; server reads config from its state
  _searchConfig: SearchApiConfig, // kept for API compatibility; server reads config from its state
  searchQueries?: string[],
): string {
  const store = useResearchStore.getState()
  const localId = store.addTask(topic)
  if (searchQueries && searchQueries.length > 0) {
    store.updateTask(localId, { searchQueries })
  }
  store.setPanelOpen(true)

  setTimeout(() => {
    startServerResearch({ projectId, topic, searchQueries })
      .then((serverTaskId) => {
        useResearchStore.getState().setServerTaskId(localId, serverTaskId)
      })
      .catch((err) => {
        useResearchStore.getState().updateTask(localId, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }, 50)

  return localId
}
