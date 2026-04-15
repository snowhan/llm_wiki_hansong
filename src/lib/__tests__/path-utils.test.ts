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
