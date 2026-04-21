/**
 * TDD: Verify App passes projectsRoot from API as initialPath to ServerDirBrowser.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { act } from "react"

// ── Heavy deps that must be mocked first ─────────────────────────────────────

vi.mock("@/stores/wiki-store", () => ({
  useWikiStore: vi.fn((selector: (s: any) => any) =>
    selector({
      project: null,
      setProject: vi.fn(),
      setFileTree: vi.fn(),
      setSelectedFile: vi.fn(),
      setActiveView: vi.fn(),
      getState: () => ({ setLlmConfig: vi.fn(), setSearchApiConfig: vi.fn(), setEmbeddingConfig: vi.fn() }),
    }),
  ),
}))

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: vi.fn((selector: (s: any) => any) =>
    selector({
      user: { id: "u1", username: "admin", role: "admin" },
      isInitializing: false,
      initialize: vi.fn(),
    }),
  ),
}))

vi.mock("@/stores/chat-store", () => ({
  useChatStore: { getState: () => ({ setConversations: vi.fn(), setMessages: vi.fn(), setActiveConversation: vi.fn() }) },
}))

vi.mock("@/commands/fs", () => ({
  listDirectory: vi.fn().mockResolvedValue([]),
  openProject: vi.fn().mockResolvedValue({ id: "p1", name: "wiki" }),
}))

vi.mock("@/lib/project-store", () => ({
  getLastProject: vi.fn().mockResolvedValue(null),
  saveLastProject: vi.fn().mockResolvedValue(undefined),
  loadLlmConfig: vi.fn().mockResolvedValue(null),
  loadLanguage: vi.fn().mockResolvedValue(null),
  loadSearchApiConfig: vi.fn().mockResolvedValue(null),
  loadEmbeddingConfig: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/lib/persist", () => ({
  loadChatHistory: vi.fn().mockResolvedValue({ conversations: [], messages: [] }),
}))

vi.mock("@/lib/auto-save", () => ({ setupAutoSave: vi.fn() }))
vi.mock("@/i18n", () => ({ default: { changeLanguage: vi.fn() } }))

vi.mock("@/lib/api-client", () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
}))

vi.mock("@/components/layout/app-layout", () => ({
  AppLayout: () => <div data-testid="app-layout" />,
}))

vi.mock("@/components/project/welcome-screen", () => ({
  WelcomeScreen: ({ onOpenProject }: { onOpenProject: () => void }) => (
    <button data-testid="open-project-btn" onClick={onOpenProject}>
      open
    </button>
  ),
}))

vi.mock("@/components/auth/AuthModal", () => ({
  AuthModal: () => null,
}))

vi.mock("@/components/project/create-project-dialog", () => ({
  CreateProjectDialog: () => null,
}))

vi.mock("@/components/command-palette/command-palette", () => ({
  CommandPalette: () => null,
}))

// Expose initialPath for inspection
vi.mock("@/components/project/server-dir-browser", () => ({
  ServerDirBrowser: ({ open, initialPath }: { open: boolean; initialPath?: string }) =>
    open ? <div data-testid="dir-browser" data-initial-path={initialPath ?? ""} /> : null,
}))

import { apiGet } from "@/lib/api-client"
import App from "../App"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiGet).mockImplementation((url: string) => {
    if (url === "/api/project/root") return Promise.resolve({ projectsRoot: "/data/projects" })
    return Promise.resolve(null)
  })
})

describe("App ServerDirBrowser initialPath", () => {
  it("passes projectsRoot from API to ServerDirBrowser when open project dialog opens", async () => {
    await act(async () => {
      render(<App />)
    })

    // Click "Open Project" to show ServerDirBrowser
    await act(async () => {
      fireEvent.click(screen.getByTestId("open-project-btn"))
    })

    await waitFor(() => {
      const browser = screen.getByTestId("dir-browser")
      expect(browser).toHaveAttribute("data-initial-path", "/data/projects")
    })
  })
})
