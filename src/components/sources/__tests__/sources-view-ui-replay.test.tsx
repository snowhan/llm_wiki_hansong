import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, fireEvent, within, act } from "@testing-library/react"
import { SourcesView } from "@/components/sources/sources-view"
import { useWikiStore } from "@/stores/wiki-store"
import { useActivityStore } from "@/stores/activity-store"
import { listDirectory, readFile, preprocessFile } from "@/commands/fs"
import { startServerIngest, getServerIngestStatus, subscribeIngestSSE } from "@/commands/ingest"
import type { ServerIngestTask, SseCallbacks } from "@/commands/ingest"

vi.mock("@/commands/ingest", () => ({
  startServerIngest: vi.fn().mockResolvedValue("task-1"),
  subscribeIngestSSE: vi.fn().mockReturnValue(() => {}),
  getAllServerTasks: vi.fn().mockResolvedValue([]),
  getServerIngestStatus: vi.fn().mockResolvedValue(null),
}))

const FILE_PATH = "raw/sources/a.pdf"
const FILE_NAME = "a.pdf"
let projectSeq = 0

function resetStores() {
  projectSeq += 1
  const project = { id: `proj-ui-${projectSeq}`, name: `PU${projectSeq}` }
  useWikiStore.setState({
    project,
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
  } as any)
  useActivityStore.setState({ items: [] })
}

function makeTask(overrides: Partial<ServerIngestTask> = {}): ServerIngestTask {
  const projectId = useWikiStore.getState().project?.id ?? "proj-fallback"
  return {
    id: "task-1",
    projectId,
    sourcePath: FILE_PATH,
    folderContext: "",
    status: "running",
    detail: "Step 1/2",
    filesWritten: [],
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function mockSourcesApi() {
  const fileNode = { name: FILE_NAME, relativePath: FILE_PATH, is_dir: false }
  vi.mocked(listDirectory).mockImplementation(async (_projectId: string, target?: string) => {
    if (target === "raw/sources") return [fileNode]
    return [fileNode]
  })
  vi.mocked(readFile).mockRejectedValue(new Error("not found"))
}

describe("SourcesView UI replay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStores()
    mockSourcesApi()
    vi.mocked(preprocessFile).mockImplementation(async (_projectId, _path, onStage) => {
      onStage("done")
      return
    })
  })

  it("dedups rapid clicks and converges to done after reconnect + late server done", async () => {
    vi.mocked(getServerIngestStatus)
      .mockResolvedValueOnce(makeTask({ status: "running", detail: "still running" }))
      .mockResolvedValueOnce(
        makeTask({ status: "done", detail: "done", filesWritten: ["wiki/sources/a.md"] }),
      )

    render(<SourcesView />)
    await screen.findByText(FILE_NAME)

    const openButton = screen.getByText(FILE_NAME).closest("button")
    expect(openButton).not.toBeNull()
    const row = (openButton as HTMLElement).parentElement
    expect(row).not.toBeNull()
    const rowButtons = within(row as HTMLElement).getAllByRole("button")
    const ingestButton = rowButtons[1]
    fireEvent.click(ingestButton)
    fireEvent.click(ingestButton)
    fireEvent.click(ingestButton)

    await waitFor(() => expect(vi.mocked(startServerIngest)).toHaveBeenCalledTimes(1))
    expect(useActivityStore.getState().items.filter((i) => i.type === "ingest")).toHaveLength(1)

    await waitFor(() => expect(vi.mocked(subscribeIngestSSE)).toHaveBeenCalledTimes(1))
    const callbacks = vi.mocked(subscribeIngestSSE).mock.calls[0][1] as SseCallbacks
    await act(async () => {
      await callbacks.onConnectionLost?.()
      await callbacks.onConnectionLost?.()
    })

    await waitFor(() => {
      const status = useWikiStore.getState().ingestStatuses[FILE_PATH]
      const item = useActivityStore.getState().items.find((i) => i.type === "ingest")
      expect(status).toBe("done")
      expect(item?.status).toBe("done")
    })
  })
})
