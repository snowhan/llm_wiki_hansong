import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MarkdownView } from "../ui/markdown-view"

vi.mock("@/lib/markdown-renderer", () => ({
  renderMarkdown: (src: string) => `<p>${src}</p>`,
}))

vi.mock("@/stores/wiki-store", () => ({
  useWikiStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ project: null, setSelectedFile: vi.fn(), setFileContent: vi.fn() }),
}))

describe("MarkdownView", () => {
  it("renders content via dangerouslySetInnerHTML", () => {
    const { container } = render(<MarkdownView content="hello" />)
    expect(container.querySelector(".md-rendered")).toBeTruthy()
    expect(container.textContent).toContain("hello")
  })

  it("applies custom className", () => {
    const { container } = render(<MarkdownView content="test" className="custom-class" />)
    expect(container.querySelector(".md-rendered.custom-class")).toBeTruthy()
  })
})
