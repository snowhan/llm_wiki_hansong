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
vi.mock("../review/review-view", () => ({
  ReviewView: () => <div data-testid="review" />,
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
  it("renders ChatPanel for the default wiki view", () => {
    useWikiStore.setState({ activeView: "wiki" } as any)
    render(<ContentArea />)
    expect(screen.getByTestId("chat-panel")).toBeTruthy()
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
})
