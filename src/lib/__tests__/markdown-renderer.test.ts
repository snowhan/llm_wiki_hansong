import { describe, it, expect } from "vitest"
import { renderMarkdown } from "../markdown-renderer"

describe("renderMarkdown", () => {
  it("renders basic paragraph", () => {
    const html = renderMarkdown("Hello world")
    expect(html).toContain("<p>Hello world</p>")
  })

  it("renders headings", () => {
    expect(renderMarkdown("# Title")).toContain("<h1>Title</h1>")
    expect(renderMarkdown("## Subtitle")).toContain("<h2>Subtitle</h2>")
    expect(renderMarkdown("### H3")).toContain("<h3>H3</h3>")
  })

  it("renders bold and italic", () => {
    const html = renderMarkdown("**bold** and *italic*")
    expect(html).toContain("<strong>bold</strong>")
    expect(html).toContain("<em>italic</em>")
  })

  it("renders inline code", () => {
    const html = renderMarkdown("Use `console.log()`")
    expect(html).toContain("<code>console.log()</code>")
  })

  it("renders code blocks with highlight.js", () => {
    const html = renderMarkdown("```javascript\nconst x = 1;\n```")
    expect(html).toContain("hljs-pre")
    expect(html).toContain("hljs")
    expect(html).toContain('lang="javascript"')
  })

  it("renders code blocks without language", () => {
    const html = renderMarkdown("```\nplain text\n```")
    expect(html).toContain("hljs-pre")
    expect(html).toContain("plain text")
  })

  it("renders unordered lists", () => {
    const html = renderMarkdown("- item 1\n- item 2\n- item 3")
    expect(html).toContain("<ul>")
    expect(html).toContain("<li>item 1</li>")
  })

  it("renders ordered lists", () => {
    const html = renderMarkdown("1. first\n2. second")
    expect(html).toContain("<ol>")
    expect(html).toContain("<li>first</li>")
  })

  it("renders blockquotes", () => {
    const html = renderMarkdown("> This is a quote")
    expect(html).toContain("<blockquote>")
  })

  it("renders tables", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |"
    const html = renderMarkdown(md)
    expect(html).toContain("<table>")
    expect(html).toContain("<th>A</th>")
    expect(html).toContain("<td>1</td>")
  })

  it("renders horizontal rules", () => {
    const html = renderMarkdown("---")
    expect(html).toContain("<hr>")
  })

  it("renders links", () => {
    const html = renderMarkdown("[Google](https://google.com)")
    expect(html).toContain('<a href="https://google.com"')
    expect(html).toContain("Google</a>")
  })

  it("renders images", () => {
    const html = renderMarkdown("![alt](image.png)")
    expect(html).toContain('<img src="image.png"')
    expect(html).toContain('alt="alt"')
  })

  // Plugin tests
  it("renders emoji", () => {
    const html = renderMarkdown(":smile:")
    expect(html).toContain("😄")
  })

  it("renders subscript", () => {
    const html = renderMarkdown("H~2~O")
    expect(html).toContain("<sub>2</sub>")
  })

  it("renders superscript", () => {
    const html = renderMarkdown("x^2^")
    expect(html).toContain("<sup>2</sup>")
  })

  it("renders inserted text", () => {
    const html = renderMarkdown("++inserted++")
    expect(html).toContain("<ins>inserted</ins>")
  })

  it("renders marked text", () => {
    const html = renderMarkdown("==highlighted==")
    expect(html).toContain("<mark>highlighted</mark>")
  })

  it("renders footnotes", () => {
    const md = "Text with footnote[^1].\n\n[^1]: Footnote content."
    const html = renderMarkdown(md)
    expect(html).toContain("footnote")
  })

  it("renders task lists", () => {
    const md = "- [ ] Unchecked\n- [x] Checked"
    const html = renderMarkdown(md)
    expect(html).toContain("checkbox")
    expect(html).toContain("Unchecked")
    expect(html).toContain("Checked")
  })

  it("renders KaTeX inline math", () => {
    const html = renderMarkdown("Inline $E = mc^2$ formula")
    expect(html).toContain("katex")
  })

  it("renders KaTeX display math", () => {
    const html = renderMarkdown("$$\n\\sum_{i=1}^{n} i\n$$")
    expect(html).toContain("katex")
  })

  it("renders definition lists", () => {
    const md = "Term\n:   Definition here"
    const html = renderMarkdown(md)
    expect(html).toContain("<dt>Term</dt>")
    expect(html).toContain("<dd>")
  })

  it("passes through HTML (data-wikilink)", () => {
    const html = renderMarkdown('Click <a data-wikilink="page">page</a> here')
    expect(html).toContain('data-wikilink="page"')
    expect(html).toContain(">page</a>")
  })

  it("handles empty input", () => {
    expect(renderMarkdown("")).toBe("")
  })

  it("handles complex nested content", () => {
    const md = "# Title\n\nParagraph with **bold** and `code`.\n\n- list item\n\n> quote\n\n```js\nconst x = 1;\n```"
    const html = renderMarkdown(md)
    expect(html).toContain("<h1>")
    expect(html).toContain("<strong>")
    expect(html).toContain("<code>")
    expect(html).toContain("<ul>")
    expect(html).toContain("<blockquote>")
    expect(html).toContain("hljs-pre")
  })
})
