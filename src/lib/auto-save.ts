import { useChatStore } from "@/stores/chat-store"
import { useWikiStore } from "@/stores/wiki-store"
import { useAuthStore } from "@/stores/auth-store"
import { saveChatHistory } from "./persist"

let chatTimer: ReturnType<typeof setTimeout> | null = null

export function setupAutoSave(): () => void {
  // Auto-save chat conversations and messages (debounced 2s, skip during streaming)
  const unsubChat = useChatStore.subscribe((state) => {
    if (state.isStreaming) return
    if (chatTimer) clearTimeout(chatTimer)
    chatTimer = setTimeout(() => {
      if (!useAuthStore.getState().user) return
      const project = useWikiStore.getState().project
      if (project) {
        saveChatHistory(project.id, state.conversations, state.messages).catch(() => {})
      }
    }, 2000)
  })

  return () => {
    unsubChat()
    if (chatTimer) { clearTimeout(chatTimer); chatTimer = null }
  }
}
