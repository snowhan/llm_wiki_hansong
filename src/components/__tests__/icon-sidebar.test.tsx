import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { IconSidebar } from "../layout/icon-sidebar"
import { useWikiStore } from "@/stores/wiki-store"
import { useResearchStore } from "@/stores/research-store"
import { useAuthStore } from "@/stores/auth-store"

const ADMIN_USER = {
  id: "u1",
  username: "admin",
  role: "admin" as const,
  status: "active",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
}

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
    // Explicitly set admin user so access rules are deterministic
    useAuthStore.setState({ user: ADMIN_USER, accessToken: "tok", isInitializing: false })
  })

  it("renders nav buttons for all views (admin user)", () => {
    render(<IconSidebar onSwitchProject={() => {}} />)
    const buttons = screen.getAllByRole("button")
    // admin: 6 nav + 1 research + 1 settings + 1 account + 1 switch-project = 10
    expect(buttons.length).toBe(10)
    expect(buttons.every((b) => b.className.includes("MuiIconButton"))).toBe(true)
  })

  it("renders fewer nav buttons for anonymous user", () => {
    useAuthStore.setState({ user: null, accessToken: null, isInitializing: false })
    render(<IconSidebar onSwitchProject={() => {}} />)
    const buttons = screen.getAllByRole("button")
    // anonymous: 3 nav (wiki, search, graph) + 1 research + 1 login + 1 switch = 6
    expect(buttons.length).toBe(6)
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
