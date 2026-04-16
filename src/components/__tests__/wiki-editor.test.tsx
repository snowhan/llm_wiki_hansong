import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { WikiEditor } from "../editor/wiki-editor"

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
})
