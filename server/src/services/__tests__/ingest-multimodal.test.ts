/**
 * TDD tests for multimodal message building in ingest-service.
 * Tests the pure helper function buildMultimodalUserContent which is
 * exported from ingest-service for testability.
 */
import { describe, it, expect } from "vitest"
import { buildMultimodalUserContent } from "../ingest-service.js"
import type { ContentPart } from "../../lib/llm-providers.js"

describe("buildMultimodalUserContent", () => {
  it("returns string content when no images provided", () => {
    const result = buildMultimodalUserContent("Analyze this document.\n\nContent here.", [])
    expect(result).toBe("Analyze this document.\n\nContent here.")
  })

  it("returns ContentPart[] when images are provided", () => {
    const images = ["data:image/png;base64,abc123"]
    const result = buildMultimodalUserContent("Analyze this.", images)
    expect(Array.isArray(result)).toBe(true)
  })

  it("first part is text with the prompt", () => {
    const result = buildMultimodalUserContent("My prompt", ["data:image/png;base64,xyz"])
    const parts = result as ContentPart[]
    expect(parts[0]).toEqual({ type: "text", text: "My prompt" })
  })

  it("subsequent parts are image_url entries", () => {
    const images = [
      "data:image/png;base64,img1",
      "data:image/jpeg;base64,img2",
    ]
    const result = buildMultimodalUserContent("Describe", images)
    const parts = result as ContentPart[]
    expect(parts).toHaveLength(3) // 1 text + 2 images
    expect(parts[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,img1", detail: "auto" },
    })
    expect(parts[2]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,img2", detail: "auto" },
    })
  })

  it("caps images at MAX_IMAGES_PER_INGEST (10)", () => {
    const manyImages = Array.from({ length: 15 }, (_, i) => `data:image/png;base64,img${i}`)
    const result = buildMultimodalUserContent("Analyze", manyImages)
    const parts = result as ContentPart[]
    // 1 text + 10 images (capped)
    expect(parts).toHaveLength(11)
  })

  it("includes truncation notice in text when images are capped", () => {
    const manyImages = Array.from({ length: 15 }, (_, i) => `data:image/png;base64,img${i}`)
    const result = buildMultimodalUserContent("Prompt", manyImages)
    const parts = result as ContentPart[]
    const textPart = parts[0] as { type: "text"; text: string }
    expect(textPart.text).toContain("15")
    expect(textPart.text).toContain("10")
  })

  it("returns string (not array) when images array is empty", () => {
    const result = buildMultimodalUserContent("Just text", [])
    expect(typeof result).toBe("string")
  })
})
