import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { SourcesView, __resetSourcesViewTestState } from "@/components/sources/sources-view"
import { useWikiStore } from "@/stores/wiki-store"
import { useActivityStore } from "@/stores/activity-store"
import { listDirectory, readFile } from "@/commands/fs"

vi.mock("@/commands/ingest", () => ({
  startServerIngest: vi.fn().mockResolvedValue("task-mock-id"),
  subscribeIngestSSE: vi.fn().mockReturnValue(() => {}),
  getAllServerTasks: vi.fn().mockResolvedValue([]),
  getServerIngestStatus: vi.fn().mockResolvedValue(null),
}))

const PROJECT = { id: "proj-1", name: "P1" }
const FILE_PATH = "raw/sources/a.pdf"
const FILE_NAME = "a.pdf"

function mockSourcesApi() {
  const fileNode = { name: FILE_NAME, relativePath: FILE_PATH, is_dir: false }
  vi.mocked(listDirectory).mockImplementation(async (_projectId: string, target?: string) => {
    if (target === "raw/sources") return [fileNode]
    return [fileNode]
  })
  vi.mocked(readFile).mockRejectedValue(new Error("not found"))
}

function resetStores() {
  useWikiStore.setState({
    project: PROJECT,
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

describe("SourcesView status reconciliation", () => {
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

  it("reconciles stale running activity to done when file status is done", async () => {
    render(<SourcesView />)
    await screen.findByText(FILE_NAME)

    const activityId = useActivityStore.getState().addItem({
      type: "ingest",
      projectId: PROJECT.id,
      sourcePath: FILE_PATH,
      title: FILE_NAME,
      status: "running",
      detail: "Step 2/2: Generating wiki pages...",
      filesWritten: [],
    })

    await act(async () => {
      useWikiStore.getState().setIngestStatus(FILE_PATH, "done")
      useWikiStore.getState().setServerTaskId(FILE_PATH, null)
    })

    await waitFor(() => {
      const item = useActivityStore.getState().items.find((i) => i.id === activityId)
      expect(item?.status).toBe("done")
    })
  })

  it("keeps activity running while serverTaskId still exists", async () => {
    render(<SourcesView />)
    await screen.findByText(FILE_NAME)

    const activityId = useActivityStore.getState().addItem({
      type: "ingest",
      projectId: PROJECT.id,
      sourcePath: FILE_PATH,
      title: FILE_NAME,
      status: "running",
      detail: "Step 2/2: Generating wiki pages...",
      filesWritten: [],
    })

    await act(async () => {
      useWikiStore.getState().setServerTaskId(FILE_PATH, "task-still-running")
      useWikiStore.getState().setIngestStatus(FILE_PATH, "done")
    })

    await waitFor(() => {
      const item = useActivityStore.getState().items.find((i) => i.id === activityId)
      expect(item?.status).toBe("running")
    })
  })

  it("maps interrupted status to activity error with retry hint", async () => {
    render(<SourcesView />)
    await screen.findByText(FILE_NAME)

    const activityId = useActivityStore.getState().addItem({
      type: "ingest",
      projectId: PROJECT.id,
      sourcePath: FILE_PATH,
      title: FILE_NAME,
      status: "running",
      detail: "Step 2/2: Generating wiki pages...",
      filesWritten: [],
    })

    await act(async () => {
      useWikiStore.getState().setIngestStatus(FILE_PATH, "interrupted")
      useWikiStore.getState().setServerTaskId(FILE_PATH, null)
    })

    await waitFor(() => {
      const item = useActivityStore.getState().items.find((i) => i.id === activityId)
      expect(item?.status).toBe("error")
      expect(item?.detail).toContain("连接中断")
    })
  })

  it("supports legacy running activity without sourcePath by matching title", async () => {
    render(<SourcesView />)
    await screen.findByText(FILE_NAME)

    const activityId = useActivityStore.getState().addItem({
      type: "ingest",
      projectId: PROJECT.id,
      title: FILE_NAME,
      status: "running",
      detail: "Step 2/2: Generating wiki pages...",
      filesWritten: [],
    })

    await act(async () => {
      useWikiStore.getState().setIngestStatus(FILE_PATH, "done")
      useWikiStore.getState().setServerTaskId(FILE_PATH, null)
    })

    await waitFor(() => {
      const item = useActivityStore.getState().items.find((i) => i.id === activityId)
      expect(item?.status).toBe("done")
    })
  })

  it("reconciles stale running activity to error when file status becomes error", async () => {
    render(<SourcesView />)
    await screen.findByText(FILE_NAME)

    const activityId = useActivityStore.getState().addItem({
      type: "ingest",
      projectId: PROJECT.id,
      sourcePath: FILE_PATH,
      title: FILE_NAME,
      status: "running",
      detail: "Step 2/2: Generating wiki pages...",
      filesWritten: [],
    })

    await act(async () => {
      useWikiStore.getState().setIngestStatus(FILE_PATH, "error")
      useWikiStore.getState().setServerTaskId(FILE_PATH, null)
    })

    await waitFor(() => {
      const item = useActivityStore.getState().items.find((i) => i.id === activityId)
      expect(item?.status).toBe("error")
    })
  })

  it("reconciles all duplicated running activities for the same source", async () => {
    render(<SourcesView />)
    await screen.findByText(FILE_NAME)

    const id1 = useActivityStore.getState().addItem({
      type: "ingest",
      projectId: PROJECT.id,
      sourcePath: FILE_PATH,
      title: FILE_NAME,
      status: "running",
      detail: "Step 1/2: Analyzing source...",
      filesWritten: [],
    })
    const id2 = useActivityStore.getState().addItem({
      type: "ingest",
      projectId: PROJECT.id,
      sourcePath: FILE_PATH,
      title: FILE_NAME,
      status: "running",
      detail: "Step 2/2: Generating wiki pages...",
      filesWritten: [],
    })

    await act(async () => {
      useWikiStore.getState().setIngestStatus(FILE_PATH, "done")
      useWikiStore.getState().setServerTaskId(FILE_PATH, null)
    })

    await waitFor(() => {
      const item1 = useActivityStore.getState().items.find((i) => i.id === id1)
      const item2 = useActivityStore.getState().items.find((i) => i.id === id2)
      expect(item1?.status).toBe("done")
      expect(item2?.status).toBe("done")
    })
  })

  it("does not reconcile running activity from a different project", async () => {
    render(<SourcesView />)
    await screen.findByText(FILE_NAME)

    const otherProjectActivityId = useActivityStore.getState().addItem({
      type: "ingest",
      projectId: "other-project",
      sourcePath: FILE_PATH,
      title: FILE_NAME,
      status: "running",
      detail: "Step 2/2: Generating wiki pages...",
      filesWritten: [],
    })

    await act(async () => {
      useWikiStore.getState().setIngestStatus(FILE_PATH, "done")
      useWikiStore.getState().setServerTaskId(FILE_PATH, null)
    })

    await waitFor(() => {
      const item = useActivityStore.getState().items.find((i) => i.id === otherProjectActivityId)
      expect(item?.status).toBe("running")
    })
  })
})
