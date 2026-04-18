import { describe, it, expect } from "vitest"
import { parseFrontmatter } from "../frontmatter"

/**
 * parseFrontmatter receives the RAW frontmatter string as returned by
 * splitFrontmatter — i.e. still wrapped in "---" delimiter lines.
 */

describe("parseFrontmatter", () => {
  it("returns empty object for empty string", () => {
    expect(parseFrontmatter("")).toEqual({})
  })

  it("returns empty object for null-ish input", () => {
    // @ts-expect-error testing runtime safety
    expect(parseFrontmatter(null)).toEqual({})
  })

  it("parses a simple string field", () => {
    const fm = "---\ntitle: Hello World\n---\n"
    expect(parseFrontmatter(fm).title).toBe("Hello World")
  })

  it("parses multiple fields", () => {
    const fm = "---\ntitle: Test\ntype: concept\n---\n"
    const r = parseFrontmatter(fm)
    expect(r.title).toBe("Test")
    expect(r.type).toBe("concept")
  })

  it("strips surrounding double quotes from string values", () => {
    const fm = '---\ntitle: "Quoted Title"\n---\n'
    expect(parseFrontmatter(fm).title).toBe("Quoted Title")
  })

  it("strips surrounding single quotes from string values", () => {
    const fm = "---\ntitle: 'Single Quoted'\n---\n"
    expect(parseFrontmatter(fm).title).toBe("Single Quoted")
  })

  it("preserves colons inside string values (URL example)", () => {
    const fm = "---\nurl: https://example.com:8080/path\n---\n"
    expect(parseFrontmatter(fm).url).toBe("https://example.com:8080/path")
  })

  it("preserves colons inside string values (title with colon)", () => {
    const fm = "---\ntitle: Foo: Bar: Baz\n---\n"
    expect(parseFrontmatter(fm).title).toBe("Foo: Bar: Baz")
  })

  it("parses an inline array [a, b, c]", () => {
    const fm = "---\ntags: [react, typescript, testing]\n---\n"
    expect(parseFrontmatter(fm).tags).toEqual(["react", "typescript", "testing"])
  })

  it("strips quotes from array items", () => {
    const fm = "---\ntags: ['react', \"vue\"]\n---\n"
    expect(parseFrontmatter(fm).tags).toEqual(["react", "vue"])
  })

  it("parses an empty array []", () => {
    const fm = "---\ntags: []\n---\n"
    expect(parseFrontmatter(fm).tags).toEqual([])
  })

  it("handles key-only lines (value is empty string)", () => {
    const fm = "---\ntitle:\n---\n"
    // The key-only branch should produce an empty string
    expect(parseFrontmatter(fm).title).toBe("")
  })

  it("ignores lines with no colon at all", () => {
    const fm = "---\ntitle: Test\nsome garbage line\n---\n"
    const r = parseFrontmatter(fm)
    expect(r.title).toBe("Test")
    expect(Object.keys(r)).not.toContain("some garbage line")
  })

  it("handles array with extra whitespace around items", () => {
    const fm = "---\ntags: [ a ,  b ,  c ]\n---\n"
    expect(parseFrontmatter(fm).tags).toEqual(["a", "b", "c"])
  })

  it("handles 'related' as an array field", () => {
    const fm = "---\nrelated: [PageA, PageB]\n---\n"
    expect(parseFrontmatter(fm).related).toEqual(["PageA", "PageB"])
  })

  it("handles 'sources' as an array field", () => {
    const fm = "---\nsources: [doc1.pdf, doc2.docx]\n---\n"
    expect(parseFrontmatter(fm).sources).toEqual(["doc1.pdf", "doc2.docx"])
  })

  it("handles frontmatter without trailing newline after closing ---", () => {
    const fm = "---\ntitle: Test\n---"
    expect(parseFrontmatter(fm).title).toBe("Test")
  })

  it("handles arbitrary custom keys", () => {
    const fm = "---\nauthor: Alice\nversion: 2.0\n---\n"
    const r = parseFrontmatter(fm)
    expect(r.author).toBe("Alice")
    expect(r.version).toBe("2.0")
  })

  it("does not include the --- delimiter lines in the output", () => {
    const fm = "---\ntitle: T\n---\n"
    const r = parseFrontmatter(fm)
    expect(Object.keys(r)).not.toContain("---")
  })

  it("returns a complete full-featured frontmatter", () => {
    const fm = [
      "---",
      "title: My Concept",
      "type: concept",
      "created: 2024-01-15",
      "updated: 2024-06-01",
      "tags: [ai, llm, wiki]",
      "related: [PageA, PageB]",
      "sources: [paper.pdf]",
      "---",
      "",
    ].join("\n")
    const r = parseFrontmatter(fm)
    expect(r.title).toBe("My Concept")
    expect(r.type).toBe("concept")
    expect(r.created).toBe("2024-01-15")
    expect(r.updated).toBe("2024-06-01")
    expect(r.tags).toEqual(["ai", "llm", "wiki"])
    expect(r.related).toEqual(["PageA", "PageB"])
    expect(r.sources).toEqual(["paper.pdf"])
  })
})
