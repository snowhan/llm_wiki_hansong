/**
 * TDD tests for vision-related preprocess functions:
 * - readImageAsBase64DataUri  — reads image file → data URI string
 * - extractEmbeddedImages     — calls Python script → returns image paths
 * - getEmbeddedImagePaths     — returns cached image dir paths (no re-extract)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

// We import the functions under test — they don't exist yet (RED phase)
import {
  readImageAsBase64DataUri,
  getEmbeddedImageDir,
} from "../preprocess-service.js"

describe("readImageAsBase64DataUri", () => {
  let tmpDir: string
  let pngPath: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vision-test-"))
    // Write a minimal 1×1 PNG (89 bytes, valid PNG header)
    const minimalPng = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108020000009001" +
      "2e00000000c49444154789c6260000000020001e221bc330000000049454e44ae426082",
      "hex",
    )
    pngPath = path.join(tmpDir, "test.png")
    await fs.writeFile(pngPath, minimalPng)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("returns a data URI with correct mime type for PNG", async () => {
    const result = await readImageAsBase64DataUri(pngPath)
    expect(result).toMatch(/^data:image\/png;base64,/)
  })

  it("returns a data URI with correct mime type for JPG", async () => {
    const jpgPath = path.join(tmpDir, "test.jpg")
    await fs.writeFile(jpgPath, Buffer.from("ffd8ffe0", "hex"))
    const result = await readImageAsBase64DataUri(jpgPath)
    expect(result).toMatch(/^data:image\/jpeg;base64,/)
  })

  it("returns a data URI with correct mime type for WEBP", async () => {
    const webpPath = path.join(tmpDir, "test.webp")
    await fs.writeFile(webpPath, Buffer.from("52494646", "hex"))
    const result = await readImageAsBase64DataUri(webpPath)
    expect(result).toMatch(/^data:image\/webp;base64,/)
  })

  it("returns a data URI with correct mime type for GIF", async () => {
    const gifPath = path.join(tmpDir, "test.gif")
    await fs.writeFile(gifPath, Buffer.from("474946383961", "hex"))
    const result = await readImageAsBase64DataUri(gifPath)
    expect(result).toMatch(/^data:image\/gif;base64,/)
  })

  it("base64 data is non-empty", async () => {
    const result = await readImageAsBase64DataUri(pngPath)
    const base64 = result.split(",")[1]
    expect(base64.length).toBeGreaterThan(0)
  })

  it("throws if file does not exist", async () => {
    await expect(
      readImageAsBase64DataUri(path.join(tmpDir, "nonexistent.png")),
    ).rejects.toThrow()
  })
})

describe("getEmbeddedImageDir", () => {
  it("returns a path ending with .images for a PDF", () => {
    const dir = getEmbeddedImageDir("/project/sources/paper.pdf")
    expect(dir).toBe("/project/sources/paper.pdf.images")
  })

  it("returns a path ending with .images for a DOCX", () => {
    const dir = getEmbeddedImageDir("/project/sources/report.docx")
    expect(dir).toBe("/project/sources/report.docx.images")
  })

  it("path is adjacent to the source file", () => {
    const dir = getEmbeddedImageDir("/a/b/c/file.pptx")
    expect(path.dirname(dir)).toBe("/a/b/c")
  })
})
