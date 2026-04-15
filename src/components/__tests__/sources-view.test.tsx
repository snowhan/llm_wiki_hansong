import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { SourcesView } from "../sources/sources-view"
import { useWikiStore } from "@/stores/wiki-store"
import { listDirectory } from "@/commands/fs"
vi.mock("@/lib/ingest-queue", () => ({
  enqueueIngest: vi.fn(),
  enqueueBatch: vi.fn(),
}))

vi.mock("@/lib/ingest", () => ({
  startIngest: vi.fn(),
}))

vi.mock("@/commands/fs", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  listDirectory: vi.fn(),
  createDirectory: vi.fn(),
  exists: vi.fn(),
  rename: vi.fn(),
  copyFile: vi.fn(),
  preprocessFile: vi.fn().mockResolvedValue("content"),
  findRelatedWikiPages: vi.fn().mockResolvedValue([]),
}))

beforeEach(() => {
  vi.clearAllMocks()
  useWikiStore.setState({
    project: null,
    fileTree: [],
    selectedFile: null,
    fileContent: "",
    chatExpanded: false,
    activeView: "sources",
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
  vi.mocked(listDirectory).mockResolvedValue([])
})

describe("SourcesView", () => {
  it("does not load sources when there is no project", async () => {
    render(<SourcesView />)
    await waitFor(() => {
      expect(listDirectory).not.toHaveBeenCalled()
    })
  })

  it("shows import hint when sources are empty", async () => {
    useWikiStore.setState({ project: { name: "P", path: "/data/proj" } } as any)
    vi.mocked(listDirectory).mockResolvedValue([])

    render(<SourcesView />)

    await waitFor(() => {
      expect(screen.getByText("sources.noSources")).toBeInTheDocument()
    })
    expect(screen.getByText("sources.importHint")).toBeInTheDocument()
  })

  it("renders source files from directory listing", async () => {
    useWikiStore.setState({ project: { name: "P", path: "/data/proj" } } as any)
    vi.mocked(listDirectory).mockImplementation(async (dir: string) => {
      if (dir.endsWith("/raw/sources")) {
        return [
          {
            name: "notes.pdf",
            path: "/data/proj/raw/sources/notes.pdf",
            is_dir: false,
          },
        ]
      }
      return []
    })

    render(<SourcesView />)

    await waitFor(() => {
      expect(screen.getByText("notes.pdf")).toBeInTheDocument()
    })
  })
})
