import { describe, it, expect } from "vitest"
import { cn } from "../utils"

describe("cn", () => {
  it("merges simple class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "active")).toBe("base active")
  })

  it("concatenates all class names (no Tailwind merge)", () => {
    const result = cn("px-2 py-1", "px-4")
    expect(result).toBe("px-2 py-1 px-4")
  })

  it("handles empty inputs", () => {
    expect(cn()).toBe("")
  })

  it("handles undefined and null", () => {
    expect(cn("a", undefined, null, "b")).toBe("a b")
  })

  it("handles array inputs spread as args", () => {
    expect(cn(...["foo", "bar"])).toBe("foo bar")
  })
})
