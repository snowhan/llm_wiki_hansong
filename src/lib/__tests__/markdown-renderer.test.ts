import { describe, it, expect } from "vitest"
import { renderMarkdown, renderMarkdownToHtml, renderPreview } from "../markdown-renderer"

describe("renderMarkdownToHtml", () => {
  it("returns HTML string from markdown source", () => {
    const html = renderMarkdownToHtml("Hello world")
    expect(html.length).toBeGreaterThan(0)
    expect(html).toMatch(/Hello world/i)
  })

  it("handles empty input", () => {
    const html = renderMarkdownToHtml("")
    expect(html).toBeDefined()
  })

  it("accepts isDark option via renderMarkdown (compat)", async () => {
    const html = await renderMarkdown("test", { isDark: true })
    expect(html.length).toBeGreaterThan(0)
  })
})

describe("renderPreview", () => {
  it("renders into the provided DOM element", async () => {
    const el = document.createElement("div")
    await renderPreview(el, "Hello preview")
    expect(el.innerHTML.length).toBeGreaterThan(0)
  })

  it("handles empty source", async () => {
    const el = document.createElement("div")
    await renderPreview(el, "")
    expect(el.innerHTML).toBeDefined()
  })
})
