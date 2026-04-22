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

  it("T-012: search input uses i18n key for placeholder (not hardcoded text)", () => {
    render(<CommandPalette open={true} onClose={vi.fn()} />)
    const input = screen.getByRole("textbox")
    // The placeholder must be the i18n key (t() stub returns the key as-is in tests)
    expect(input).toHaveAttribute("placeholder", "commandPalette.searchPlaceholder")
  })

  it("T-012: search input aria-label uses i18n key", () => {
    render(<CommandPalette open={true} onClose={vi.fn()} />)
    const input = screen.getByRole("textbox")
    expect(input).toHaveAttribute("aria-label", "commandPalette.searchAriaLabel")
  })

  it("T-014: group order is stable across renders (navigate before theme)", () => {
    render(<CommandPalette open={true} onClose={vi.fn()} />)
    const navLabel = screen.getByText("commandPalette.group.navigate")
    const themeLabel = screen.getByText("commandPalette.group.theme")
    expect(navLabel).toBeInTheDocument()
    expect(themeLabel).toBeInTheDocument()
    // navigate group header appears before theme group header in the DOM
    expect(
      navLabel.compareDocumentPosition(themeLabel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("navigates list with ArrowDown/ArrowUp and wraps at boundaries", async () => {
    render(<CommandPalette open={true} onClose={vi.fn()} />)
    const input = screen.getByRole("textbox")
    const items = screen.getAllByRole("option")
    expect(items.length).toBeGreaterThan(0)
    // ArrowUp from first item wraps to last
    fireEvent.keyDown(input, { key: "ArrowUp" })
    expect(items[items.length - 1]).toHaveAttribute("aria-selected", "true")
    // ArrowDown from last wraps to first
    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(items[0]).toHaveAttribute("aria-selected", "true")
  })

  it("first item is highlighted when palette opens (activeIndex = 0)", () => {
    render(<CommandPalette open={true} onClose={vi.fn()} />)
    const items = screen.getAllByRole("option")
    expect(items[0]).toHaveAttribute("aria-selected", "true")
  })

  it("executes first command on Enter without needing ArrowDown", async () => {
    const onClose = vi.fn()
    render(<CommandPalette open={true} onClose={onClose} />)
    const input = screen.getByRole("textbox")
    fireEvent.keyDown(input, { key: "Enter" })
    expect(mockActions.navWiki).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("BUG REGRESSION: after typing query, Enter executes first filtered result without ArrowDown", async () => {
    const onClose = vi.fn()
    render(<CommandPalette open={true} onClose={onClose} />)
    const input = screen.getByRole("textbox")
    // Type "wiki" — matches only nav-wiki
    await userEvent.type(input, "wiki")
    fireEvent.keyDown(input, { key: "Enter" })
    expect(mockActions.navWiki).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("ArrowDown from first item moves to second item", async () => {
    render(<CommandPalette open={true} onClose={vi.fn()} />)
    const input = screen.getByRole("textbox")
    fireEvent.keyDown(input, { key: "ArrowDown" })
    const items = screen.getAllByRole("option")
    expect(items[0]).toHaveAttribute("aria-selected", "false")
    expect(items[1]).toHaveAttribute("aria-selected", "true")
  })
})
