import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { ActivityPanel } from "../layout/activity-panel"
import { useActivityStore } from "@/stores/activity-store"
import { useWikiStore } from "@/stores/wiki-store"
import * as ingestQueue from "@/lib/ingest-queue"

vi.mock("@/lib/ingest-queue", () => ({
  getQueue: vi.fn(() => []),
  getQueueSummary: vi.fn(() => ({ pending: 0, processing: 0, failed: 0, total: 0 })),
  retryTask: vi.fn(),
  cancelTask: vi.fn(),
}))

describe("ActivityPanel", () => {
  beforeEach(() => {
    useWikiStore.setState({
      project: { name: "P", path: "/proj" },
    } as any)
    useActivityStore.setState({ items: [] })
    vi.mocked(ingestQueue.getQueue).mockReturnValue([])
    vi.mocked(ingestQueue.getQueueSummary).mockReturnValue({
      pending: 0,
      processing: 0,
      failed: 0,
      total: 0,
    })
  })

  it("returns null when no items and empty queue", () => {
    const { container } = render(<ActivityPanel />)
    expect(container.firstChild).toBeNull()
  })

  it("shows queue progress when tasks exist", async () => {
    vi.mocked(ingestQueue.getQueueSummary).mockReturnValue({
      pending: 1,
      processing: 0,
      failed: 0,
      total: 2,
    })
    useActivityStore.setState({
      items: [
        {
          id: "x",
          type: "ingest",
          title: "ingest",
          status: "running",
          detail: "…",
          filesWritten: [],
          createdAt: 1,
        },
      ],
    } as any)
    render(<ActivityPanel />)
    await waitFor(() => {
      expect(screen.getByText("activity.ingestQueue")).toBeTruthy()
    })
  })

  it("clear done button calls clearDone", () => {
    const clearDoneSpy = vi.spyOn(useActivityStore.getState(), "clearDone")
    useActivityStore.setState({
      items: [
        {
          id: "d1",
          type: "ingest",
          title: "Done task",
          status: "done",
          detail: "ok",
          filesWritten: [],
          createdAt: 1,
        },
      ],
    } as any)
    const { container } = render(<ActivityPanel />)
    const header = container.querySelector("button.flex.w-full")
    expect(header).toBeTruthy()
    fireEvent.click(header!)
    fireEvent.click(screen.getByText("activity.clearCompleted"))
    expect(clearDoneSpy).toHaveBeenCalled()
    clearDoneSpy.mockRestore()
  })
})
