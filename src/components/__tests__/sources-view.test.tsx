import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { SourcesView } from "../sources/sources-view"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile, listDirectory } from "@/commands/fs"

vi.mock("@/lib/ingest", () => ({
  startIngest: vi.fn(),
  autoIngest: vi.fn(),
}))

vi.mock("@/commands/ingest", () => ({
  startServerIngest: vi.fn().mockResolvedValue("task-mock-id"),
  subscribeIngestSSE: vi.fn().mockReturnValue(() => {}),
  getAllServerTasks: vi.fn().mockResolvedValue([]),
  getServerIngestStatus: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/commands/fs", () => ({
  readFile: vi.fn().mockRejectedValue(new Error("not found")),
  writeFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  listDirectory: vi.fn().mockResolvedValue([]),
  createDirectory: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(false),
  rename: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
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
    openTabs: [],
    activeTabId: null,
    activeTabPath: null,
    ingestingPath: null,
    ingestStatuses: {},
    serverTaskIds: {},
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
  vi.mocked(readFile).mockRejectedValue(new Error("not found"))
})

describe("SourcesView", () => {
  it("does not load sources when there is no project", async () => {
    render(<SourcesView />)
    await waitFor(() => {
      expect(listDirectory).not.toHaveBeenCalled()
    })
  })

  it("shows import hint when sources are empty", async () => {
    useWikiStore.setState({ project: { id: "proj-uuid", name: "P" } } as any)
    vi.mocked(listDirectory).mockResolvedValue([])

    render(<SourcesView />)

    await waitFor(() => {
      expect(screen.getByText("sources.noSources")).toBeInTheDocument()
    })
    expect(screen.getByText("sources.importHint")).toBeInTheDocument()
  })

  it("renders source files from directory listing", async () => {
    useWikiStore.setState({ project: { id: "proj-uuid", name: "P" } } as any)
    vi.mocked(listDirectory).mockImplementation(async (_projectId: string, dir?: string) => {
      if (dir === "raw/sources" || dir?.endsWith("/raw/sources")) {
        return [
          {
            name: "notes.pdf",
            relativePath: "raw/sources/notes.pdf",
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
