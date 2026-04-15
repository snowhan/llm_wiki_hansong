import { describe, it, expect } from "vitest"
import { detectLanguage } from "../detect-language"

describe("detectLanguage", () => {
  it("detects Chinese text", () => {
    expect(detectLanguage("这是一个中文句子")).toBe("Chinese")
  })

  it("detects Japanese (hiragana/katakana)", () => {
    expect(detectLanguage("これは日本語のテストです")).toBe("Japanese")
  })

  it("detects Korean", () => {
    expect(detectLanguage("이것은 한국어 테스트입니다")).toBe("Korean")
  })

  it("detects Arabic", () => {
    expect(detectLanguage("هذا اختبار باللغة العربية")).toBe("Arabic")
  })

  it("detects Russian (Cyrillic)", () => {
    expect(detectLanguage("Это тестовое предложение на русском")).toBe("Russian")
  })

  it("detects Thai", () => {
    expect(detectLanguage("นี่คือข้อความทดสอบ")).toBe("Thai")
  })

  it("detects Hindi (Devanagari)", () => {
    expect(detectLanguage("यह एक हिंदी वाक्य है")).toBe("Hindi")
  })

  it("detects Greek", () => {
    expect(detectLanguage("Αυτή είναι μια δοκιμή στα ελληνικά")).toBe("Greek")
  })

  it("defaults to English for pure ASCII", () => {
    expect(detectLanguage("This is a test sentence")).toBe("English")
  })

  it("defaults to English for empty string", () => {
    expect(detectLanguage("")).toBe("English")
  })

  it("detects German with diacritics and keywords", () => {
    expect(detectLanguage("Das ist ein schöner Tag und die Sonne scheint")).toBe("German")
  })

  it("detects French with diacritics and keywords", () => {
    expect(detectLanguage("Le chat est sur la table et les enfants jouent")).toBe("French")
  })

  it("detects Spanish", () => {
    expect(detectLanguage("El gato del vecino que busca los ratones por las calles")).toBe("Spanish")
  })

  it("detects Vietnamese with distinctive diacritics", () => {
    expect(detectLanguage("Đây là một bài kiểm tra tiếng Việt")).toBe("Vietnamese")
  })

  it("detects Hebrew", () => {
    expect(detectLanguage("זוהי בדיקה בעברית")).toBe("Hebrew")
  })

  it("handles mixed text (non-Latin dominant)", () => {
    const result = detectLanguage("Hello 你好世界")
    expect(result).toBe("Chinese")
  })
})
