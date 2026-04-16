import { describe, it, expect, vi } from "vitest"
import { renderMarkdown, renderPreview } from "../markdown-renderer"

vi.mock("vditor/dist/method.min", () => ({
  default: {
    md2html: vi.fn(async (source: string) => {
      if (!source) return ""
      return `<p>${source}</p>`
    }),
    preview: vi.fn(async (el: HTMLDivElement, source: string) => {
      el.innerHTML = `<p>${source}</p>`
    }),
  },
}))

describe("renderMarkdown", () => {
  it("returns HTML string from markdown source", async () => {
    const html = await renderMarkdown("Hello world")
    expect(html).toContain("<p>Hello world</p>")
  })

  it("handles empty input", async () => {
    const html = await renderMarkdown("")
    expect(html).toBe("")
  })

  it("accepts isDark option", async () => {
    const html = await renderMarkdown("test", { isDark: true })
    expect(html).toContain("<p>test</p>")
  })
})

describe("renderPreview", () => {
  it("renders into the provided DOM element", async () => {
    const el = document.createElement("div")
    await renderPreview(el, "Hello preview")
    expect(el.innerHTML).toContain("Hello preview")
  })

  it("handles empty source", async () => {
    const el = document.createElement("div")
    await renderPreview(el, "")
    expect(el.innerHTML).toBeDefined()
  })
})
