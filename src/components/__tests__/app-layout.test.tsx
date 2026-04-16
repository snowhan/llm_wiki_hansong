import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { AppLayout } from "../layout/app-layout"
import { useWikiStore } from "@/stores/wiki-store"
import { useResearchStore } from "@/stores/research-store"
import { listDirectory } from "@/commands/fs"

vi.mock("../layout/icon-sidebar", () => ({
  IconSidebar: ({ onSwitchProject }: { onSwitchProject: () => void }) => (
    <div data-testid="icon-sidebar" onClick={onSwitchProject} role="presentation" />
  ),
}))

vi.mock("../layout/sidebar-panel", () => ({
  SidebarPanel: () => <div data-testid="sidebar" />,
}))

vi.mock("../layout/activity-panel", () => ({
  ActivityPanel: () => <div data-testid="activity" />,
}))

vi.mock("../layout/content-area", () => ({
  ContentArea: () => <div data-testid="content" />,
}))

vi.mock("../layout/preview-panel", () => ({
  PreviewPanel: () => <div data-testid="preview" />,
}))

vi.mock("../layout/research-panel", () => ({
  ResearchPanel: () => <div data-testid="research" />,
}))

vi.mock("@/components/error-boundary", () => ({
  ErrorBoundary: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

beforeEach(() => {
  vi.clearAllMocks()
  useResearchStore.setState({ panelOpen: false } as any)
  useWikiStore.setState({
    project: null,
    fileTree: [],
    selectedFile: null,
    fileContent: "",
    chatExpanded: false,
    activeView: "wiki",
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
})

describe("AppLayout", () => {
  it("renders main layout sections", () => {
    render(<AppLayout onSwitchProject={vi.fn()} />)
    expect(screen.getByTestId("icon-sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("sidebar")).toBeInTheDocument()
    expect(screen.getByTestId("activity")).toBeInTheDocument()
    expect(screen.getByTestId("content")).toBeInTheDocument()
  })

  it("calls listDirectory when a project is set", async () => {
    render(<AppLayout onSwitchProject={vi.fn()} />)
    useWikiStore.setState({ project: { name: "P", path: "/proj/root" } } as any)

    await waitFor(() => {
      expect(listDirectory).toHaveBeenCalledWith("/proj/root")
    })
  })

  it("shows the right preview panel when a file is selected", () => {
    useWikiStore.setState({
      project: { name: "P", path: "/proj/root" },
      selectedFile: "/proj/root/wiki/a.md",
    } as any)

    render(<AppLayout onSwitchProject={vi.fn()} />)

    expect(screen.getByTestId("preview")).toBeInTheDocument()
  })
})
