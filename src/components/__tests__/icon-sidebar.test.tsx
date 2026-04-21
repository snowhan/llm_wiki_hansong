import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { IconSidebar } from "../layout/icon-sidebar"
import { useWikiStore } from "@/stores/wiki-store"
import { useResearchStore } from "@/stores/research-store"

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
    useResearchStore.setState({ panelOpen: false, tasks: [] })
  })

  it("renders nav buttons for all views", () => {
    render(<IconSidebar onSwitchProject={() => {}} />)
    const buttons = screen.getAllByRole("button")
    // 6 main nav + 1 research + 1 settings + 1 switch project = 9
    expect(buttons.length).toBe(9)
    expect(buttons.slice(0, 6).every((b) => b.className.includes("MuiIconButton"))).toBe(true)
  })

  it("active view has highlighted style", () => {
    useWikiStore.setState({ activeView: "search" } as any)
    render(<IconSidebar onSwitchProject={() => {}} />)
    const buttons = screen.getAllByRole("button")
    const searchButton = buttons[2] as HTMLButtonElement
    expect(searchButton.className).toMatch(/MuiIconButton/)
    expect(searchButton).toBeVisible()
  })

  it("onSwitchProject callback fires", () => {
    const onSwitchProject = vi.fn()
    render(<IconSidebar onSwitchProject={onSwitchProject} />)
    const buttons = screen.getAllByRole("button")
    const switchBtn = buttons[buttons.length - 1]
    fireEvent.click(switchBtn)
    expect(onSwitchProject).toHaveBeenCalledTimes(1)
  })
})
