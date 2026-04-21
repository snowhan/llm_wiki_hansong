import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CommandPalette } from "../command-palette"
import { useWikiStore } from "@/stores/wiki-store"

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

// Stable action spies shared between component and test assertions
const mockActions = {
  navWiki:    vi.fn(),
  navSearch:  vi.fn(),
  navGraph:   vi.fn(),
  themeLight: vi.fn(),
  themeDark:  vi.fn(),
}

const MOCK_COMMANDS = [
  { id: "nav-wiki",    label: "打开 Wiki",    group: "navigate" as const, action: mockActions.navWiki },
  { id: "nav-search",  label: "打开搜索",      group: "navigate" as const, action: mockActions.navSearch },
  { id: "nav-graph",   label: "打开知识图谱",   group: "navigate" as const, action: mockActions.navGraph },
  { id: "theme-light", label: "浅色主题",      group: "theme" as const,    action: mockActions.themeLight },
  { id: "theme-dark",  label: "深色主题",      group: "theme" as const,    action: mockActions.themeDark },
]

// Mock only buildCommands; keep filterCommands real
vi.mock("../commands", async (importOriginal) => {
  const real = await importOriginal<typeof import("../commands")>()
  return {
    ...real,
    buildCommands: vi.fn(() => MOCK_COMMANDS),
  }
})

const RESET_STORE = {
  activeView: "wiki" as const,
  project: null,
  fileTree: [],
  selectedFile: null,
  fileContent: "",
  chatExpanded: false,
  colorScheme: "system" as const,
  dataVersion: 0,
  openTabs: [],
  activeTabId: null,
  activeTabPath: null,
  ingestingPath: null,
  ingestStatuses: {} as Record<string, "idle" | "ingesting" | "interrupted" | "done" | "error">,
  serverTaskIds: {} as Record<string, string>,
  llmConfig: { provider: "openai" as const, apiKey: "", model: "", ollamaUrl: "http://localhost:11434", customEndpoint: "", maxContextSize: 204800 },
  searchApiConfig: { provider: "none" as const, apiKey: "" },
  embeddingConfig: { enabled: false, endpoint: "", apiKey: "", model: "" },
}

beforeEach(() => {
  useWikiStore.setState(RESET_STORE)
  vi.clearAllMocks()
})

describe("CommandPalette", () => {
  it("is not visible when closed (open=false)", () => {
    render(<CommandPalette open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("renders dialog when open=true", () => {
    render(<CommandPalette open={true} onClose={vi.fn()} />)
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("renders search input when open", () => {
    render(<CommandPalette open={true} onClose={vi.fn()} />)
    expect(screen.getByRole("textbox")).toBeInTheDocument()
  })

  it("shows all commands initially", () => {
    render(<CommandPalette open={true} onClose={vi.fn()} />)
    expect(screen.getByText("打开 Wiki")).toBeInTheDocument()
    expect(screen.getByText("浅色主题")).toBeInTheDocument()
  })

  it("filters commands by search query", async () => {
    render(<CommandPalette open={true} onClose={vi.fn()} />)
    const input = screen.getByRole("textbox")
    await userEvent.type(input, "主题")
    expect(screen.queryByText("打开 Wiki")).not.toBeInTheDocument()
    expect(screen.getByText("浅色主题")).toBeInTheDocument()
    expect(screen.getByText("深色主题")).toBeInTheDocument()
  })

  it("calls action and onClose when item is clicked", async () => {
    const onClose = vi.fn()
    render(<CommandPalette open={true} onClose={onClose} />)
    fireEvent.click(screen.getByText("打开 Wiki"))
    expect(mockActions.navWiki).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("closes on Escape key", async () => {
    const onClose = vi.fn()
    render(<CommandPalette open={true} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it("navigates list with ArrowDown/ArrowUp", async () => {
    render(<CommandPalette open={true} onClose={vi.fn()} />)
    const input = screen.getByRole("textbox")
    fireEvent.keyDown(input, { key: "ArrowDown" })
    // First item should be highlighted — check aria-selected on listitem
    const items = screen.getAllByRole("option")
    expect(items.length).toBeGreaterThan(0)
    expect(items[0]).toHaveAttribute("aria-selected", "true")
  })

  it("executes highlighted command on Enter", async () => {
    const onClose = vi.fn()
    render(<CommandPalette open={true} onClose={onClose} />)
    const input = screen.getByRole("textbox")
    // activeIndex starts at -1, ArrowDown moves to 0 = nav-wiki
    fireEvent.keyDown(input, { key: "ArrowDown" })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(mockActions.navWiki).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
