import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { act } from "react"
import { ChatPanel } from "../chat/chat-panel"
import { useWikiStore } from "@/stores/wiki-store"
import { useChatStore } from "@/stores/chat-store"
import { streamChat } from "@/lib/llm-client"
import { searchWiki } from "@/lib/search"

vi.mock("../chat/chat-message", () => ({
  ChatMessage: ({ message }: { message: { id: string; role: string; content: string } }) => (
    <div data-testid={`chat-msg-${message.role}`}>{message.content}</div>
  ),
  StreamingMessage: ({ content }: { content: string }) => (
    <div data-testid="streaming-msg">{content}</div>
  ),
  useSourceFiles: () => [],
}))

vi.mock("../chat/chat-input", () => ({
  ChatInput: ({ placeholder }: { placeholder?: string }) => (
    <input data-testid="chat-input" placeholder={placeholder ?? ""} readOnly />
  ),
}))

vi.mock("@/lib/llm-client", () => ({
  streamChat: vi.fn(),
}))

vi.mock("@/lib/search", () => ({
  searchWiki: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/lib/detect-language", () => ({
  detectLanguage: vi.fn().mockReturnValue("en"),
}))

vi.mock("@/lib/graph-relevance", () => ({
  buildRetrievalGraph: vi.fn().mockResolvedValue(null),
  getRelatedNodes: vi.fn().mockReturnValue([]),
}))

beforeEach(() => {
  vi.clearAllMocks()
  useWikiStore.setState({
    project: null,
    fileTree: [],
    selectedFile: null,
    fileContent: "",
    chatExpanded: false,
    activeView: "wiki",
    dataVersion: 0,
    llmConfig: {
      provider: "openai",
      apiKey: "",
      model: "",
      ollamaUrl: "http://localhost:11434",
      customEndpoint: "",
      maxContextSize: 204800,
    },
    searchApiConfig: { provider: "none", apiKey: "" },
    embeddingConfig: { enabled: false, endpoint: "", apiKey: "", model: "" },
  } as any)
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    messages: [],
    isStreaming: false,
    streamingContent: "",
    mode: "chat",
    ingestSource: null,
    maxHistoryMessages: 10,
  } as any)
  vi.mocked(streamChat).mockImplementation(async (_cfg, _msgs, handlers) => {
    handlers.onDone?.()
  })
  vi.mocked(searchWiki).mockResolvedValue([])
})

describe("ChatPanel", () => {
  it("renders empty state with input", () => {
    render(<ChatPanel />)
    expect(screen.getByText("chat.startConversation")).toBeInTheDocument()
    expect(screen.getByTestId("chat-input")).toBeInTheDocument()
  })

  it("shows conversations in the sidebar", () => {
    useChatStore.setState({
      conversations: [
        { id: "conv-1", title: "Alpha thread", createdAt: 1, updatedAt: 2 },
      ],
      activeConversationId: "conv-1",
      messages: [],
    } as any)

    render(<ChatPanel />)

    expect(screen.getByText("Alpha thread")).toBeInTheDocument()
  })

  it("creates a conversation when New chat is clicked", async () => {
    render(<ChatPanel />)

    await act(async () => {
      fireEvent.click(screen.getByText("chat.newChat"))
    })

    await waitFor(() => {
      expect(useChatStore.getState().activeConversationId).not.toBeNull()
    })
    expect(useChatStore.getState().conversations.length).toBeGreaterThan(0)
  })
})
