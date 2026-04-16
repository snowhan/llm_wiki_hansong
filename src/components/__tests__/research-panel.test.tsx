import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ResearchPanel } from "../layout/research-panel"
import { useWikiStore } from "@/stores/wiki-store"
import { useResearchStore } from "@/stores/research-store"
import { queueResearch } from "@/lib/deep-research"

vi.mock("@/lib/deep-research", () => ({
  queueResearch: vi.fn().mockReturnValue("task-1"),
}))

vi.mock("../ui/markdown-view", () => ({
  MarkdownView: ({ markdown }: { markdown: string }) => (
    <div data-testid="markdown-view">{markdown}</div>
  ),
}))

describe("ResearchPanel", () => {
  beforeEach(() => {
    useWikiStore.setState({
      project: { name: "P", path: "/proj" },
      fileTree: [],
      selectedFile: null,
      fileContent: "",
      activeView: "wiki",
      chatExpanded: false,
      dataVersion: 0,
      llmConfig: {
        provider: "openai",
        apiKey: "x",
        model: "m",
        ollamaUrl: "http://localhost:11434",
        customEndpoint: "",
        maxContextSize: 204800,
      },
      searchApiConfig: { provider: "tavily", apiKey: "sk" },
      embeddingConfig: { enabled: false, endpoint: "", apiKey: "", model: "" },
    } as any)
    useResearchStore.setState({ tasks: [], panelOpen: true })
    vi.mocked(queueResearch).mockReturnValue("task-1" as any)
  })

  it("renders topic input", () => {
    render(<ResearchPanel />)
    expect(screen.getByPlaceholderText("research.enterTopic")).toBeTruthy()
  })

  it("shows empty state when no tasks", () => {
    render(<ResearchPanel />)
    expect(screen.getByText("research.noTasks")).toBeTruthy()
  })

  it("shows alert when search not configured", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {})
    useWikiStore.setState({
      searchApiConfig: { provider: "none", apiKey: "" },
    } as any)
    render(<ResearchPanel />)
    const input = screen.getByPlaceholderText("research.enterTopic")
    fireEvent.change(input, { target: { value: "Topic A" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(alertSpy).toHaveBeenCalledWith("research.webSearchNotConfigured")
    alertSpy.mockRestore()
  })
})
