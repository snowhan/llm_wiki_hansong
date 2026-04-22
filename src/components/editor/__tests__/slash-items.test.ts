import { describe, it, expect } from "vitest"
import { SLASH_ITEMS, filterSlashItems } from "../slash-items"

describe("SLASH_ITEMS", () => {
  it("has at least 8 items", () => {
    expect(SLASH_ITEMS.length).toBeGreaterThanOrEqual(8)
  })

  it("every item has required fields", () => {
    for (const item of SLASH_ITEMS) {
      expect(item.id).toBeTruthy()
      expect(item.label).toBeTruthy()
      expect(item.group).toBeTruthy()
      expect(typeof item.command).toBe("function")
    }
  })

  it("includes heading items", () => {
    const headings = SLASH_ITEMS.filter((i) => i.group === "heading")
    expect(headings.length).toBeGreaterThanOrEqual(3)
  })

  it("includes list items", () => {
    const lists = SLASH_ITEMS.filter((i) => i.group === "list")
    expect(lists.length).toBeGreaterThanOrEqual(2)
  })

  it("T-013: no item has group 'media' (dead group cleanup)", () => {
    const mediaItems = SLASH_ITEMS.filter((i) => i.group === ("media" as string))
    expect(mediaItems).toHaveLength(0)
  })
})

describe("filterSlashItems", () => {
  it("returns all items for empty query", () => {
    expect(filterSlashItems("")).toHaveLength(SLASH_ITEMS.length)
  })

  it("filters by label (case-insensitive)", () => {
    const results = filterSlashItems("标题")
    expect(results.length).toBeGreaterThan(0)
    results.forEach((r) => {
      const text = [r.label, r.description ?? "", ...(r.keywords ?? [])].join(" ").toLowerCase()
      expect(text).toMatch(/标题/)
    })
  })

  it("filters by English keyword", () => {
    const results = filterSlashItems("h1")
    expect(results.length).toBeGreaterThan(0)
  })

  it("returns empty for unmatched query", () => {
    const results = filterSlashItems("zzz_no_match_999")
    expect(results).toHaveLength(0)
  })
})
