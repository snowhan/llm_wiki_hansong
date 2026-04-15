import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { SearchView } from "../search/search-view"
import { useWikiStore } from "@/stores/wiki-store"
import { searchWiki } from "@/lib/search"

vi.mock("@/lib/search", () => ({
  searchWiki: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(searchWiki).mockReset()
  useWikiStore.setState({
    project: { name: "W", path: "/projects/wiki" },
    fileTree: [],
    selectedFile: null,
    fileContent: "",
    chatExpanded: false,
    activeView: "search",
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
})

describe("SearchView", () => {
  it("renders search input", () => {
    render(<SearchView />)
    expect(screen.getByRole("textbox")).toBeTruthy()
  })

  it("shows empty state before first search", () => {
    render(<SearchView />)
    expect(screen.getByText("Press Enter to search")).toBeTruthy()
  })

  it("runs search on Enter via searchWiki", async () => {
    vi.mocked(searchWiki).mockResolvedValue([])
    render(<SearchView />)
    const input = screen.getByRole("textbox")
    fireEvent.change(input, { target: { value: "hello" } })
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => {
      expect(searchWiki).toHaveBeenCalled()
    })
    expect(searchWiki).toHaveBeenCalledWith(expect.any(String), "hello")
  })
})
