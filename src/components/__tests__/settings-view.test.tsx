import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { SettingsView } from "../settings/settings-view"
import { useWikiStore } from "@/stores/wiki-store"
import { useChatStore } from "@/stores/chat-store"
import * as projectStore from "@/lib/project-store"

vi.mock("@/lib/project-store", () => ({
  saveLanguage: vi.fn(() => Promise.resolve()),
  saveLlmConfig: vi.fn(() => Promise.resolve()),
  saveSearchApiConfig: vi.fn(() => Promise.resolve()),
  saveEmbeddingConfig: vi.fn(() => Promise.resolve()),
}))

beforeEach(() => {
  useWikiStore.setState({
    project: null,
    fileTree: [],
    selectedFile: null,
    fileContent: "",
    chatExpanded: false,
    activeView: "settings",
    dataVersion: 0,
    llmConfig: {
      provider: "openai",
      apiKey: "",
      model: "gpt-4o",
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
  vi.mocked(projectStore.saveLlmConfig).mockClear()
  vi.mocked(projectStore.saveSearchApiConfig).mockClear()
  vi.mocked(projectStore.saveEmbeddingConfig).mockClear()
})

describe("SettingsView", () => {
  it("renders provider selection", () => {
    render(<SettingsView />)
    expect(screen.getByText("settings.llmProvider")).toBeTruthy()
    expect(screen.getByText("settings.provider")).toBeTruthy()
    expect(screen.getByText("OpenAI")).toBeTruthy()
  })

  it("renders save control", () => {
    render(<SettingsView />)
    expect(screen.getByText("settings.save")).toBeTruthy()
  })

  it("updates visible provider choice when another provider is selected", async () => {
    render(<SettingsView />)
    fireEvent.click(screen.getByRole("button", { name: "Anthropic" }))
    await waitFor(() => {
      expect(screen.getByText("claude-sonnet-4-5-20250514")).toBeTruthy()
    })
  })
})
