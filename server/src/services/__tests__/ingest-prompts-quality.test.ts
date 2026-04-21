/**
 * TDD prompt-quality tests for OPT-01 to OPT-09.
 * Each test validates that the prompt builder functions include the required
 * content after the quality-improvement refactor.
 *
 * Tests are intentionally FAILING until the corresponding implementation is done.
 */
import { describe, it, expect } from "vitest"
import {
  buildAnalysisPrompt,
  buildGenerationPrompt,
  buildSingleFilePrompt,
  buildSourceSummaryPrompt,
  buildMergeContentPrompt,
} from "../ingest-service.js"

const SRC = "report.pdf"
const GEN = () => buildGenerationPrompt("", "", "", SRC, undefined)
const GEN_WITH_PATHS = () => buildGenerationPrompt("", "", "[[foo]] — Foo", SRC, undefined)
const ANALYSIS = () => buildAnalysisPrompt("", "")
const SINGLE_ENTITY = () => buildSingleFilePrompt("wiki/sources/x/entities/foo.md", "entity", "Foo", "A foo", SRC, "")
const SINGLE_CONCEPT = () => buildSingleFilePrompt("wiki/sources/x/concepts/bar.md", "concept", "Bar", "A bar", SRC, "")
const SOURCE_SUMMARY = () => buildSourceSummaryPrompt(SRC, "", "")
const MERGE = () => buildMergeContentPrompt(
  [{ path: "wiki/sources/A/entities/foo.md", content: "c1" }],
  "wiki/sources/A/entities/foo.md",
)

// ── OPT-01: description frontmatter field ────────────────────────────────────

describe("OPT-01: description frontmatter field", () => {
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

describe("OPT-02: entity/concept 强制 sections 模板", () => {
  it("buildGenerationPrompt Entity Rules 包含必要章节指导（背景/Background）", () => {
    const p = GEN()
    expect(p).toMatch(/背景|Background/)
  })

  it("buildGenerationPrompt Concept Rules 包含必要章节指导（定义/Definition）", () => {
    const p = GEN()
    expect(p).toMatch(/定义|Definition/)
  })

  it("buildSingleFilePrompt entity 模式包含 sections 指导", () => {
    expect(SINGLE_ENTITY()).toMatch(/背景|Background/)
  })

  it("buildSingleFilePrompt concept 模式包含 sections 指导", () => {
    expect(SINGLE_CONCEPT()).toMatch(/定义|Definition/)
  })
})

// ── OPT-03: server buildGenerationPrompt 不再生成 overview.md ─────────────────

describe("OPT-03: server buildGenerationPrompt 移除 overview 生成指令", () => {
  it("Generate 列表不再包含 wiki/overview.md", () => {
    expect(GEN()).not.toContain("wiki/overview.md")
  })

  it("Generate 列表不再包含 'An updated wiki/overview'", () => {
    expect(GEN()).not.toMatch(/updated wiki\/overview/)
  })
})

// ── OPT-06: tags/related fill guidance ───────────────────────────────────────

describe("OPT-06: tags/related 填充指导", () => {
  it("buildGenerationPrompt 包含 tags 填充说明（2-5 个）", () => {
    expect(GEN()).toMatch(/2[-–]5.*tag|tag.*2[-–]5/i)
  })

  it("buildGenerationPrompt 包含 related slugs 填充说明", () => {
    expect(GEN()).toMatch(/related.*slug|slug.*related/i)
  })
})

// ── OPT-07: aliases frontmatter field & analysis guidance ────────────────────

describe("OPT-07: aliases 字段", () => {
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

// ── OPT-08: wikilinks guidance pointing to Existing pages ────────────────────

describe("OPT-08: wikilinks 指向 Existing pages 列表", () => {
  it("buildGenerationPrompt Other rules 提示使用 Existing pages 进行 wikilink", () => {
    expect(GEN()).toMatch(/Existing pages.*wikilink|wikilink.*Existing pages/i)
  })

  it("existingSourcePaths 传入时，段落注释说明用于 wikilink 交叉引用", () => {
    expect(GEN_WITH_PATHS()).toMatch(/wikilink.*cross.?reference|cross.?reference.*wikilink/i)
  })
})

// ── OPT-09: buildMergeContentPrompt tags/related union ───────────────────────

describe("OPT-09: buildMergeContentPrompt tags/related 并集", () => {
  it("Merge Rules 包含 tags union 指令", () => {
    expect(MERGE()).toMatch(/tags.*union|union.*tags/i)
  })

  it("Merge Rules 包含 related union 指令", () => {
    expect(MERGE()).toMatch(/related.*union|union.*related/i)
  })
})
