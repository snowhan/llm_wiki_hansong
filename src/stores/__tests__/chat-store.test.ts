import { describe, it, expect, beforeEach } from "vitest"
import { useChatStore, chatMessagesToLLM } from "../chat-store"

beforeEach(() => {
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    messages: [],
    isStreaming: false,
    streamingContent: "",
    mode: "chat",
    ingestSource: null,
    maxHistoryMessages: 10,
  })
})

describe("useChatStore", () => {
  it("has correct initial state", () => {
    const s = useChatStore.getState()
    expect(s.conversations).toEqual([])
    expect(s.activeConversationId).toBeNull()
    expect(s.messages).toEqual([])
    expect(s.isStreaming).toBe(false)
    expect(s.mode).toBe("chat")
  })

  describe("createConversation", () => {
    it("creates a new conversation and sets it active", () => {
      const id = useChatStore.getState().createConversation()
      const s = useChatStore.getState()
      expect(s.conversations).toHaveLength(1)
      expect(s.activeConversationId).toBe(id)
      expect(s.conversations[0].id).toBe(id)
    })

    it("prepends new conversations", () => {
      const id1 = useChatStore.getState().createConversation()
      const id2 = useChatStore.getState().createConversation()
      expect(useChatStore.getState().conversations[0].id).toBe(id2)
      expect(useChatStore.getState().conversations[1].id).toBe(id1)
    })
  })

  describe("deleteConversation", () => {
    it("removes conversation and its messages", () => {
      const id = useChatStore.getState().createConversation()
      useChatStore.getState().addMessage("user", "hello")
      useChatStore.getState().deleteConversation(id)
      expect(useChatStore.getState().conversations).toHaveLength(0)
      expect(useChatStore.getState().messages).toHaveLength(0)
    })

    it("switches active to next conversation", () => {
      const id1 = useChatStore.getState().createConversation()
      const id2 = useChatStore.getState().createConversation()
      useChatStore.getState().setActiveConversation(id2)
      useChatStore.getState().deleteConversation(id2)
      expect(useChatStore.getState().activeConversationId).toBe(id1)
    })
  })

  describe("addMessage", () => {
    it("adds message to active conversation", () => {
      useChatStore.getState().createConversation()
      useChatStore.getState().addMessage("user", "test")
      const msgs = useChatStore.getState().messages
      expect(msgs).toHaveLength(1)
      expect(msgs[0].content).toBe("test")
      expect(msgs[0].role).toBe("user")
    })

    it("does nothing without active conversation", () => {
      useChatStore.getState().addMessage("user", "test")
      expect(useChatStore.getState().messages).toHaveLength(0)
    })

    it("auto-sets title from first user message", () => {
      const id = useChatStore.getState().createConversation()
      useChatStore.getState().addMessage("user", "What is machine learning?")
      const conv = useChatStore.getState().conversations.find((c) => c.id === id)
      expect(conv?.title).toBe("What is machine learning?")
    })
  })

  describe("streaming", () => {
    it("appendStreamToken accumulates content", () => {
      useChatStore.getState().setStreaming(true)
      useChatStore.getState().appendStreamToken("hel")
      useChatStore.getState().appendStreamToken("lo")
      expect(useChatStore.getState().streamingContent).toBe("hello")
    })

    it("finalizeStream adds assistant message and resets", () => {
      const id = useChatStore.getState().createConversation()
      useChatStore.getState().setStreaming(true)
      useChatStore.getState().finalizeStream("Full response", [{ title: "Ref", path: "/ref.md" }])
      const s = useChatStore.getState()
      expect(s.isStreaming).toBe(false)
      expect(s.streamingContent).toBe("")
      expect(s.messages).toHaveLength(1)
      expect(s.messages[0].role).toBe("assistant")
      expect(s.messages[0].references).toHaveLength(1)
    })
  })

  describe("renameConversation", () => {
    it("updates conversation title", () => {
      const id = useChatStore.getState().createConversation()
      useChatStore.getState().renameConversation(id, "New Title")
      expect(useChatStore.getState().conversations[0].title).toBe("New Title")
    })
  })

  describe("clearMessages", () => {
    it("removes messages of active conversation only", () => {
      const id1 = useChatStore.getState().createConversation()
      useChatStore.getState().addMessage("user", "msg1")
      const id2 = useChatStore.getState().createConversation()
      useChatStore.getState().addMessage("user", "msg2")

      useChatStore.getState().setActiveConversation(id2)
      useChatStore.getState().clearMessages()

      const remaining = useChatStore.getState().messages
      expect(remaining.every((m) => m.conversationId === id1)).toBe(true)
    })
  })

  describe("removeLastAssistantMessage", () => {
    it("removes the last assistant message", () => {
      useChatStore.getState().createConversation()
      useChatStore.getState().addMessage("user", "q")
      useChatStore.getState().addMessage("assistant", "a1")
      useChatStore.getState().addMessage("assistant", "a2")
      useChatStore.getState().removeLastAssistantMessage()
      const msgs = useChatStore.getState().messages
      expect(msgs.filter((m) => m.role === "assistant")).toHaveLength(1)
      expect(msgs.find((m) => m.role === "assistant")?.content).toBe("a1")
    })
  })

  describe("getActiveMessages", () => {
    it("returns only active conversation messages", () => {
      const id1 = useChatStore.getState().createConversation()
      useChatStore.getState().addMessage("user", "msg1")
      useChatStore.getState().createConversation()
      useChatStore.getState().addMessage("user", "msg2")

      useChatStore.getState().setActiveConversation(id1)
      const active = useChatStore.getState().getActiveMessages()
      expect(active).toHaveLength(1)
      expect(active[0].content).toBe("msg1")
    })

    it("returns empty when no active conversation", () => {
      useChatStore.getState().setActiveConversation(null)
      expect(useChatStore.getState().getActiveMessages()).toEqual([])
    })
  })

  describe("mode and ingestSource", () => {
    it("switches mode", () => {
      useChatStore.getState().setMode("ingest")
      expect(useChatStore.getState().mode).toBe("ingest")
    })

    it("sets ingest source", () => {
      useChatStore.getState().setIngestSource("/path/to/file.pdf")
      expect(useChatStore.getState().ingestSource).toBe("/path/to/file.pdf")
    })
  })
})

describe("chatMessagesToLLM", () => {
  it("maps display messages to LLM format", () => {
    const messages = [
      { id: "1", role: "user" as const, content: "hi", timestamp: 1, conversationId: "c1" },
      { id: "2", role: "assistant" as const, content: "hello", timestamp: 2, conversationId: "c1" },
    ]
    const result = chatMessagesToLLM(messages)
    expect(result).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ])
  })
})
