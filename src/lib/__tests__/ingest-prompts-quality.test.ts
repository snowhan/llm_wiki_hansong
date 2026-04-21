/**
 * TDD prompt-quality tests for client-side ingest.ts (OPT-01, 02, 06, 07, 08).
 * Mirrors server/src/services/__tests__/ingest-prompts-quality.test.ts but for the
 * client-side prompt builders in src/lib/ingest.ts.
 */
import { describe, it, expect } from "vitest"
import {
  buildAnalysisPrompt,
  buildGenerationPrompt,
  buildSingleFilePrompt,
  buildSourceSummaryPrompt,
} from "../ingest.js"

const SRC = "report.pdf"
const GEN = () => buildGenerationPrompt("", "", "", SRC, undefined)
const GEN_WITH_INDEX = () => buildGenerationPrompt("", "", "[[foo]] — Foo", SRC, undefined)
const ANALYSIS = () => buildAnalysisPrompt("", "")
const SINGLE_ENTITY = () => buildSingleFilePrompt("wiki/sources/x/entities/foo.md", "entity", "Foo", "A foo", SRC, "")
const SINGLE_CONCEPT = () => buildSingleFilePrompt("wiki/sources/x/concepts/bar.md", "concept", "Bar", "A bar", SRC, "")
const SOURCE_SUMMARY = () => buildSourceSummaryPrompt(SRC, "", "")

// ── OPT-01: description frontmatter field ────────────────────────────────────

describe("OPT-01 (client): description frontmatter field", () => {
  it("buildGenerationPrompt frontmatter 包含 description 字段", () => {
    expect(GEN()).toContain("description:")
  })

  it("buildSingleFilePrompt entity frontmatter 包含 description 字段", () => {
    expect(SINGLE_ENTITY()).toContain("description:")
  })

  it("buildSingleFilePrompt concept frontmatter 包含 description 字段", () => {
    expect(SINGLE_CONCEPT()).toContain("description:")
  })

  it("buildSourceSummaryPrompt frontmatter 包含 description 字段", () => {
    expect(SOURCE_SUMMARY()).toContain("description:")
  })
})

// ── OPT-02: entity/concept required sections ─────────────────────────────────

describe("OPT-02 (client): entity/concept 强制 sections 模板", () => {
  it("buildGenerationPrompt Entity Rules 包含必要章节指导（背景/Background）", () => {
    expect(GEN()).toMatch(/背景|Background/)
  })

  it("buildGenerationPrompt Concept Rules 包含必要章节指导（定义/Definition）", () => {
    expect(GEN()).toMatch(/定义|Definition/)
  })

  it("buildSingleFilePrompt entity 模式包含 sections 指导", () => {
    expect(SINGLE_ENTITY()).toMatch(/背景|Background/)
  })

  it("buildSingleFilePrompt concept 模式包含 sections 指导", () => {
    expect(SINGLE_CONCEPT()).toMatch(/定义|Definition/)
  })
})

// ── OPT-06: tags/related fill guidance ───────────────────────────────────────

describe("OPT-06 (client): tags/related 填充指导", () => {
  it("buildGenerationPrompt 包含 tags 填充说明（2-5 个）", () => {
    expect(GEN()).toMatch(/2[-–]5.*tag|tag.*2[-–]5/i)
  })

  it("buildGenerationPrompt 包含 related slugs 填充说明", () => {
    expect(GEN()).toMatch(/related.*slug|slug.*related/i)
  })
})

// ── OPT-07: aliases frontmatter field & analysis guidance ────────────────────

describe("OPT-07 (client): aliases 字段", () => {
  it("buildGenerationPrompt frontmatter 模板包含 aliases 字段", () => {
    expect(GEN()).toContain("aliases:")
  })

  it("buildSingleFilePrompt frontmatter 模板包含 aliases 字段", () => {
    expect(SINGLE_ENTITY()).toContain("aliases:")
  })

  it("buildAnalysisPrompt Key Entities 包含 aliases/alternative names 提示", () => {
    expect(ANALYSIS()).toMatch(/alias|alternative name/i)
  })
})

// ── OPT-08: wikilinks guidance pointing to index/Existing pages ──────────────

describe("OPT-08 (client): wikilinks 指向 index/Existing pages", () => {
  it("buildGenerationPrompt Other rules 提示使用 wiki index 进行 wikilink", () => {
    expect(GEN()).toMatch(/wikilink.*index|index.*wikilink/i)
  })

  it("wiki index 传入时，段落注释说明用于 wikilink 交叉引用", () => {
    expect(GEN_WITH_INDEX()).toMatch(/wikilink.*cross.?reference|cross.?reference.*wikilink/i)
  })
})
