import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { SourcesView, __resetSourcesViewTestState } from "@/components/sources/sources-view"
import { useWikiStore } from "@/stores/wiki-store"
import { useActivityStore } from "@/stores/activity-store"
import { listDirectory, readFile } from "@/commands/fs"
import { getAllServerTasks, getServerIngestStatus, subscribeIngestSSE } from "@/commands/ingest"
import type { ServerIngestTask, SseCallbacks } from "@/commands/ingest"

vi.mock("@/commands/ingest", () => ({
  startServerIngest: vi.fn(),
  subscribeIngestSSE: vi.fn().mockReturnValue(() => {}),
  getAllServerTasks: vi.fn().mockResolvedValue([]),
  getServerIngestStatus: vi.fn().mockResolvedValue(null),
}))

const FILE_PATH = "raw/sources/a.pdf"
const FILE_NAME = "a.pdf"
const TASK_ID = "task-1"
let projectSeq = 0

function makeTask(overrides: Partial<ServerIngestTask> = {}): ServerIngestTask {
  const currentProjectId = useWikiStore.getState().project?.id ?? "proj-fallback"
  return {
    id: TASK_ID,
    projectId: currentProjectId,
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

function resetStores() {
  projectSeq += 1
  const project = { id: `proj-${projectSeq}`, name: `P${projectSeq}` }
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

function mockSourcesApi() {
  const fileNode = { name: FILE_NAME, relativePath: FILE_PATH, is_dir: false }
  vi.mocked(listDirectory).mockImplementation(async (_projectId: string, target?: string) => {
    if (target === "raw/sources") return [fileNode]
    return [fileNode]
  })
  vi.mocked(readFile).mockRejectedValue(new Error("not found"))
}

describe("SourcesView server truth alignment", () => {
  beforeEach(() => {
    cleanup()
    __resetSourcesViewTestState()
    vi.clearAllMocks()
    resetStores()
    mockSourcesApi()
  })

  afterEach(() => {
    cleanup()
    __resetSourcesViewTestState()
  })

  it("connection lost + server done reconciles activity to done", async () => {
    vi.mocked(getAllServerTasks).mockResolvedValue([makeTask({ status: "running" })])
    vi.mocked(getServerIngestStatus).mockResolvedValue(
      makeTask({ status: "done", detail: "done", filesWritten: ["wiki/sources/a.md"] }),
    )

    const activityId = useActivityStore.getState().addItem({
      type: "ingest",
      projectId: useWikiStore.getState().project?.id,
      sourcePath: FILE_PATH,
      title: FILE_NAME,
      status: "running",
      detail: "Step 2/2: Generating wiki pages...",
      filesWritten: [],
    })

    render(<SourcesView />)
    await screen.findByText(FILE_NAME)

    await waitFor(() => expect(vi.mocked(subscribeIngestSSE)).toHaveBeenCalled())
    const reconnectCallbacks = vi.mocked(subscribeIngestSSE).mock.calls[0][1] as SseCallbacks
    await act(async () => {
      await reconnectCallbacks.onConnectionLost?.()
    })

    await waitFor(() => {
      const item = useActivityStore.getState().items.find((i) => i.id === activityId)
      expect(useWikiStore.getState().ingestStatuses[FILE_PATH]).toBe("done")
      expect(item?.status).toBe("done")
    })
  })

  it("connection lost + server error reconciles activity to error", async () => {
    vi.mocked(getAllServerTasks).mockResolvedValue([makeTask({ status: "running" })])
    vi.mocked(getServerIngestStatus).mockResolvedValue(
      makeTask({ status: "error", detail: "failed", error: "LLM timeout" }),
    )

    const activityId = useActivityStore.getState().addItem({
      type: "ingest",
      projectId: useWikiStore.getState().project?.id,
      sourcePath: FILE_PATH,
      title: FILE_NAME,
      status: "running",
      detail: "Step 2/2: Generating wiki pages...",
      filesWritten: [],
    })

    render(<SourcesView />)
    await screen.findByText(FILE_NAME)

    await waitFor(() => expect(vi.mocked(subscribeIngestSSE)).toHaveBeenCalled())
    const reconnectCallbacks = vi.mocked(subscribeIngestSSE).mock.calls[0][1] as SseCallbacks
    await act(async () => {
      await reconnectCallbacks.onConnectionLost?.()
    })

    await waitFor(() => {
      const item = useActivityStore.getState().items.find((i) => i.id === activityId)
      expect(useWikiStore.getState().ingestStatuses[FILE_PATH]).toBe("error")
      expect(item?.status).toBe("error")
    })
  })

  it("connection lost + server task missing marks interrupted and activity error", async () => {
    vi.mocked(getAllServerTasks).mockResolvedValue([makeTask({ status: "running" })])
    vi.mocked(getServerIngestStatus).mockResolvedValue(null)

    const activityId = useActivityStore.getState().addItem({
      type: "ingest",
      projectId: useWikiStore.getState().project?.id,
      sourcePath: FILE_PATH,
      title: FILE_NAME,
      status: "running",
      detail: "Step 2/2: Generating wiki pages...",
      filesWritten: [],
    })

    render(<SourcesView />)
    await screen.findByText(FILE_NAME)

    await waitFor(() => expect(vi.mocked(subscribeIngestSSE)).toHaveBeenCalled())
    const reconnectCallbacks = vi.mocked(subscribeIngestSSE).mock.calls[0][1] as SseCallbacks
    await act(async () => {
      await reconnectCallbacks.onConnectionLost?.()
    })

    await waitFor(() => {
      const item = useActivityStore.getState().items.find((i) => i.id === activityId)
      expect(useWikiStore.getState().ingestStatuses[FILE_PATH]).toBe("interrupted")
      expect(item?.status).toBe("error")
    })
  })

  it("retries reconnect multiple times while server still running", async () => {
    vi.mocked(getAllServerTasks).mockResolvedValue([makeTask({ status: "running" })])
    vi.mocked(getServerIngestStatus).mockResolvedValue(makeTask({ status: "running", detail: "still running" }))

    render(<SourcesView />)
    await screen.findByText(FILE_NAME)
    await waitFor(() => expect(vi.mocked(subscribeIngestSSE)).toHaveBeenCalledTimes(1))

    const reconnectCallbacks = vi.mocked(subscribeIngestSSE).mock.calls[0][1] as SseCallbacks
    await act(async () => {
      await reconnectCallbacks.onConnectionLost?.()
      await reconnectCallbacks.onConnectionLost?.()
    })

    await waitFor(() => {
      expect(vi.mocked(subscribeIngestSSE)).toHaveBeenCalledTimes(3)
      expect(useWikiStore.getState().ingestStatuses[FILE_PATH]).toBe("ingesting")
    })
  })

  it("marks interrupted after reconnect retry limit is exceeded", async () => {
    vi.mocked(getAllServerTasks).mockResolvedValue([makeTask({ status: "running" })])
    vi.mocked(getServerIngestStatus).mockResolvedValue(makeTask({ status: "running", detail: "still running" }))

    render(<SourcesView />)
    await screen.findByText(FILE_NAME)
    await waitFor(() => expect(vi.mocked(subscribeIngestSSE)).toHaveBeenCalledTimes(1))

    const reconnectCallbacks = vi.mocked(subscribeIngestSSE).mock.calls[0][1] as SseCallbacks
    await act(async () => {
      await reconnectCallbacks.onConnectionLost?.()
      await reconnectCallbacks.onConnectionLost?.()
      await reconnectCallbacks.onConnectionLost?.()
      await reconnectCallbacks.onConnectionLost?.()
    })

    await waitFor(() => {
      expect(useWikiStore.getState().ingestStatuses[FILE_PATH]).toBe("interrupted")
    })
  })

  it("handles late server done after reconnect attempts and reconciles final UI to done", async () => {
    vi.mocked(getAllServerTasks).mockResolvedValue([makeTask({ status: "running" })])
    vi.mocked(getServerIngestStatus)
      .mockResolvedValueOnce(makeTask({ status: "running", detail: "still running" }))
      .mockResolvedValueOnce(
        makeTask({
          status: "done",
          detail: "done",
          filesWritten: ["wiki/sources/a.md"],
        }),
      )

    const activityId = useActivityStore.getState().addItem({
      type: "ingest",
      projectId: useWikiStore.getState().project?.id,
      sourcePath: FILE_PATH,
      title: FILE_NAME,
      status: "running",
      detail: "Step 2/2: Generating wiki pages...",
      filesWritten: [],
    })

    render(<SourcesView />)
    await screen.findByText(FILE_NAME)
    await waitFor(() => expect(vi.mocked(subscribeIngestSSE)).toHaveBeenCalledTimes(1))

    const reconnectCallbacks = vi.mocked(subscribeIngestSSE).mock.calls[0][1] as SseCallbacks
    await act(async () => {
      await reconnectCallbacks.onConnectionLost?.()
      await reconnectCallbacks.onConnectionLost?.()
    })

    await waitFor(() => {
      const item = useActivityStore.getState().items.find((i) => i.id === activityId)
      expect(useWikiStore.getState().ingestStatuses[FILE_PATH]).toBe("done")
      expect(item?.status).toBe("done")
    })
  })

  it("server done with multiple wiki artifacts still reconciles ingest status to done", async () => {
    vi.mocked(getAllServerTasks).mockResolvedValue([makeTask({ status: "running" })])
    vi.mocked(getServerIngestStatus).mockResolvedValue(
      makeTask({
        status: "done",
        detail: "done",
        filesWritten: [
          "wiki/sources/a.md",
          "wiki/sources/a/entities/韩松.md",
          "wiki/sources/a/concepts/高脂血症.md",
          "wiki/overview.md",
          "wiki/log.md",
        ],
      }),
    )

    const activityId = useActivityStore.getState().addItem({
      type: "ingest",
      projectId: useWikiStore.getState().project?.id,
      sourcePath: FILE_PATH,
      title: FILE_NAME,
      status: "running",
      detail: "Step 2/2: Generating wiki pages...",
      filesWritten: [],
    })

    render(<SourcesView />)
    await screen.findByText(FILE_NAME)

    await waitFor(() => expect(vi.mocked(subscribeIngestSSE)).toHaveBeenCalled())
    const reconnectCallbacks = vi.mocked(subscribeIngestSSE).mock.calls[0][1] as SseCallbacks
    await act(async () => {
      await reconnectCallbacks.onConnectionLost?.()
    })

    await waitFor(() => {
      const item = useActivityStore.getState().items.find((i) => i.id === activityId)
      expect(item?.status).toBe("done")
      expect(useWikiStore.getState().ingestStatuses[FILE_PATH]).toBe("done")
    })
  })
})
