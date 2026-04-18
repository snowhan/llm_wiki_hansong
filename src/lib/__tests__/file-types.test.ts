import { describe, it, expect } from "vitest"
import {
  getFileCategory,
  isTextReadable,
  isBinary,
  getCodeLanguage,
} from "../file-types"

describe("getFileCategory", () => {
  it("returns markdown for .md", () => {
    expect(getFileCategory("readme.md")).toBe("markdown")
  })

  it("returns markdown for .mdx", () => {
    expect(getFileCategory("page.mdx")).toBe("markdown")
  })

  it("returns text for .txt", () => {
    expect(getFileCategory("notes.txt")).toBe("text")
  })

  it("returns code for .ts", () => {
    expect(getFileCategory("index.ts")).toBe("code")
  })

  it("returns code for .py", () => {
    expect(getFileCategory("script.py")).toBe("code")
  })

  it("returns code for .rs", () => {
    expect(getFileCategory("main.rs")).toBe("code")
  })

  it("returns image for .png", () => {
    expect(getFileCategory("photo.png")).toBe("image")
  })

  it("returns image for .jpg", () => {
    expect(getFileCategory("photo.jpg")).toBe("image")
  })

  it("returns video for .mp4", () => {
    expect(getFileCategory("video.mp4")).toBe("video")
  })

  it("returns audio for .mp3", () => {
    expect(getFileCategory("song.mp3")).toBe("audio")
  })

  it("returns pdf for .pdf", () => {
    expect(getFileCategory("paper.pdf")).toBe("pdf")
  })

  it("returns document for .docx", () => {
    expect(getFileCategory("report.docx")).toBe("document")
  })

  it("returns data for .json", () => {
    expect(getFileCategory("data.json")).toBe("data")
  })

  it("returns data for .csv", () => {
    expect(getFileCategory("data.csv")).toBe("data")
  })

  it("returns data for .yaml", () => {
    expect(getFileCategory("config.yaml")).toBe("data")
  })

  it("returns unknown for unrecognized extension", () => {
    expect(getFileCategory("file.xyz")).toBe("unknown")
  })

  it("handles full path", () => {
    expect(getFileCategory("/path/to/file.ts")).toBe("code")
  })

  it("handles case-insensitive extension", () => {
    expect(getFileCategory("FILE.MD")).toBe("markdown")
  })
})

describe("isTextReadable", () => {
  it("returns true for markdown", () => {
    expect(isTextReadable("markdown")).toBe(true)
  })

  it("returns true for text", () => {
    expect(isTextReadable("text")).toBe(true)
  })

  it("returns true for code", () => {
    expect(isTextReadable("code")).toBe(true)
  })

  it("returns true for data", () => {
    expect(isTextReadable("data")).toBe(true)
  })

  it("returns false for image", () => {
    expect(isTextReadable("image")).toBe(false)
  })

  it("returns false for video", () => {
    expect(isTextReadable("video")).toBe(false)
  })
})

describe("isBinary", () => {
  it("returns true for image", () => {
    expect(isBinary("image")).toBe(true)
  })

  it("returns true for video", () => {
    expect(isBinary("video")).toBe(true)
  })

  it("returns true for audio", () => {
    expect(isBinary("audio")).toBe(true)
  })

  it("returns true for document", () => {
    expect(isBinary("document")).toBe(true)
  })

  it("returns true for unknown", () => {
    expect(isBinary("unknown")).toBe(true)
  })

  it("returns false for markdown", () => {
    expect(isBinary("markdown")).toBe(false)
  })

  it("returns false for code", () => {
    expect(isBinary("code")).toBe(false)
  })
})

describe("getCodeLanguage", () => {
  it("maps .ts to typescript", () => {
    expect(getCodeLanguage("file.ts")).toBe("typescript")
  })

  it("maps .py to python", () => {
    expect(getCodeLanguage("file.py")).toBe("python")
  })

  it("maps .rs to rust", () => {
    expect(getCodeLanguage("file.rs")).toBe("rust")
  })

  it("maps .go to go", () => {
    expect(getCodeLanguage("file.go")).toBe("go")
  })

  it("maps .sh to bash", () => {
    expect(getCodeLanguage("script.sh")).toBe("bash")
  })

  it("maps .json to json", () => {
    expect(getCodeLanguage("data.json")).toBe("json")
  })

  it("falls back to raw extension for unknown", () => {
    expect(getCodeLanguage("file.lua")).toBe("lua")
  })
})

// ── needsPreprocess ───────────────────────────────────────────────────────

import { needsPreprocess } from "../file-types"

describe("needsPreprocess", () => {
  it("returns true for pdf", () => {
    expect(needsPreprocess("pdf")).toBe(true)
  })

  it("returns true for document", () => {
    expect(needsPreprocess("document")).toBe(true)
  })

  it("returns false for markdown", () => {
    expect(needsPreprocess("markdown")).toBe(false)
  })

  it("returns false for text", () => {
    expect(needsPreprocess("text")).toBe(false)
  })

  it("returns false for code", () => {
    expect(needsPreprocess("code")).toBe(false)
  })

  it("returns false for image", () => {
    expect(needsPreprocess("image")).toBe(false)
  })

  it("returns false for data", () => {
    expect(needsPreprocess("data")).toBe(false)
  })

  it("returns false for unknown", () => {
    expect(needsPreprocess("unknown")).toBe(false)
  })

  it("pdf file path → needsPreprocess via getFileCategory", () => {
    expect(needsPreprocess(getFileCategory("report.pdf"))).toBe(true)
  })

  it("docx file path → needsPreprocess via getFileCategory", () => {
    expect(needsPreprocess(getFileCategory("slides.pptx"))).toBe(true)
  })

  it("md file path → not needsPreprocess via getFileCategory", () => {
    expect(needsPreprocess(getFileCategory("notes.md"))).toBe(false)
  })
})
