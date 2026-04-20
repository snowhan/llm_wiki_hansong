import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, waitFor, fireEvent } from "@testing-library/react"
import { MarkdownView, wikiLinksToMarkdownLinks } from "../ui/markdown-view"

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

beforeEach(() => {
  vi.clearAllMocks()
})

// ── wikiLinksToMarkdownLinks ──────────────────────────────────────────────

describe("wikiLinksToMarkdownLinks", () => {
  it("converts [[Page]] to [Page](wiki:Page)", () => {
    expect(wikiLinksToMarkdownLinks("[[超重]]")).toBe("[超重](wiki:%E8%B6%85%E9%87%8D)")
  })

  it("converts [[Page|Label]] using label as link text", () => {
    expect(wikiLinksToMarkdownLinks("[[超重|体重超标]]")).toBe("[体重超标](wiki:%E8%B6%85%E9%87%8D)")
  })

  it("leaves regular markdown links untouched", () => {
    const input = "[Google](https://google.com)"
    expect(wikiLinksToMarkdownLinks(input)).toBe(input)
  })

  it("converts multiple wikilinks in one string", () => {
    const result = wikiLinksToMarkdownLinks("see [[超重]] and [[高血压]]")
    expect(result).toContain("[超重](wiki:%E8%B6%85%E9%87%8D)")
    expect(result).toContain("[高血压](wiki:%E9%AB%98%E8%A1%80%E5%8E%8B)")
  })

  it("handles empty input safely", () => {
    expect(wikiLinksToMarkdownLinks("")).toBe("")
  })

  it("trims whitespace around page name and label", () => {
    expect(wikiLinksToMarkdownLinks("[[ 超重 | 标签 ]]")).toBe("[标签](wiki:%E8%B6%85%E9%87%8D)")
  })
})

// ── MarkdownView rendering ────────────────────────────────────────────────

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

  // ── click handler ───────────────────────────────────────────────────────

  it("calls onWikilinkClick with decoded page name when a wiki: link is clicked", () => {
    const onWikilinkClick = vi.fn()
    const { container } = render(<MarkdownView markdown="test" onWikilinkClick={onWikilinkClick} />)

    const wrapper = container.firstChild as HTMLElement
    const anchor = document.createElement("a")
    anchor.setAttribute("href", "wiki:%E8%B6%85%E9%87%8D")
    wrapper.appendChild(anchor)

    fireEvent.click(anchor)

    expect(onWikilinkClick).toHaveBeenCalledWith("超重")
  })

  it("prevents default browser navigation for wiki: links even without onWikilinkClick", () => {
    const { container } = render(<MarkdownView markdown="test" />)

    const wrapper = container.firstChild as HTMLElement
    const anchor = document.createElement("a")
    anchor.setAttribute("href", "wiki:TestPage")
    wrapper.appendChild(anchor)

    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    anchor.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it("does not call onWikilinkClick for non-wiki links", () => {
    const onWikilinkClick = vi.fn()
    const { container } = render(<MarkdownView markdown="test" onWikilinkClick={onWikilinkClick} />)

    const wrapper = container.firstChild as HTMLElement
    const anchor = document.createElement("a")
    anchor.setAttribute("href", "https://example.com")
    wrapper.appendChild(anchor)

    fireEvent.click(anchor)

    expect(onWikilinkClick).not.toHaveBeenCalled()
  })

  it("handles click on element inside a wiki: link (closest anchor lookup)", () => {
    const onWikilinkClick = vi.fn()
    const { container } = render(<MarkdownView markdown="test" onWikilinkClick={onWikilinkClick} />)

    const wrapper = container.firstChild as HTMLElement
    const anchor = document.createElement("a")
    anchor.setAttribute("href", "wiki:SomePage")
    const span = document.createElement("span")
    anchor.appendChild(span)
    wrapper.appendChild(anchor)

    fireEvent.click(span)

    expect(onWikilinkClick).toHaveBeenCalledWith("SomePage")
  })

  it("does not throw when clicking outside any link", () => {
    const { container } = render(<MarkdownView markdown="test" />)
    expect(() => fireEvent.click(container.firstChild as HTMLElement)).not.toThrow()
  })
})
