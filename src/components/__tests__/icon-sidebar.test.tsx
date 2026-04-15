import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { IconSidebar } from "../layout/icon-sidebar"
import { useWikiStore } from "@/stores/wiki-store"
import { useReviewStore } from "@/stores/review-store"
import { useResearchStore } from "@/stores/research-store"
import { clipServerStatus } from "@/commands/fs"

describe("IconSidebar", () => {
  beforeEach(() => {
    useWikiStore.setState({
      activeView: "wiki",
      project: null,
      fileTree: [],
      selectedFile: null,
      fileContent: "",
      chatExpanded: false,
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
    useReviewStore.setState({ items: [] })
    useResearchStore.setState({ panelOpen: false, tasks: [] })
    vi.mocked(clipServerStatus).mockResolvedValue("running")
  })

  it("renders nav buttons for all views", () => {
    const { container } = render(<IconSidebar onSwitchProject={() => {}} />)
    const topNav = container.querySelector(".flex.flex-1.flex-col.items-center.gap-1")
    expect(topNav).toBeTruthy()
    const topButtons = topNav!.querySelectorAll("button")
    expect(topButtons.length).toBe(7)
  })

  it("active view has highlighted style", () => {
    useWikiStore.setState({ activeView: "search" } as any)
    const { container } = render(<IconSidebar onSwitchProject={() => {}} />)
    const topNav = container.querySelector(".flex.flex-1.flex-col.items-center.gap-1")
    const topButtons = topNav!.querySelectorAll("button")
    const searchButton = topButtons[2] as HTMLButtonElement
    expect(searchButton.className).toContain("bg-accent")
  })

  it("review badge shows unresolved count", async () => {
    useReviewStore.setState({
      items: [
        {
          id: "r1",
          type: "confirm",
          title: "A",
          description: "d",
          options: [],
          resolved: false,
          createdAt: 1,
        },
        {
          id: "r2",
          type: "confirm",
          title: "B",
          description: "d",
          options: [],
          resolved: false,
          createdAt: 2,
        },
        {
          id: "r3",
          type: "confirm",
          title: "C",
          description: "d",
          options: [],
          resolved: true,
          createdAt: 3,
        },
      ],
    } as any)
    render(<IconSidebar onSwitchProject={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText("2")).toBeTruthy()
    })
  })

  it("onSwitchProject callback fires", () => {
    const onSwitchProject = vi.fn()
    const { container } = render(<IconSidebar onSwitchProject={onSwitchProject} />)
    const bottomCol = container.querySelector(".flex.flex-col.items-center.gap-1.pb-1")
    const bottomButtons = bottomCol!.querySelectorAll("button")
    const switchBtn = bottomButtons[bottomButtons.length - 1]
    fireEvent.click(switchBtn)
    expect(onSwitchProject).toHaveBeenCalledTimes(1)
  })
})
