import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { LintView } from "../lint/lint-view"
import { useWikiStore } from "@/stores/wiki-store"
import { runStructuralLint, runSemanticLint } from "@/lib/lint"

vi.mock("@/lib/lint", () => ({
  runStructuralLint: vi.fn().mockResolvedValue([]),
  runSemanticLint: vi.fn().mockResolvedValue([]),
}))

describe("LintView", () => {
  beforeEach(() => {
    useWikiStore.setState({
      project: { name: "P", path: "/proj" },
      fileTree: [],
      selectedFile: null,
      fileContent: "",
      activeView: "lint",
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
    vi.mocked(runStructuralLint).mockResolvedValue([])
    vi.mocked(runSemanticLint).mockResolvedValue([])
  })

  it("renders run lint button", () => {
    render(<LintView />)
    expect(screen.getByText("lint.runLint")).toBeTruthy()
  })

  it("no project disables run", () => {
    useWikiStore.setState({ project: null } as any)
    render(<LintView />)
    const runBtn = screen.getByText("lint.runLint").closest("button")
    expect(runBtn).toBeDisabled()
  })

  it("shows results after lint run", async () => {
    vi.mocked(runStructuralLint).mockResolvedValue([
      {
        type: "orphan",
        severity: "warning",
        page: "lonely.md",
        detail: "No inbound links",
      },
    ])
    render(<LintView />)
    fireEvent.click(screen.getByText("lint.runLint"))
    await waitFor(() => {
      expect(screen.getByText("lonely.md")).toBeTruthy()
    })
    expect(screen.getByText(/lint\.warnings/)).toBeTruthy()
  })
})
