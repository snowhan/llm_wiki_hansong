import { describe, it, expect } from "vitest"
import { convertLatexToUnicode } from "../latex-to-unicode"

describe("convertLatexToUnicode", () => {
  it("converts $\\alpha$ to α", () => {
    expect(convertLatexToUnicode("$\\alpha$")).toBe("α")
  })

  it("converts $\\rightarrow$ to →", () => {
    expect(convertLatexToUnicode("$\\rightarrow$")).toBe("→")
  })

  it("converts $\\infty$ to ∞", () => {
    expect(convertLatexToUnicode("$\\infty$")).toBe("∞")
  })

  it("converts inline math with multiple commands", () => {
    const result = convertLatexToUnicode("$\\alpha + \\beta = \\gamma$")
    expect(result).toContain("α")
    expect(result).toContain("β")
    expect(result).toContain("γ")
  })

  it("converts display math $$...$$ removing delimiters", () => {
    const result = convertLatexToUnicode("$$x^2 + y^2 = z^2$$")
    expect(result).toContain("x^2 + y^2 = z^2")
    expect(result).not.toContain("$$")
  })

  it("returns unknown commands as-is", () => {
    expect(convertLatexToUnicode("$\\unknowncommand$")).toBe("\\unknowncommand")
  })

  it("handles text without LaTeX unchanged", () => {
    const plain = "Hello world, no math here"
    expect(convertLatexToUnicode(plain)).toBe(plain)
  })

  it("handles empty string", () => {
    expect(convertLatexToUnicode("")).toBe("")
  })

  it("converts Greek uppercase letters", () => {
    expect(convertLatexToUnicode("$\\Omega$")).toBe("Ω")
    expect(convertLatexToUnicode("$\\Delta$")).toBe("Δ")
  })

  it("converts math operators", () => {
    expect(convertLatexToUnicode("$\\times$")).toBe("×")
    expect(convertLatexToUnicode("$\\leq$")).toBe("≤")
    expect(convertLatexToUnicode("$\\neq$")).toBe("≠")
  })

  it("converts set operations", () => {
    expect(convertLatexToUnicode("$\\cup$")).toBe("∪")
    expect(convertLatexToUnicode("$\\cap$")).toBe("∩")
    expect(convertLatexToUnicode("$\\in$")).toBe("∈")
  })

  it("converts big operators", () => {
    expect(convertLatexToUnicode("$\\sum$")).toBe("∑")
    expect(convertLatexToUnicode("$\\prod$")).toBe("∏")
    expect(convertLatexToUnicode("$\\int$")).toBe("∫")
  })

  it("handles mixed text and LaTeX", () => {
    const result = convertLatexToUnicode("The limit is $\\infty$ and $\\alpha$ is small")
    expect(result).toBe("The limit is ∞ and α is small")
  })
})
