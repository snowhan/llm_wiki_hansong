import { describe, it, expect } from "vitest"
import { templates, getTemplate } from "../templates"

describe("templates", () => {
  it("contains 5 templates", () => {
    expect(templates).toHaveLength(5)
  })

  it("has unique IDs", () => {
    const ids = templates.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  const expectedIds = ["research", "reading", "personal", "business", "general"]
  for (const id of expectedIds) {
    it(`includes template "${id}"`, () => {
      const t = templates.find((t) => t.id === id)
      expect(t).toBeDefined()
      expect(t!.name).toBeTruthy()
      expect(t!.description).toBeTruthy()
      expect(t!.icon).toBeTruthy()
      expect(t!.schema).toBeTruthy()
      expect(t!.purpose).toBeTruthy()
    })
  }

  it("each template has extraDirs as array", () => {
    for (const t of templates) {
      expect(Array.isArray(t.extraDirs)).toBe(true)
    }
  })
})

describe("getTemplate", () => {
  it("returns research template", () => {
    const t = getTemplate("research")
    expect(t.id).toBe("research")
    expect(t.name).toBe("Research")
  })

  it("returns general template", () => {
    const t = getTemplate("general")
    expect(t.id).toBe("general")
  })

  it("throws for unknown ID", () => {
    expect(() => getTemplate("nonexistent")).toThrowError('Unknown template id: "nonexistent"')
  })
})
