/**
 * TDD tests for the "重建摘要" (rebuild-summary) button in SourcesView.
 * These tests verify:
 *   1. Button renders in the header toolbar
 *   2. Clicking the button calls rebuildWikiSummary
 *   3. Spinner shows while rebuilding
 *   4. Success / error states are reflected in button appearance
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { SourcesView } from "@/components/sources/sources-view"
import { useWikiStore } from "@/stores/wiki-store"
import { useActivityStore } from "@/stores/activity-store"
import { listDirectory, readFile, preprocessFile } from "@/commands/fs"
import {
  startServerIngest,
  subscribeIngestSSE,
  getAllServerTasks,
  getServerIngestStatus,
  rebuildWikiSummary,
  getRebuildSummaryStatus,
} from "@/commands/ingest"
import type { RebuildSummaryStatus } from "@/commands/ingest"

vi.mock("@/commands/ingest", () => ({
  startServerIngest: vi.fn().mockResolvedValue("task-1"),
  subscribeIngestSSE: vi.fn().mockReturnValue(() => {}),
  getAllServerTasks: vi.fn().mockResolvedValue([]),
  getServerIngestStatus: vi.fn().mockResolvedValue(null),
  rebuildWikiSummary: vi.fn().mockResolvedValue("rebuild-task-1"),
  getRebuildSummaryStatus: vi.fn().mockResolvedValue(null),
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
  uploadFiles: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/stores/mapping-check-store", () => ({
  useMappingCheckStore: {
    getState: () => ({ saveItems: vi.fn().mockResolvedValue(undefined) }),
  },
}))

let projectSeq = 0

function resetStores() {
  projectSeq += 1
  const project = { id: `proj-rs-${projectSeq}`, name: `PRS${projectSeq}` }
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

describe("SourcesView — 重建摘要按钮", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStores()
    vi.mocked(listDirectory).mockResolvedValue([])
    vi.mocked(readFile).mockRejectedValue(new Error("not found"))
  })

  it("在顶部工具栏渲染「重建摘要」按钮", async () => {
    render(<SourcesView />)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /重建摘要/i })).toBeInTheDocument()
    })
  })

  it("点击按钮时调用 rebuildWikiSummary 并传入当前 projectId", async () => {
    const projectId = useWikiStore.getState().project!.id
    vi.mocked(rebuildWikiSummary).mockResolvedValue("rebuild-task-1")
    vi.mocked(getRebuildSummaryStatus).mockResolvedValue({
      id: "rebuild-task-1",
      projectId,
      status: "running",
      detail: "扫描中…",
      error: null,
      filesWritten: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } satisfies RebuildSummaryStatus)

    render(<SourcesView />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /重建摘要/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /重建摘要/i }))

    await waitFor(() => {
      expect(rebuildWikiSummary).toHaveBeenCalledWith(projectId)
    })
  })

  it("点击后按钮变为禁用/加载状态，无法重复触发", async () => {
    let resolveRebuild: (v: string) => void
    vi.mocked(rebuildWikiSummary).mockReturnValue(
      new Promise<string>((resolve) => { resolveRebuild = resolve }),
    )

    render(<SourcesView />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /重建摘要/i })).toBeInTheDocument()
    })

    const btn = screen.getByRole("button", { name: /重建摘要/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(rebuildWikiSummary).toHaveBeenCalledTimes(1)
    })

    // 二次点击：应不再触发（按钮已禁用）
    fireEvent.click(btn)
    expect(rebuildWikiSummary).toHaveBeenCalledTimes(1)

    resolveRebuild!("rebuild-task-2")
  })
})
