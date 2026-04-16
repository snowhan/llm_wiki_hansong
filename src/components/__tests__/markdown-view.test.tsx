import { describe, it, expect, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { MarkdownView } from "../ui/markdown-view"

vi.mock("@/lib/markdown-renderer", () => ({
  renderPreview: vi.fn(async (el: HTMLDivElement, src: string) => {
    el.innerHTML = `<p>${src}</p>`
  }),
}))

vi.mock("@/hooks/use-is-dark", () => ({
  useIsDark: () => false,
}))

vi.mock("@/stores/wiki-store", () => ({
  useWikiStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ project: null, setSelectedFile: vi.fn(), setFileContent: vi.fn() }),
}))

describe("MarkdownView", () => {
  it("renders content via Vditor preview", async () => {
    const { container } = render(<MarkdownView content="hello" />)
    await waitFor(() => {
      expect(container.querySelector(".vditor-reset")).toBeTruthy()
      expect(container.textContent).toContain("hello")
    })
  })

  it("applies custom className", async () => {
    const { container } = render(<MarkdownView content="test" className="custom-class" />)
    await waitFor(() => {
      expect(container.querySelector(".vditor-reset.custom-class")).toBeTruthy()
    })
  })
})
