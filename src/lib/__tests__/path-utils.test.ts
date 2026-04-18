import { describe, it, expect } from "vitest"
import {
  normalizePath,
  joinPath,
  getFileName,
  getFileStem,
  getRelativePath,
} from "../path-utils"

describe("normalizePath", () => {
  it("replaces backslashes with forward slashes", () => {
    expect(normalizePath("C:\\Users\\foo\\bar")).toBe("C:/Users/foo/bar")
  })

  it("keeps forward slashes unchanged", () => {
    expect(normalizePath("/Users/foo/bar")).toBe("/Users/foo/bar")
  })

  it("handles mixed separators", () => {
    expect(normalizePath("C:\\Users/foo\\bar")).toBe("C:/Users/foo/bar")
  })

  it("handles empty string", () => {
    expect(normalizePath("")).toBe("")
  })

  it("handles single component", () => {
    expect(normalizePath("file.txt")).toBe("file.txt")
  })
})

describe("joinPath", () => {
  it("joins two segments", () => {
    expect(joinPath("/Users", "foo")).toBe("/Users/foo")
  })

  it("joins multiple segments", () => {
    expect(joinPath("/a", "b", "c", "d")).toBe("/a/b/c/d")
  })

  it("normalizes backslashes", () => {
    expect(joinPath("C:\\Users", "foo")).toBe("C:/Users/foo")
  })

  it("collapses double slashes", () => {
    expect(joinPath("/Users/", "/foo")).toBe("/Users/foo")
  })

  it("handles empty segments", () => {
    expect(joinPath("a", "", "b")).toBe("a/b")
  })
})

describe("getFileName", () => {
  it("extracts filename from Unix path", () => {
    expect(getFileName("/Users/foo/bar.txt")).toBe("bar.txt")
  })

  it("extracts filename from Windows path", () => {
    expect(getFileName("C:\\Users\\foo\\bar.txt")).toBe("bar.txt")
  })

  it("returns filename if no directory", () => {
    expect(getFileName("bar.txt")).toBe("bar.txt")
  })

  it("handles path ending with slash", () => {
    expect(getFileName("/Users/foo/")).toBe("")
  })
})

describe("getFileStem", () => {
  it("removes .md extension", () => {
    expect(getFileStem("notes.md")).toBe("notes")
  })

  it("removes .txt extension from path", () => {
    expect(getFileStem("/path/to/file.txt")).toBe("file")
  })

  it("keeps name when no extension", () => {
    expect(getFileStem("Makefile")).toBe("Makefile")
  })

  it("handles dotfiles (keeps leading dot)", () => {
    expect(getFileStem(".gitignore")).toBe(".gitignore")
  })

  it("handles multiple dots", () => {
    expect(getFileStem("archive.tar.gz")).toBe("archive.tar")
  })
})

describe("getRelativePath", () => {
  it("strips base from full path", () => {
    expect(getRelativePath("/proj/wiki/foo.md", "/proj")).toBe("wiki/foo.md")
  })

  it("handles trailing slash on base", () => {
    expect(getRelativePath("/proj/wiki/foo.md", "/proj/")).toBe("wiki/foo.md")
  })

  it("returns full path when base does not match", () => {
    expect(getRelativePath("/other/file.md", "/proj")).toBe("/other/file.md")
  })

  it("handles Windows paths", () => {
    expect(getRelativePath("C:\\proj\\wiki\\foo.md", "C:\\proj")).toBe(
      "wiki/foo.md",
    )
  })
})

// ── splitFrontmatter ──────────────────────────────────────────────────────

import { splitFrontmatter } from "../path-utils"

describe("splitFrontmatter", () => {
  it("returns empty strings for empty input", () => {
    const r = splitFrontmatter("")
    expect(r.frontmatter).toBe("")
    expect(r.body).toBe("")
  })

  it("returns body only when there is no frontmatter", () => {
    const r = splitFrontmatter("# Hello\n\nWorld")
    expect(r.frontmatter).toBe("")
    expect(r.body).toBe("# Hello\n\nWorld")
  })

  it("parses standard --- delimited frontmatter", () => {
    const content = "---\ntitle: Test\n---\n# Body"
    const r = splitFrontmatter(content)
    expect(r.frontmatter).toContain("title: Test")
    expect(r.body).toBe("# Body")
  })

  it("includes delimiter lines in frontmatter", () => {
    const content = "---\ntitle: Test\n---\nBody"
    const r = splitFrontmatter(content)
    expect(r.frontmatter.startsWith("---")).toBe(true)
  })

  it("handles CRLF line endings", () => {
    const content = "---\r\ntitle: Test\r\n---\r\n# Body"
    const r = splitFrontmatter(content)
    expect(r.frontmatter).toContain("title: Test")
    expect(r.body).toContain("Body")
  })

  it("handles trailing spaces on --- delimiters", () => {
    const content = "---  \ntitle: Test\n---  \n# Body"
    const r = splitFrontmatter(content)
    expect(r.frontmatter).toContain("title: Test")
    expect(r.body).toContain("Body")
  })

  it("parses multi-field frontmatter", () => {
    const content = "---\ntitle: Test\ntype: concept\ntags: [a, b]\n---\nBody text"
    const r = splitFrontmatter(content)
    expect(r.frontmatter).toContain("title: Test")
    expect(r.frontmatter).toContain("type: concept")
    expect(r.body).toBe("Body text")
  })

  it("handles unclosed frontmatter (2+ YAML lines at start)", () => {
    const content = "title: Test\ntype: concept\n\n# Body"
    const r = splitFrontmatter(content)
    // Should synthesise --- wrapper
    expect(r.frontmatter).toContain("title: Test")
    expect(r.frontmatter).toContain("---")
    expect(r.body).toContain("Body")
  })

  it("does NOT parse single YAML line as frontmatter (avoids false positives)", () => {
    const content = "title: Test\n\n# Body"
    const r = splitFrontmatter(content)
    // Only one YAML line — should not be treated as frontmatter
    expect(r.frontmatter).toBe("")
    expect(r.body).toContain("title: Test")
  })

  it("handles content with no trailing newline after closing ---", () => {
    const content = "---\ntitle: Foo\n---"
    const r = splitFrontmatter(content)
    expect(r.frontmatter).toContain("title: Foo")
    expect(r.body).toBe("")
  })

  it("preserves body content exactly", () => {
    const body = "# Heading\n\nParagraph with **bold** and _italic_."
    const content = `---\ntitle: T\n---\n${body}`
    const r = splitFrontmatter(content)
    expect(r.body).toBe(body)
  })
})
