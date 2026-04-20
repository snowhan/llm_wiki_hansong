import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, waitFor, fireEvent } from "@testing-library/react"
import { WikiEditor } from "../editor/wiki-editor"
import { useWikiStore } from "@/stores/wiki-store"

vi.mock("@tiptap/react", () => {
  function chainableCommand(): any {
    return new Proxy(
      function () {},
      {
        get(_, prop) {
          if (prop === "run") return () => true
          return (..._args: unknown[]) => chainableCommand()
        },
        apply() {
          return chainableCommand()
        },
      },
    )
  }
  return {
    useEditor: () => ({
      commands: { setContent: vi.fn() },
      getHTML: () => "<p>test</p>",
      getMarkdown: () => "",
      destroy: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      isDestroyed: false,
      chain: () => ({
        focus: () => chainableCommand(),
      }),
      can: () => ({ chain: () => ({ run: () => true }), undo: () => true, redo: () => true }),
      isActive: () => false,
      storage: { tableOfContents: { content: [] } },
    }),
    EditorContent: ({ editor }: { editor?: unknown }) => (
      <div className="tiptap" data-testid="editor-content">
        {editor ? "editor" : "no editor"}
      </div>
    ),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  useWikiStore.setState({
    fileTree: [],
    openTabs: [],
    activeTabId: null,
    activeTabPath: null,
  } as any)
})

describe("WikiEditor", () => {
  it("renders toolbar and editor content region", async () => {
    const onSave = vi.fn()
    const { container } = render(<WikiEditor content="# Hello" onSave={onSave} />)
    await waitFor(() => {
      expect(container.querySelector('[data-testid="editor-content"]')).toBeTruthy()
    })
  })

  it("mounts without throwing for empty content", () => {
    const onSave = vi.fn()
    const { unmount } = render(<WikiEditor content="" onSave={onSave} />)
    unmount()
  })

  it("clicking a wiki: link calls openTab and setActiveView when file is in fileTree", async () => {
    const openTab = vi.fn()
    const setActiveView = vi.fn()

    useWikiStore.setState({
      fileTree: [
        {
          name: "超重.md",
          is_dir: false,
          relativePath: "wiki/concepts/超重.md",
          children: [],
        },
      ],
      openTab,
      setActiveView,
    } as any)

    const onSave = vi.fn()
    const { container } = render(<WikiEditor content="# Hello" onSave={onSave} />)

    await waitFor(() => {
      expect(container.querySelector('[data-testid="editor-content"]')).toBeTruthy()
    })

    // Simulate React fallback click handler path (bubbles up to the Box wrapper)
    const wrapper = container.firstChild as HTMLElement
    const anchor = document.createElement("a")
    anchor.setAttribute("href", "wiki:%E8%B6%85%E9%87%8D")
    wrapper.appendChild(anchor)

    fireEvent.click(anchor)

    expect(openTab).toHaveBeenCalledWith("wiki/concepts/超重.md", "超重")
    expect(setActiveView).toHaveBeenCalledWith("wiki")
  })

  it("clicking a wiki: link does nothing when file is not in fileTree", async () => {
    const openTab = vi.fn()
    const setActiveView = vi.fn()

    useWikiStore.setState({
      fileTree: [],
      openTab,
      setActiveView,
    } as any)

    const onSave = vi.fn()
    const { container } = render(<WikiEditor content="# Hello" onSave={onSave} />)

    await waitFor(() => {
      expect(container.querySelector('[data-testid="editor-content"]')).toBeTruthy()
    })

    const wrapper = container.firstChild as HTMLElement
    const anchor = document.createElement("a")
    anchor.setAttribute("href", "wiki:NonExistent")
    wrapper.appendChild(anchor)

    fireEvent.click(anchor)

    expect(openTab).not.toHaveBeenCalled()
  })

  it("clicking external https link is not intercepted by wiki handler", async () => {
    const openTab = vi.fn()
    useWikiStore.setState({ fileTree: [], openTab } as any)

    const onSave = vi.fn()
    const { container } = render(<WikiEditor content="# Hello" onSave={onSave} />)

    await waitFor(() => {
      expect(container.querySelector('[data-testid="editor-content"]')).toBeTruthy()
    })

    const wrapper = container.firstChild as HTMLElement
    const anchor = document.createElement("a")
    anchor.setAttribute("href", "https://example.com")
    wrapper.appendChild(anchor)

    fireEvent.click(anchor)

    expect(openTab).not.toHaveBeenCalled()
  })
})
