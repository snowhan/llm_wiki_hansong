import { describe, it, expect, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { MarkdownView } from "../ui/markdown-view"

vi.mock("@tiptap/react", () => ({
  useEditor: () => ({
    commands: { setContent: vi.fn() },
    getHTML: () => "<p>test</p>",
    getMarkdown: () => "",
    destroy: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    isDestroyed: false,
    storage: { tableOfContents: { content: [] } },
  }),
  EditorContent: () => <div className="tiptap" data-testid="editor-content" />,
}))

describe("MarkdownView", () => {
  it("renders TipTap content for markdown", async () => {
    const { getByTestId } = render(<MarkdownView markdown="hello" />)
    await waitFor(() => {
      expect(getByTestId("editor-content")).toBeTruthy()
    })
  })

  it("accepts sx styling", async () => {
    const { container } = render(<MarkdownView markdown="test" sx={{ fontSize: 12 }} />)
    await waitFor(() => {
      expect(container.querySelector(".tiptap")).toBeTruthy()
    })
  })
})
