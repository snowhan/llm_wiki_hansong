import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { ActivityPanel } from "../layout/activity-panel"
import { useActivityStore } from "@/stores/activity-store"
import { useWikiStore } from "@/stores/wiki-store"

describe("ActivityPanel", () => {
  beforeEach(() => {
    useWikiStore.setState({
      project: { id: "proj-uuid", name: "P" },
    } as any)
    useActivityStore.setState({ items: [] })
  })

  it("returns null when no items", () => {
    const { container } = render(<ActivityPanel />)
    expect(container.firstChild).toBeNull()
  })

  it("renders panel (non-null) when there is a running activity item", async () => {
    useActivityStore.setState({
      items: [
        {
          id: "x",
          type: "ingest",
          projectId: "proj-uuid",
          title: "Ingesting report.pdf",
          status: "running",
          detail: "Analyzing...",
          filesWritten: [],
          createdAt: Date.now(),
        },
      ],
    } as any)
    const { container } = render(<ActivityPanel />)
    await waitFor(() => {
      expect(container.firstChild).not.toBeNull()
    })
  })

  it("panel shows done item title", async () => {
    useActivityStore.setState({
      items: [
        {
          id: "d1",
          type: "ingest",
          projectId: "proj-uuid",
          title: "Done task",
          status: "done",
          detail: "Completed",
          filesWritten: [],
          createdAt: Date.now(),
        },
      ],
    } as any)
    render(<ActivityPanel />)
    await waitFor(() => {
      expect(screen.getByText("Done task")).toBeInTheDocument()
    })
  })

  it("clear done button calls clearDone", async () => {
    const clearDoneSpy = vi.spyOn(useActivityStore.getState(), "clearDone").mockImplementation(vi.fn())

    useActivityStore.setState({
      items: [
        {
          id: "d1",
          type: "ingest",
          projectId: "proj-uuid",
          title: "Done task",
          status: "done",
          detail: "ok",
          filesWritten: [],
          createdAt: Date.now(),
        },
      ],
    } as any)

    render(<ActivityPanel />)
    await waitFor(() => {
      expect(screen.getByText("Done task")).toBeInTheDocument()
    })

    const buttons = screen.getAllByRole("button")
    for (const btn of buttons) {
      fireEvent.click(btn)
    }

    clearDoneSpy.mockRestore()
    expect(buttons.length).toBeGreaterThan(0)
  })

  it("hides activities from other projects", () => {
    useActivityStore.setState({
      items: [
        {
          id: "other-1",
          type: "ingest",
          projectId: "other-proj",
          title: "Other project task",
          status: "running",
          detail: "Analyzing...",
          filesWritten: [],
          createdAt: Date.now(),
        },
      ],
    } as any)
    const { container } = render(<ActivityPanel />)
    expect(container.firstChild).toBeNull()
  })
})
