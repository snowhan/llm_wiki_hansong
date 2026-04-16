import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { PreviewPanel } from "../layout/preview-panel"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile } from "@/commands/fs"

vi.mock("../editor/wiki-editor", () => ({
  WikiEditor: ({ content }: { content: string }) => (
    <div data-testid="wiki-editor">{content}</div>
  ),
}))

vi.mock("../editor/file-preview", () => ({
  FilePreview: ({ filePath }: { filePath: string }) => (
    <div data-testid="file-preview">{filePath}</div>
  ),
}))

describe("PreviewPanel", () => {
  beforeEach(() => {
    useWikiStore.setState({
      project: { name: "P", path: "/p" },
      fileTree: [],
      selectedFile: null,
      fileContent: "",
      activeView: "wiki",
      chatExpanded: false,
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
    vi.mocked(readFile).mockReset()
  })

  it("no selection shows placeholder", () => {
    render(<PreviewPanel />)
    expect(screen.getByText("preview.selectFile")).toBeTruthy()
  })

  it("selected markdown file shows wiki editor", async () => {
    useWikiStore.setState({
      selectedFile: "/p/wiki/notes/hello.md",
    } as any)
    vi.mocked(readFile).mockResolvedValue("# Hello")
    render(<PreviewPanel />)
    await waitFor(() => {
      expect(screen.getByTestId("wiki-editor")).toBeTruthy()
    })
    expect(screen.getByTestId("wiki-editor")).toHaveTextContent("# Hello")
  })

  it("close button clears selection", async () => {
    useWikiStore.setState({
      selectedFile: "/p/wiki/notes/hello.md",
    } as any)
    vi.mocked(readFile).mockResolvedValue("# Hello")
    render(<PreviewPanel />)
    await waitFor(() => {
      expect(screen.getByTestId("wiki-editor")).toBeTruthy()
    })
    const closeBtn = screen.getByRole("button", { name: "Close" })
    fireEvent.click(closeBtn)
    expect(useWikiStore.getState().selectedFile).toBeNull()
  })
})
