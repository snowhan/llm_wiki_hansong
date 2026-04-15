import { describe, it, expect } from "vitest"
import { tokenizeQuery } from "../search"

describe("tokenizeQuery", () => {
  it("splits English text by whitespace", () => {
    const tokens = tokenizeQuery("machine learning")
    expect(tokens).toContain("machine")
    expect(tokens).toContain("learning")
  })

  it("converts to lowercase", () => {
    const tokens = tokenizeQuery("Hello World")
    expect(tokens).toContain("hello")
    expect(tokens).toContain("world")
  })

  it("filters stop words", () => {
    const tokens = tokenizeQuery("what is the meaning of life")
    expect(tokens).not.toContain("what")
    expect(tokens).not.toContain("is")
    expect(tokens).not.toContain("the")
    expect(tokens).not.toContain("of")
    expect(tokens).toContain("meaning")
    expect(tokens).toContain("life")
  })

  it("filters Chinese stop words", () => {
    const tokens = tokenizeQuery("什么 是 了")
    expect(tokens).toHaveLength(0)
  })

  it("generates bigrams for CJK text", () => {
    const tokens = tokenizeQuery("默会知识")
    expect(tokens).toContain("默会")
    expect(tokens).toContain("会知")
    expect(tokens).toContain("知识")
    expect(tokens).toContain("默会知识")
  })

  it("generates individual CJK chars", () => {
    const tokens = tokenizeQuery("默会知识")
    expect(tokens).toContain("默")
    expect(tokens).toContain("知")
  })

  it("deduplicates tokens", () => {
    const tokens = tokenizeQuery("test test test")
    const testCount = tokens.filter((t) => t === "test").length
    expect(testCount).toBe(1)
  })

  it("handles mixed CJK and English", () => {
    const tokens = tokenizeQuery("AI 技术发展")
    expect(tokens).toContain("技术")
    expect(tokens).toContain("发展")
  })

  it("filters single-char non-CJK tokens", () => {
    const tokens = tokenizeQuery("a b c hello")
    expect(tokens).not.toContain("a")
    expect(tokens).not.toContain("b")
    expect(tokens).toContain("hello")
  })

  it("handles empty string", () => {
    expect(tokenizeQuery("")).toEqual([])
  })

  it("splits on comma", () => {
    const tokens = tokenizeQuery("foo,bar")
    expect(tokens).toContain("foo")
    expect(tokens).toContain("bar")
  })
})
