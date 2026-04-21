import { writeFile, readFile, createDirectory } from "@/commands/fs"
import type { DisplayMessage, Conversation } from "@/stores/chat-store"

async function ensureDir(projectId: string): Promise<void> {
  await createDirectory(projectId, ".llm-wiki").catch(() => {})
  await createDirectory(projectId, ".llm-wiki/chats").catch(() => {})
}

interface PersistedChatData {
  conversations: Conversation[]
  messages: DisplayMessage[]
}

export async function saveChatHistory(
  projectId: string,
  conversations: Conversation[],
  messages: DisplayMessage[],
): Promise<void> {
  await ensureDir(projectId)

  await writeFile(
    projectId,
    ".llm-wiki/conversations.json",
    JSON.stringify(conversations, null, 2),
  )

  const byConversation = new Map<string, DisplayMessage[]>()
  for (const msg of messages) {
    const list = byConversation.get(msg.conversationId) ?? []
    list.push(msg)
    byConversation.set(msg.conversationId, list)
  }

  for (const [convId, msgs] of byConversation) {
    const toSave = msgs.slice(-100)
    await writeFile(
      projectId,
      `.llm-wiki/chats/${convId}.json`,
      JSON.stringify(toSave, null, 2),
    )
  }
}

export async function loadChatHistory(projectId: string): Promise<PersistedChatData> {
  try {
    const convContent = await readFile(projectId, ".llm-wiki/conversations.json")
    const conversations = JSON.parse(convContent) as Conversation[]

    const allMessages: DisplayMessage[] = []
    for (const conv of conversations) {
      try {
        const msgContent = await readFile(projectId, `.llm-wiki/chats/${conv.id}.json`)
        const msgs = JSON.parse(msgContent) as DisplayMessage[]
        allMessages.push(...msgs)
      } catch {
        // Conversation file missing, skip
      }
    }

    return { conversations, messages: allMessages }
  } catch {
    return { conversations: [], messages: [] }
  }
}
