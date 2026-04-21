import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ContentArea } from "../layout/content-area"
import { useWikiStore } from "@/stores/wiki-store"

vi.mock("../chat/chat-panel", () => ({
  ChatPanel: () => <div data-testid="chat-panel" />,
}))
vi.mock("../settings/settings-view", () => ({
  SettingsView: () => <div data-testid="settings" />,
}))
vi.mock("../sources/sources-view", () => ({
  SourcesView: () => <div data-testid="sources" />,
}))
vi.mock("../lint/lint-view", () => ({
  LintView: () => <div data-testid="lint" />,
}))
vi.mock("../search/search-view", () => ({
  SearchView: () => <div data-testid="search" />,
}))
vi.mock("../graph/graph-view", () => ({
  GraphView: () => <div data-testid="graph" />,
}))
vi.mock("../debug/llm-debug-view", () => ({
  LlmDebugView: () => <div data-testid="llm-debug" />,
}))

beforeEach(() => {
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

describe("ContentArea", () => {
  it("renders nothing for the default wiki view (EditorArea handles it)", () => {
    useWikiStore.setState({ activeView: "wiki" } as any)
    const { container } = render(<ContentArea />)
    expect(container.firstChild).toBeNull()
  })

  it("renders SettingsView when activeView is settings", () => {
    useWikiStore.setState({ activeView: "settings" } as any)
    render(<ContentArea />)
    expect(screen.getByTestId("settings")).toBeTruthy()
  })

  it("renders SourcesView when activeView is sources", () => {
    useWikiStore.setState({ activeView: "sources" } as any)
    render(<ContentArea />)
    expect(screen.getByTestId("sources")).toBeTruthy()
  })

  it("renders LintView when activeView is lint", () => {
    useWikiStore.setState({ activeView: "lint" } as any)
    render(<ContentArea />)
    expect(screen.getByTestId("lint")).toBeTruthy()
  })

  it("renders SearchView when activeView is search", () => {
    useWikiStore.setState({ activeView: "search" } as any)
    render(<ContentArea />)
    expect(screen.getByTestId("search")).toBeTruthy()
  })

  it("renders GraphView when activeView is graph", () => {
    useWikiStore.setState({ activeView: "graph" } as any)
    render(<ContentArea />)
    expect(screen.getByTestId("graph")).toBeTruthy()
  })

  it("renders LlmDebugView when activeView is llm-debug", () => {
    useWikiStore.setState({ activeView: "llm-debug" } as any)
    render(<ContentArea />)
    expect(screen.getByTestId("llm-debug")).toBeTruthy()
  })
})
