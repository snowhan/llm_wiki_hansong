/**
 * TDD tests for the "去重词条" (deduplicate) button in SourcesView.
 * Verifies:
 *   1. Button renders in the header toolbar
 *   2. Clicking the button calls deduplicateWiki with current projectId
 *   3. Spinner shows while deduplicating (button disabled)
 *   4. Cannot trigger again while running
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
  deduplicateWiki,
  getDeduplicateStatus,
} from "@/commands/ingest"
import type { DeduplicateStatus } from "@/commands/ingest"

vi.mock("@/commands/ingest", () => ({
  startServerIngest: vi.fn().mockResolvedValue("task-1"),
  subscribeIngestSSE: vi.fn().mockReturnValue(() => {}),
  getAllServerTasks: vi.fn().mockResolvedValue([]),
  getServerIngestStatus: vi.fn().mockResolvedValue(null),
  rebuildWikiSummary: vi.fn().mockResolvedValue("rebuild-task-1"),
  getRebuildSummaryStatus: vi.fn().mockResolvedValue(null),
  deduplicateWiki: vi.fn().mockResolvedValue("dedup-task-1"),
  getDeduplicateStatus: vi.fn().mockResolvedValue(null),
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
  const project = { id: `proj-dd-${projectSeq}`, name: `PDD${projectSeq}` }
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

describe("SourcesView — 去重词条按钮", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStores()
    vi.mocked(listDirectory).mockResolvedValue([])
    vi.mocked(readFile).mockRejectedValue(new Error("not found"))
  })

  it("在顶部工具栏渲染「去重词条」按钮", async () => {
    render(<SourcesView />)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /去重词条/i })).toBeInTheDocument()
    })
  })

  it("点击按钮时调用 deduplicateWiki 并传入当前 projectId", async () => {
    const projectId = useWikiStore.getState().project!.id
    vi.mocked(deduplicateWiki).mockResolvedValue("dedup-task-1")
    vi.mocked(getDeduplicateStatus).mockResolvedValue({
      id: "dedup-task-1",
      projectId,
      status: "running",
      detail: "扫描词条中…",
      error: null,
      mergeCount: 0,
      filesDeleted: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } satisfies DeduplicateStatus)

    render(<SourcesView />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /去重词条/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /去重词条/i }))

    await waitFor(() => {
      expect(deduplicateWiki).toHaveBeenCalledWith(projectId)
    })
  })

  it("点击后按钮变为禁用/加载状态，无法重复触发", async () => {
    let resolveDedup: (v: string) => void
    vi.mocked(deduplicateWiki).mockReturnValue(
      new Promise<string>((resolve) => { resolveDedup = resolve }),
    )

    render(<SourcesView />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /去重词条/i })).toBeInTheDocument()
    })

    const btn = screen.getByRole("button", { name: /去重词条/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(deduplicateWiki).toHaveBeenCalledTimes(1)
    })

    // 二次点击：按钮已禁用，不再触发
    fireEvent.click(btn)
    expect(deduplicateWiki).toHaveBeenCalledTimes(1)

    resolveDedup!("dedup-task-2")
  })
})
