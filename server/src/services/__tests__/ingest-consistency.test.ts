/**
 * ingest-consistency.test.ts
 *
 * 假设大模型返回内容本身是正确的，验证以下一致性不变量：
 *   1. parseFileBlocks  — LLM 输出解析的正确性与边界
 *   2. normFrontmatter  — frontmatter 规范化
 *   3. buildAllowedPaths — 路径白名单
 *   4. 文件名 ↔ title（frontmatter）一致性
 *   5. sources 字段 ↔ 所在目录的 sourceBase 一致性
 *   6. type 字段 ↔ 目录类型 (entities/concepts) 一致性
 *   7. 内容非空、非串台（无跨源污染）
 *   8. writeBlocks 路径隔离 & 幂等性（通过 fs mock）
 *
 * 覆盖用例 C-01 ~ C-60（见各 describe 说明）
 */

import * as nodePath from "node:path"
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  parseFileBlocks,
  normFrontmatter,
  buildAllowedPaths,
  isTitleFilenameConsistent,
  isBodyTitleSemanticallyConsistent,
  parsePlan,
  evaluatePlannedCountGate,
  ensureCanonicalTitleType,
  setFmField,
} from "../ingest-service.js"
import { loadFixturesWithFallback } from "./fixtures/fixture-loader.js"

// ─── YAML frontmatter helpers ─────────────────────────────────────────────

/** 从 markdown 字符串中提取 frontmatter 对象 */
function parseFrontmatter(md: string): Record<string, unknown> {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!m) return {}
  const result: Record<string, unknown> = {}
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":")
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let val: unknown = line.slice(idx + 1).trim()
    // 解析简单数组 ["a", "b"] or [a, b]
    if (typeof val === "string" && val.startsWith("[") && val.endsWith("]")) {
      val = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
    }
    result[key] = val
  }
  return result
}

/** 从文件相对路径提取 basename（无扩展名） */
function basename(relPath: string): string {
  const parts = relPath.split("/")
  const file = parts[parts.length - 1]
  return file.replace(/\.md$/, "")
}

/** 从文件相对路径提取 sourceBase（wiki/sources/<sourceBase>/... 中的第3段） */
function sourceBaseFromPath(relPath: string): string | null {
  // wiki/sources/<sourceBase>/... or wiki/sources/<sourceBase>.md
  const m = relPath.match(/^wiki\/sources\/([^/]+?)(?:\.md|\/|$)/)
  return m ? m[1] : null
}

/** 从文件相对路径推断期望的 type 值 */
function expectedTypeFromPath(relPath: string): string | null {
  if (relPath.includes("/entities/")) return "entity"
  if (relPath.includes("/concepts/")) return "concept"
  return null
}

// ─── 一致性断言工具 ────────────────────────────────────────────────────────

/**
 * 给定 writeBlocks 产出的 blocks，检查所有 MD 文件满足一致性不变量。
 * 返回违规列表，为空则全部通过。
 */
function checkConsistency(
  blocks: Array<{ path: string; content: string }>,
): string[] {
  const violations: string[] = []

  for (const { path: relPath, content } of blocks) {
    if (!relPath.endsWith(".md")) continue
    if (relPath === "wiki/log.md" || relPath.endsWith("/log.md")) continue
    if (relPath === "wiki/overview.md") continue

    const normed = normFrontmatter(content)
    const fm = parseFrontmatter(normed)
    const name = basename(relPath)
    const srcBase = sourceBaseFromPath(relPath)
    const expectedType = expectedTypeFromPath(relPath)

    // INV-1: title 必须存在
    if (!fm.title) {
      violations.push(`[INV-1] 缺少 title: ${relPath}`)
      continue
    }

    // INV-2: 文件名与 title 一致（忽略大小写，忽略首尾空格）
    const titleStr = String(fm.title).trim()
    if (name.toLowerCase() !== titleStr.toLowerCase()) {
      violations.push(
        `[INV-2] 文件名与 title 不匹配: path="${relPath}" title="${titleStr}"`,
      )
    }

    // INV-3: sources 数组中至少有一项，且每项必须包含 sourceBase
    const sources = fm.sources as string[] | undefined
    if (!sources || sources.length === 0) {
      violations.push(`[INV-3] 缺少 sources 字段: ${relPath}`)
    } else if (srcBase) {
      const hasMatchingSource = sources.some((s) => s.includes(srcBase))
      if (!hasMatchingSource) {
        violations.push(
          `[INV-3] sources 与路径不匹配: path="${relPath}" sources=[${sources.join(", ")}] expected sourceBase="${srcBase}"`,
        )
      }
    }

    // INV-4: type 字段与目录名一致
    if (expectedType && fm.type !== expectedType) {
      violations.push(
        `[INV-4] type 与目录不匹配: path="${relPath}" type="${fm.type}" expectedType="${expectedType}"`,
      )
    }

    // INV-5: 正文内容非空（frontmatter 之后必须有内容）
    const bodyStart = normed.indexOf("---", 3)
    const body = bodyStart !== -1 ? normed.slice(bodyStart + 3).trim() : normed.trim()
    if (!body) {
      violations.push(`[INV-5] 正文为空: ${relPath}`)
    }
  }

  return violations
}

// ══════════════════════════════════════════════════════════════════════════════
// PART 1: parseFileBlocks
// ══════════════════════════════════════════════════════════════════════════════

describe("parseFileBlocks", () => {
  // C-01
  it("C-01 正常单个块", () => {
    const input = `---FILE: wiki/sources/s/entities/韩松.md---
---
title: 韩松
type: entity
---

韩松是体检报告中的受检者。
---END FILE---`
    const blocks = parseFileBlocks(input)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].path).toBe("wiki/sources/s/entities/韩松.md")
    expect(blocks[0].content).toContain("韩松是体检报告中的受检者")
  })

  // C-02
  it("C-02 正常多个块，顺序保留", () => {
    const input = `---FILE: wiki/sources/s/entities/甲.md---
content A
---END FILE---
---FILE: wiki/sources/s/entities/乙.md---
content B
---END FILE---`
    const blocks = parseFileBlocks(input)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].path).toBe("wiki/sources/s/entities/甲.md")
    expect(blocks[1].path).toBe("wiki/sources/s/entities/乙.md")
  })

  // C-03
  it("C-03 缺少 ---END FILE--- 时，下一个 ---FILE: 作为隐式终止符，内容不跨块", () => {
    const input = `---FILE: wiki/sources/s/entities/甲.md---
内容 A
---FILE: wiki/sources/s/entities/乙.md---
内容 B
---END FILE---`
    const blocks = parseFileBlocks(input)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].content).toContain("内容 A")
    expect(blocks[0].content).not.toContain("内容 B")
    expect(blocks[1].content).toContain("内容 B")
    expect(blocks[1].content).not.toContain("内容 A")
  })

  // C-04
  it("C-04 所有块都缺少 ---END FILE---（尾部 flush）", () => {
    const input = `---FILE: wiki/sources/s/entities/甲.md---
内容甲
---FILE: wiki/sources/s/entities/乙.md---
内容乙`
    const blocks = parseFileBlocks(input)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].content.trim()).toBe("内容甲")
    expect(blocks[1].content.trim()).toBe("内容乙")
  })

  // C-05
  it("C-05 文件路径首尾空格被 trim", () => {
    const input = `---FILE:   wiki/sources/s/concepts/foo.md   ---
bar
---END FILE---`
    const blocks = parseFileBlocks(input)
    expect(blocks[0].path).toBe("wiki/sources/s/concepts/foo.md")
  })

  // C-06
  it("C-06 内容为空的块解析为空字符串", () => {
    const input = `---FILE: wiki/sources/s/entities/empty.md---
---END FILE---`
    const blocks = parseFileBlocks(input)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].content.trim()).toBe("")
  })

  // C-07
  it("C-07 无任何块时返回空数组", () => {
    expect(parseFileBlocks("")).toHaveLength(0)
    expect(parseFileBlocks("随机文本")).toHaveLength(0)
  })

  // C-08
  it("C-08 内容中含有三连破折号但非 FILE 标记时不误识别", () => {
    const input = `---FILE: wiki/sources/s/entities/test.md---
---
title: test
---
正文
---END FILE---`
    const blocks = parseFileBlocks(input)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].content).toContain("title: test")
    expect(blocks[0].content).toContain("正文")
  })

  // C-09
  it("C-09 连续多块中混用有/无 ---END FILE---", () => {
    const input = `---FILE: a.md---
A
---FILE: b.md---
B
---END FILE---
---FILE: c.md---
C`
    const blocks = parseFileBlocks(input)
    expect(blocks).toHaveLength(3)
    expect(blocks[0].content.trim()).toBe("A")
    expect(blocks[1].content.trim()).toBe("B")
    expect(blocks[2].content.trim()).toBe("C")
  })

  // C-10
  it("C-10 同一路径出现两次时，解析出两个 block（调用方去重）", () => {
    const input = `---FILE: wiki/sources/s/entities/韩松.md---
v1
---END FILE---
---FILE: wiki/sources/s/entities/韩松.md---
v2
---END FILE---`
    const blocks = parseFileBlocks(input)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].content.trim()).toBe("v1")
    expect(blocks[1].content.trim()).toBe("v2")
  })

  // C-11
  it("C-11 路径包含中文和空格时正常解析", () => {
    const input = `---FILE: wiki/sources/2023体检报告/entities/韩 松.md---
data
---END FILE---`
    const blocks = parseFileBlocks(input)
    expect(blocks[0].path).toBe("wiki/sources/2023体检报告/entities/韩 松.md")
  })

  // C-12
  it("C-12 大量块（100个）解析完整，无内容泄漏", () => {
    const n = 100
    const lines: string[] = []
    for (let i = 0; i < n; i++) {
      lines.push(`---FILE: wiki/sources/s/entities/item${i}.md---`)
      lines.push(`content_${i}`)
      lines.push("---END FILE---")
    }
    const blocks = parseFileBlocks(lines.join("\n"))
    expect(blocks).toHaveLength(n)
    for (let i = 0; i < n; i++) {
      expect(blocks[i].content.trim()).toBe(`content_${i}`)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 2: normFrontmatter
// ══════════════════════════════════════════════════════════════════════════════

describe("normFrontmatter", () => {
  // C-13
  it("C-13 已有 --- 分隔符时不重复添加", () => {
    const input = `---
title: 韩松
---

正文`
    expect(normFrontmatter(input)).toBe(input)
  })

  // C-14
  it("C-14 无 --- 但有 key: value 块时自动添加", () => {
    const input = `title: 韩松
type: entity
sources: ["2023体检报告.pdf"]

正文`
    const result = normFrontmatter(input)
    expect(result).toMatch(/^---\n/)
    expect(result).toContain("title: 韩松")
    expect(result).toContain("---\n")
  })

  // C-15
  it("C-15 已有 --- 分隔符（Windows 换行 \\r\\n）时不重复添加", () => {
    const input = "---\r\ntitle: t\r\n---\r\n\r\n内容"
    const result = normFrontmatter(input)
    // 不应再多出一层 ---
    const count = (result.match(/^---/gm) || []).length
    expect(count).toBeLessThanOrEqual(2)
  })

  // C-16
  it("C-16 纯正文（无 frontmatter）时原样返回", () => {
    const input = "这是纯文本内容"
    expect(normFrontmatter(input)).toBe(input)
  })

  // C-17
  it("C-17 只有一行 key: value 时不触发规范化（需≥2行）", () => {
    const input = "title: 只有一行\n\n正文"
    // 只有一行 key:value 不满足 {2,} 条件，保持原样
    const result = normFrontmatter(input)
    expect(result).toBe(input)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 3: buildAllowedPaths
// ══════════════════════════════════════════════════════════════════════════════

describe("buildAllowedPaths", () => {
  // C-18
  it("C-18 包含 sourceBase.md、log.md、overview.md", () => {
    const allowed = buildAllowedPaths("2023体检报告")
    expect(allowed.has("wiki/sources/2023体检报告.md")).toBe(true)
    expect(allowed.has("wiki/log.md")).toBe(true)
    expect(allowed.has("wiki/overview.md")).toBe(true)
  })

  // C-19
  it("C-19 不包含 wiki/index.md", () => {
    const allowed = buildAllowedPaths("2023体检报告")
    expect(allowed.has("wiki/index.md")).toBe(false)
  })

  // C-20
  it("C-20 不包含其他 source 的路径", () => {
    const allowed = buildAllowedPaths("2023体检报告")
    expect(allowed.has("wiki/sources/2024体检报告.md")).toBe(false)
    expect(allowed.has("wiki/sources/2024体检报告/entities/韩松.md")).toBe(false)
  })

  // C-21
  it("C-21 不同 sourceBase 产生不同允许集合", () => {
    const a = buildAllowedPaths("A")
    const b = buildAllowedPaths("B")
    expect(a.has("wiki/sources/A.md")).toBe(true)
    expect(a.has("wiki/sources/B.md")).toBe(false)
    expect(b.has("wiki/sources/B.md")).toBe(true)
    expect(b.has("wiki/sources/A.md")).toBe(false)
  })

  // C-22
  it("C-22 sourceBase 含特殊字符时路径构造正确", () => {
    const allowed = buildAllowedPaths("my source (v2)")
    expect(allowed.has("wiki/sources/my source (v2).md")).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 4: 文件名 ↔ title 一致性（checkConsistency 工具）
// ══════════════════════════════════════════════════════════════════════════════

describe("文件名 ↔ title 一致性", () => {
  // C-23
  it("C-23 文件名与 title 完全一致时无违规", () => {
    const blocks = [
      {
        path: "wiki/sources/2023体检报告/entities/韩松.md",
        content: `---
title: 韩松
type: entity
sources: ["2023体检报告.pdf"]
---

韩松是受检者。`,
      },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })

  // C-24
  it("C-24 文件名大小写不同但 title 匹配时无违规", () => {
    const blocks = [
      {
        path: "wiki/sources/src/entities/ABC.md",
        content: `---
title: abc
type: entity
sources: ["src"]
---

内容`,
      },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })

  // C-25
  it("C-25 文件名与 title 不匹配时报 INV-2", () => {
    const blocks = [
      {
        path: "wiki/sources/2023体检报告/entities/韩松.md",
        content: `---
title: 珠海奥乐医院
type: entity
sources: ["2023体检报告.pdf"]
---

这是医院信息。`,
      },
    ]
    const violations = checkConsistency(blocks)
    expect(violations.some((v) => v.includes("INV-2"))).toBe(true)
  })

  // C-26
  it("C-26 title 包含首尾空格时 trim 后仍能匹配", () => {
    const blocks = [
      {
        path: "wiki/sources/s/entities/foo.md",
        content: `---
title:   foo  
type: entity
sources: ["s"]
---

内容`,
      },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })

  // C-27
  it("C-27 缺少 title 时报 INV-1", () => {
    const blocks = [
      {
        path: "wiki/sources/s/entities/foo.md",
        content: `---
type: entity
sources: ["s"]
---

内容`,
      },
    ]
    const violations = checkConsistency(blocks)
    expect(violations.some((v) => v.includes("INV-1"))).toBe(true)
  })

  // C-28
  it("C-28 多个块混合正确/错误时精确报告违规项", () => {
    const blocks = [
      {
        path: "wiki/sources/s/entities/正确.md",
        content: `---
title: 正确
type: entity
sources: ["s"]
---

内容`,
      },
      {
        path: "wiki/sources/s/entities/正确2.md",
        content: `---
title: 错误title
type: entity
sources: ["s"]
---

内容`,
      },
    ]
    const violations = checkConsistency(blocks)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("正确2.md")
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 5: sources 字段 ↔ sourceBase 一致性
// ══════════════════════════════════════════════════════════════════════════════

describe("sources 字段 ↔ sourceBase 一致性", () => {
  // C-29
  it("C-29 sources 包含正确的 sourceBase 时无违规", () => {
    const blocks = [
      {
        path: "wiki/sources/2025体检报告/entities/韩松.md",
        content: `---
title: 韩松
type: entity
sources: ["2025体检报告.pdf"]
---

内容`,
      },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })

  // C-30（跨源污染核心场景）
  it("C-30 sources 引用错误年份（跨源污染）时报 INV-3", () => {
    const blocks = [
      {
        path: "wiki/sources/2023体检报告/entities/韩松.md",
        content: `---
title: 韩松
type: entity
sources: ["2025体检报告.pdf"]
---

内容`,
      },
    ]
    const violations = checkConsistency(blocks)
    expect(violations.some((v) => v.includes("INV-3"))).toBe(true)
  })

  // C-31
  it("C-31 sources 为空数组时报 INV-3", () => {
    const blocks = [
      {
        path: "wiki/sources/s/entities/foo.md",
        content: `---
title: foo
type: entity
sources: []
---

内容`,
      },
    ]
    const violations = checkConsistency(blocks)
    expect(violations.some((v) => v.includes("INV-3"))).toBe(true)
  })

  // C-32
  it("C-32 sources 缺失时报 INV-3", () => {
    const blocks = [
      {
        path: "wiki/sources/s/entities/foo.md",
        content: `---
title: foo
type: entity
---

内容`,
      },
    ]
    const violations = checkConsistency(blocks)
    expect(violations.some((v) => v.includes("INV-3"))).toBe(true)
  })

  // C-33
  it("C-33 sources 包含多个来源，其中一个匹配 sourceBase 时无违规", () => {
    const blocks = [
      {
        path: "wiki/sources/2023体检报告/entities/某概念.md",
        content: `---
title: 某概念
type: entity
sources: ["2023体检报告.pdf", "2024体检报告.pdf"]
---

内容`,
      },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })

  // C-34
  it("C-34 sources 与 sourceBase 均含中文时匹配正常", () => {
    const blocks = [
      {
        path: "wiki/sources/珠海奥乐医院/entities/珠海奥乐医院.md",
        content: `---
title: 珠海奥乐医院
type: entity
sources: ["珠海奥乐医院.pdf"]
---

内容`,
      },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 6: type 字段 ↔ 目录类型一致性
// ══════════════════════════════════════════════════════════════════════════════

describe("type 字段 ↔ 目录一致性", () => {
  // C-35
  it("C-35 entities 目录中 type=entity 时无违规", () => {
    const blocks = [
      {
        path: "wiki/sources/s/entities/foo.md",
        content: `---
title: foo
type: entity
sources: ["s"]
---

内容`,
      },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })

  // C-36
  it("C-36 concepts 目录中 type=concept 时无违规", () => {
    const blocks = [
      {
        path: "wiki/sources/s/concepts/foo.md",
        content: `---
title: foo
type: concept
sources: ["s"]
---

内容`,
      },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })

  // C-37
  it("C-37 entities 目录中 type=concept 时报 INV-4", () => {
    const blocks = [
      {
        path: "wiki/sources/s/entities/foo.md",
        content: `---
title: foo
type: concept
sources: ["s"]
---

内容`,
      },
    ]
    const violations = checkConsistency(blocks)
    expect(violations.some((v) => v.includes("INV-4"))).toBe(true)
  })

  // C-38
  it("C-38 concepts 目录中 type=entity 时报 INV-4", () => {
    const blocks = [
      {
        path: "wiki/sources/s/concepts/foo.md",
        content: `---
title: foo
type: entity
sources: ["s"]
---

内容`,
      },
    ]
    const violations = checkConsistency(blocks)
    expect(violations.some((v) => v.includes("INV-4"))).toBe(true)
  })

  // C-39
  it("C-39 sourceBase.md（无子目录）不检查 type", () => {
    const blocks = [
      {
        path: "wiki/sources/s.md",
        content: `---
title: s
sources: ["s"]
---

内容`,
      },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 7: 正文非空
// ══════════════════════════════════════════════════════════════════════════════

describe("正文非空", () => {
  // C-40
  it("C-40 frontmatter 后有正文时无违规", () => {
    const blocks = [
      {
        path: "wiki/sources/s/entities/foo.md",
        content: `---
title: foo
type: entity
sources: ["s"]
---

这里是正文内容。`,
      },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })

  // C-41
  it("C-41 frontmatter 后正文为空时报 INV-5", () => {
    const blocks = [
      {
        path: "wiki/sources/s/entities/foo.md",
        content: `---
title: foo
type: entity
sources: ["s"]
---
`,
      },
    ]
    const violations = checkConsistency(blocks)
    expect(violations.some((v) => v.includes("INV-5"))).toBe(true)
  })

  // C-42
  it("C-42 overview.md 跳过正文检查", () => {
    const blocks = [
      {
        path: "wiki/overview.md",
        content: "",
      },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })

  // C-43
  it("C-43 log.md 跳过一致性检查", () => {
    const blocks = [
      {
        path: "wiki/log.md",
        content: "",
      },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 8: 路径隔离（writeBlocks 白名单）—— fs mock 集成
// ══════════════════════════════════════════════════════════════════════════════

describe("路径隔离 — parseFileBlocks + buildAllowedPaths", () => {
  /** 模拟 writeBlocks 过滤逻辑（不实际写文件），返回 {written, rejected} */
  function simulateWriteBlocks(
    llmOutput: string,
    sourceBase: string,
  ): { written: string[]; rejected: string[] } {
    const staticAllowed = buildAllowedPaths(sourceBase)
    const sourcePrefix = `wiki/sources/${sourceBase}/`
    const blocks = parseFileBlocks(llmOutput)
    const written: string[] = []
    const rejected: string[] = []

    for (const { path: relRaw, content } of blocks) {
      const rel = nodePath.posix.normalize(relRaw)
      const isAllowed = rel.startsWith(sourcePrefix) || staticAllowed.has(rel)
      if (!isAllowed) {
        rejected.push(rel)
        continue
      }
      if (!content.trim()) {
        // skip empty
        continue
      }
      written.push(rel)
    }
    return { written, rejected }
  }

  // C-44
  it("C-44 同 sourceBase 目录下的路径被允许", () => {
    const output = `---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
title: 韩松
type: entity
sources: ["2023体检报告.pdf"]
---
内容
---END FILE---`
    const { written, rejected } = simulateWriteBlocks(output, "2023体检报告")
    expect(written).toContain("wiki/sources/2023体检报告/entities/韩松.md")
    expect(rejected).toHaveLength(0)
  })

  // C-45（核心：wiki/index.md 被拒绝）
  it("C-45 wiki/index.md 始终被拒绝", () => {
    const output = `---FILE: wiki/index.md---
# Index
---END FILE---`
    const { rejected } = simulateWriteBlocks(output, "2023体检报告")
    expect(rejected).toContain("wiki/index.md")
  })

  // C-46（核心：跨 source 路径被拒绝）
  it("C-46 其他 sourceBase 路径被拒绝", () => {
    const output = `---FILE: wiki/sources/2025体检报告/entities/韩松.md---
内容
---END FILE---`
    const { rejected } = simulateWriteBlocks(output, "2023体检报告")
    expect(rejected).toContain("wiki/sources/2025体检报告/entities/韩松.md")
  })

  // C-47
  it("C-47 wiki/log.md 和 wiki/overview.md 被允许", () => {
    const output = `---FILE: wiki/log.md---
log entry
---END FILE---
---FILE: wiki/overview.md---
overview content
---END FILE---`
    const { written, rejected } = simulateWriteBlocks(output, "2023体检报告")
    expect(written).toContain("wiki/log.md")
    expect(written).toContain("wiki/overview.md")
    expect(rejected).toHaveLength(0)
  })

  // C-48
  it("C-48 路径遍历攻击 (../../) 被拒绝", () => {
    const output = `---FILE: wiki/sources/2023体检报告/../../sensitive.md---
hack
---END FILE---`
    const { rejected } = simulateWriteBlocks(output, "2023体检报告")
    expect(rejected).toHaveLength(1)
  })

  // C-49
  it("C-49 sourceBase.md（汇总页）被允许", () => {
    const output = `---FILE: wiki/sources/2023体检报告.md---
汇总内容
---END FILE---`
    const { written } = simulateWriteBlocks(output, "2023体检报告")
    expect(written).toContain("wiki/sources/2023体检报告.md")
  })

  // C-50
  it("C-50 混合合法与非法路径：各自归类正确", () => {
    const output = `---FILE: wiki/sources/A/entities/正确.md---
---
title: 正确
type: entity
sources: ["A"]
---
内容
---END FILE---
---FILE: wiki/sources/B/entities/非法.md---
非法内容
---END FILE---
---FILE: wiki/index.md---
index
---END FILE---`
    const { written, rejected } = simulateWriteBlocks(output, "A")
    expect(written).toContain("wiki/sources/A/entities/正确.md")
    expect(rejected).toContain("wiki/sources/B/entities/非法.md")
    expect(rejected).toContain("wiki/index.md")
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 9: 端到端 LLM 输出模拟 —— 完整 ingest 场景
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 构建模拟 LLM 输出的工具函数
 */
function buildMockLlmOutput(
  sourceBase: string,
  entities: Array<{ name: string; body?: string }>,
  concepts: Array<{ name: string; body?: string }>,
  extra?: string,
): string {
  const lines: string[] = []

  // 汇总页
  lines.push(`---FILE: wiki/sources/${sourceBase}.md---`)
  lines.push(`---`)
  lines.push(`title: ${sourceBase}`)
  lines.push(`sources: ["${sourceBase}.pdf"]`)
  lines.push(`---`)
  lines.push(``)
  lines.push(`${sourceBase} 的摘要内容。`)
  lines.push(`---END FILE---`)

  for (const e of entities) {
    lines.push(`---FILE: wiki/sources/${sourceBase}/entities/${e.name}.md---`)
    lines.push(`---`)
    lines.push(`title: ${e.name}`)
    lines.push(`type: entity`)
    lines.push(`sources: ["${sourceBase}.pdf"]`)
    lines.push(`---`)
    lines.push(``)
    lines.push(e.body ?? `${e.name} 的描述。`)
    lines.push(`---END FILE---`)
  }

  for (const c of concepts) {
    lines.push(`---FILE: wiki/sources/${sourceBase}/concepts/${c.name}.md---`)
    lines.push(`---`)
    lines.push(`title: ${c.name}`)
    lines.push(`type: concept`)
    lines.push(`sources: ["${sourceBase}.pdf"]`)
    lines.push(`---`)
    lines.push(``)
    lines.push(c.body ?? `${c.name} 的概念说明。`)
    lines.push(`---END FILE---`)
  }

  if (extra) lines.push(extra)

  return lines.join("\n")
}

describe("端到端 LLM 输出模拟", () => {
  // C-51
  it("C-51 标准三年体检报告 ingest 场景：每年实体/概念一致性全部通过", () => {
    const years = ["2023体检报告", "2024体检报告", "2025体检报告"]
    const allBlocks: Array<{ path: string; content: string }> = []

    for (const year of years) {
      const output = buildMockLlmOutput(
        year,
        [{ name: "韩松" }, { name: "体检机构" }],
        [{ name: "前列腺钙化灶" }, { name: "血脂异常" }],
      )
      allBlocks.push(...parseFileBlocks(output))
    }

    const violations = checkConsistency(allBlocks)
    expect(violations).toHaveLength(0)
  })

  // C-52（核心：跨源污染检测）
  it("C-52 2023 的 entities/韩松.md 中 sources 引用 2025 时被检测为跨源污染", () => {
    const output = `---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
title: 韩松
type: entity
sources: ["2025体检报告.pdf"]
---

这里混入了 2025 年的信息。
---END FILE---`
    const blocks = parseFileBlocks(output)
    const violations = checkConsistency(blocks)
    expect(violations.some((v) => v.includes("INV-3"))).toBe(true)
  })

  // C-53
  it("C-53 LLM 尝试写 wiki/index.md 时被路径过滤排除", () => {
    const output = buildMockLlmOutput("2023体检报告", [{ name: "韩松" }], [])
    const indexPollution = `\n---FILE: wiki/index.md---\n## Index\n---END FILE---`
    const { rejected } = (() => {
      const staticAllowed = buildAllowedPaths("2023体检报告")
      const prefix = "wiki/sources/2023体检报告/"
      const blocks = parseFileBlocks(output + indexPollution)
      const w: string[] = [], r: string[] = []
      for (const { path: rel } of blocks) {
        if (rel.startsWith(prefix) || staticAllowed.has(rel)) w.push(rel)
        else r.push(rel)
      }
      return { written: w, rejected: r }
    })()
    expect(rejected).toContain("wiki/index.md")
  })

  // C-54
  it("C-54 全部 ingest 正常时，路径过滤 rejected 为空", () => {
    const output = buildMockLlmOutput(
      "2024体检报告",
      [{ name: "韩松" }, { name: "珠海奥乐医院" }],
      [{ name: "乙肝表面抗体阳性" }],
    )
    const staticAllowed = buildAllowedPaths("2024体检报告")
    const prefix = "wiki/sources/2024体检报告/"
    const blocks = parseFileBlocks(output)
    const rejected = blocks.filter(
      ({ path: r }) => !r.startsWith(prefix) && !staticAllowed.has(r),
    )
    expect(rejected).toHaveLength(0)
  })

  // C-55
  it("C-55 缺少 ---END FILE--- 的大模型输出仍能解析正确数量的块", () => {
    // 模拟 LLM 忘记写 END FILE
    const output = [
      "---FILE: wiki/sources/s/entities/A.md---",
      "title: A",
      "content A",
      "---FILE: wiki/sources/s/entities/B.md---",
      "title: B",
      "content B",
      "---FILE: wiki/sources/s/entities/C.md---",
      "title: C",
      "content C",
    ].join("\n")
    const blocks = parseFileBlocks(output)
    expect(blocks).toHaveLength(3)
    expect(blocks[0].content).toContain("content A")
    expect(blocks[1].content).toContain("content B")
    expect(blocks[2].content).toContain("content C")
  })

  // C-56
  it("C-56 LLM 为 entities 目录文件写了 type: concept 时被一致性检测发现", () => {
    const output = `---FILE: wiki/sources/2023体检报告/entities/体检筛查的局限性.md---
---
title: 体检筛查的局限性
type: concept
sources: ["2023体检报告.pdf"]
---

体检筛查的局限性概念说明。
---END FILE---`
    const blocks = parseFileBlocks(output)
    const violations = checkConsistency(blocks)
    expect(violations.some((v) => v.includes("INV-4"))).toBe(true)
  })

  // C-57
  it("C-57 LLM 输出中文件名与 title 不匹配（历史 Bug 场景）时被 INV-2 检出", () => {
    // 历史 Bug：前列腺钙化灶.md 中写入了体检筛查的局限性的内容
    const output = `---FILE: wiki/sources/2023体检报告/entities/前列腺钙化灶.md---
---
title: 体检筛查的局限性
type: entity
sources: ["2023体检报告.pdf"]
---

体检筛查的局限性内容。
---END FILE---`
    const blocks = parseFileBlocks(output)
    const violations = checkConsistency(blocks)
    expect(violations.some((v) => v.includes("INV-2"))).toBe(true)
    expect(violations.some((v) => v.includes("前列腺钙化灶.md"))).toBe(true)
  })

  // C-58
  it("C-58 两个不同 source 的同名实体文件各自独立、无串台", () => {
    const output2023 = buildMockLlmOutput(
      "2023体检报告",
      [{ name: "韩松", body: "2023年受检者信息。" }],
      [],
    )
    const output2025 = buildMockLlmOutput(
      "2025体检报告",
      [{ name: "韩松", body: "2025年受检者信息。" }],
      [],
    )

    const blocks2023 = parseFileBlocks(output2023)
    const blocks2025 = parseFileBlocks(output2025)

    const hanSong2023 = blocks2023.find((b) =>
      b.path.includes("2023体检报告/entities/韩松.md"),
    )
    const hanSong2025 = blocks2025.find((b) =>
      b.path.includes("2025体检报告/entities/韩松.md"),
    )

    expect(hanSong2023).toBeDefined()
    expect(hanSong2025).toBeDefined()
    expect(hanSong2023!.content).toContain("2023")
    expect(hanSong2025!.content).toContain("2025")
    expect(hanSong2023!.content).not.toContain("2025年")
    expect(hanSong2025!.content).not.toContain("2023年")

    // 一致性检测也应全部通过
    expect(checkConsistency([...blocks2023, ...blocks2025])).toHaveLength(0)
  })

  // C-59
  it("C-59 没有 frontmatter 的块经 normFrontmatter 后仍可被解析", () => {
    const rawContent = `title: 韩松
type: entity
sources: ["2023体检报告.pdf"]

韩松的正文。`
    const normed = normFrontmatter(rawContent)
    const fm = parseFrontmatter(normed)
    expect(fm.title).toBe("韩松")
  })

  // C-60
  it("C-60 超过 50 个块的完整 ingest 输出一致性全部通过", () => {
    const entities = Array.from({ length: 30 }, (_, i) => ({ name: `实体${i}` }))
    const concepts = Array.from({ length: 25 }, (_, i) => ({ name: `概念${i}` }))
    const output = buildMockLlmOutput("大型文档", entities, concepts)
    const blocks = parseFileBlocks(output)
    expect(blocks).toHaveLength(entities.length + concepts.length + 1) // +1 for summary
    const violations = checkConsistency(blocks)
    expect(violations).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 10: isTitleFilenameConsistent — 写入前不变量校验（根因修复验证）
// ══════════════════════════════════════════════════════════════════════════════

describe("isTitleFilenameConsistent（写入层根因修复）", () => {
  // R-01：test6 核心 Bug 场景：韩松.md 里写着 珠海奥乐医院 → 必须被拒绝
  it("R-01 韩松.md + title=珠海奥乐医院 → false（test6 Bug 场景）", () => {
    const content = `---\ntype: entity\ntitle: 珠海奥乐医院\nsources: ["2023体检报告.pdf"]\n---\n内容`
    expect(isTitleFilenameConsistent(
      "wiki/sources/2023体检报告/entities/韩松.md",
      content,
    )).toBe(false)
  })

  // R-02：ALT升高.md 里写着 肥胖 → 必须被拒绝
  it("R-02 ALT升高.md + title=肥胖 → false（test6 Bug 场景）", () => {
    const content = `---\ntype: concept\ntitle: 肥胖\nsources: ["2023体检报告.pdf"]\n---\n内容`
    expect(isTitleFilenameConsistent(
      "wiki/sources/2023体检报告/concepts/ALT升高.md",
      content,
    )).toBe(false)
  })

  // R-03：肺结节.md + title=肥胖 → 拒绝
  it("R-03 肺结节.md + title=肥胖 → false", () => {
    const content = `---\ntype: concept\ntitle: 肥胖\nsources: ["2023体检报告.pdf"]\n---\n内容`
    expect(isTitleFilenameConsistent(
      "wiki/sources/2023体检报告/concepts/肺结节.md",
      content,
    )).toBe(false)
  })

  // R-04：正确匹配 → true
  it("R-04 韩松.md + title=韩松 → true（正确场景）", () => {
    const content = `---\ntype: entity\ntitle: 韩松\nsources: ["2023体检报告.pdf"]\n---\n内容`
    expect(isTitleFilenameConsistent(
      "wiki/sources/2023体检报告/entities/韩松.md",
      content,
    )).toBe(true)
  })

  // R-05：concepts 正确匹配 → true
  it("R-05 高脂血症.md + title=高脂血症 → true", () => {
    const content = `---\ntype: concept\ntitle: 高脂血症\nsources: ["2023体检报告.pdf"]\n---\n内容`
    expect(isTitleFilenameConsistent(
      "wiki/sources/2023体检报告/concepts/高脂血症.md",
      content,
    )).toBe(true)
  })

  // R-06：大小写不敏感匹配 → true
  it("R-06 Entity.md + title=entity（大小写不敏感）→ true", () => {
    const content = `---\ntype: entity\ntitle: entity\nsources: ["src"]\n---\n内容`
    expect(isTitleFilenameConsistent(
      "wiki/sources/src/entities/Entity.md",
      content,
    )).toBe(true)
  })

  // R-07：sourceBase.md 汇总页现在也受 title 校验（PART 11 覆盖了正向/反向用例）
  // 原断言"不校验→true"已过时；这里改为验证：title 与文件名匹配时通过
  it("R-07 wiki/sources/2023体检报告.md + title=2023体检报告 → true（汇总页校验）", () => {
    const content = `---\ntitle: 2023体检报告\nsources: ["2023体检报告.pdf"]\n---\n内容`
    expect(isTitleFilenameConsistent(
      "wiki/sources/2023体检报告.md",
      content,
    )).toBe(true)
  })

  // R-08：wiki/overview.md 不校验
  it("R-08 wiki/overview.md 不校验 → true", () => {
    expect(isTitleFilenameConsistent("wiki/overview.md", "任意内容")).toBe(true)
  })

  // R-09：wiki/log.md 不校验
  it("R-09 wiki/log.md 不校验 → true", () => {
    expect(isTitleFilenameConsistent("wiki/log.md", "日志内容")).toBe(true)
  })

  // R-10：无 title 的块不拒绝（让空内容检查处理）
  it("R-10 entity 文件无 title 字段 → true（不触发本校验）", () => {
    const content = `---\ntype: entity\nsources: ["s"]\n---\n内容`
    expect(isTitleFilenameConsistent(
      "wiki/sources/s/entities/韩松.md",
      content,
    )).toBe(true)
  })

  // R-11：二尖瓣反流.md + title=体检报告解读原则 → 拒绝（test6 2025 Bug）
  it("R-11 二尖瓣反流.md + title=体检报告解读原则 → false（test6 2025 Bug）", () => {
    const content = `---\ntype: concept\ntitle: 体检报告解读原则\nsources: ["2025体检报告.pdf"]\n---\n内容`
    expect(isTitleFilenameConsistent(
      "wiki/sources/2025体检报告/concepts/二尖瓣反流.md",
      content,
    )).toBe(false)
  })

  // R-12：胆囊多发结石.md + title=肺结节 → 拒绝
  it("R-12 胆囊多发结石.md + title=肺结节 → false", () => {
    const content = `---\ntype: concept\ntitle: 肺结节\nsources: ["2023体检报告.pdf"]\n---\n内容`
    expect(isTitleFilenameConsistent(
      "wiki/sources/2023体检报告/concepts/胆囊多发结石.md",
      content,
    )).toBe(false)
  })
})

// ─── PART 11: 汇总页 (wiki/sources/<base>.md) title-filename 一致性 ──────────
describe("PART 11: isTitleFilenameConsistent – source summary pages", () => {
  // S-01：正常汇总页 title 匹配文件名 → 允许
  it("S-01 2023体检报告.md + title=2023体检报告 → true", () => {
    const content = `---\ntype: source\ntitle: 2023体检报告\nsources: ["2023体检报告.pdf"]\n---\n内容`
    expect(isTitleFilenameConsistent("wiki/sources/2023体检报告.md", content)).toBe(true)
  })

  // S-02：Bug S-1 真实观察 - 2023汇总页写入了2025概念内容
  it("S-02 2023体检报告.md + title=高尿酸血症（跨源内容）→ false", () => {
    const content = `---\ntype: concept\ntitle: 高尿酸血症\nsources: ["2025体检报告.pdf"]\n---\n内容`
    expect(isTitleFilenameConsistent("wiki/sources/2023体检报告.md", content)).toBe(false)
  })

  // S-03：Bug S-1 真实观察 - 2025汇总页写入了2023汇总内容
  it("S-03 2025体检报告.md + title=2023体检报告 → false", () => {
    const content = `---\ntype: source\ntitle: 2023体检报告\nsources: ["2023体检报告.pdf"]\n---\n内容`
    expect(isTitleFilenameConsistent("wiki/sources/2025体检报告.md", content)).toBe(false)
  })

  // S-04：2024汇总页 title 匹配 → 允许
  it("S-04 2024体检报告.md + title=2024体检报告 → true", () => {
    const content = `---\ntype: source\ntitle: 2024体检报告\nsources: ["2024体检报告.pdf"]\n---\n内容`
    expect(isTitleFilenameConsistent("wiki/sources/2024体检报告.md", content)).toBe(true)
  })

  // S-05：汇总页无 title → 跳过检查（true），让空内容检查处理
  it("S-05 汇总页无 title → true（跳过）", () => {
    const content = `---\ntype: source\n---\n内容`
    expect(isTitleFilenameConsistent("wiki/sources/2023体检报告.md", content)).toBe(true)
  })

  // S-06：非 sources 目录下的 .md 不受此检查影响
  it("S-06 wiki/overview.md 不做汇总页检查 → true", () => {
    const content = `---\ntitle: 随便什么\n---\n内容`
    expect(isTitleFilenameConsistent("wiki/overview.md", content)).toBe(true)
  })

  // S-07：sources 子目录下的文件不被误判为汇总页
  it("S-07 子目录 entities 不被当汇总页 → title 匹配检查正常工作", () => {
    const content = `---\ntitle: 韩松\n---\n内容`
    // 这是 entities 路径，走 entities/concepts 分支，不是汇总页分支
    expect(isTitleFilenameConsistent("wiki/sources/2023体检报告/entities/韩松.md", content)).toBe(true)
  })

  // S-08：汇总页 title 大小写不敏感匹配 → true
  it("S-08 title 大小写不敏感 → true", () => {
    const content = `---\ntitle: ABC报告\n---\n内容`
    expect(isTitleFilenameConsistent("wiki/sources/abc报告.md", content)).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART 12: 外部模型输出 fixture（仓库外优先，仓库内回退）
// ══════════════════════════════════════════════════════════════════════════════

describe("PART 12: external fixtures consistency", () => {
  it("F-01 能加载外部 fixtures（缺失时回退到内置样本）", async () => {
    const { source, fixtures } = await loadFixturesWithFallback()
    expect(["external", "fallback"]).toContain(source)
    expect(fixtures.length).toBeGreaterThan(0)
  })

  it("F-02 fixture 的 expectedPages 必须能在 FILE blocks 中找到", async () => {
    const { fixtures } = await loadFixturesWithFallback()
    for (const fixture of fixtures) {
      const blocks = parseFileBlocks(fixture.llmRawOutput)
      const blockPaths = new Set(blocks.map((b) => b.path))
      for (const expectedPath of fixture.expectedPages ?? []) {
        expect(blockPaths.has(expectedPath)).toBe(true)
      }
    }
  })

  it("F-03 fixture 的 expectedViolations 必须被一致性检查覆盖", async () => {
    const { fixtures } = await loadFixturesWithFallback()
    for (const fixture of fixtures) {
      const blocks = parseFileBlocks(fixture.llmRawOutput)
      const violations = checkConsistency(blocks)
      const violationCodes = new Set(
        violations
          .map((v) => {
            const m = v.match(/\[(INV-\d+)\]/)
            return m ? m[1] : null
          })
          .filter(Boolean) as string[],
      )
      for (const expectedCode of fixture.expectedViolations ?? []) {
        expect(violationCodes.has(expectedCode)).toBe(true)
      }
    }
  })
})

describe("PART 13: body-title semantic consistency", () => {
  it("B-01 实体页正文不提及 title 时拒绝", () => {
    const content = `---
type: entity
title: 韩松
sources: ["2023体检报告.pdf"]
---

这段正文在讲珠海奥乐医院，不包含目标人物名。`
    expect(
      isBodyTitleSemanticallyConsistent("wiki/sources/2023体检报告/entities/韩松.md", content),
    ).toBe(false)
  })

  it("B-02 概念页正文包含 title 或 wikilink 时通过", () => {
    const content = `---
type: concept
title: 高脂血症
sources: ["2023体检报告.pdf"]
---

[[高脂血症]]是常见代谢异常。`
    expect(
      isBodyTitleSemanticallyConsistent("wiki/sources/2023体检报告/concepts/高脂血症.md", content),
    ).toBe(true)
  })

  it("B-03 汇总页正文不包含 sourceBase 时拒绝", () => {
    const content = `---
type: source
title: 2023体检报告
sources: ["2023体检报告.pdf"]
---

这段摘要没有提到对应来源名称。`
    expect(
      isBodyTitleSemanticallyConsistent("wiki/sources/2023体检报告.md", content),
    ).toBe(false)
  })
})

describe("PART 14: plan count gate", () => {
  it("P-01 parsePlan 提取实体/概念后与实际数量一致时通过", () => {
    const analysis = [
      "## File Plan",
      "ENTITY: 韩松 | 受检者",
      "ENTITY: 珠海奥乐医院 | 体检机构",
      "CONCEPT: 高脂血症 | 血脂代谢异常",
      "CONCEPT: 甲状腺结节 | 影像学概念",
    ].join("\n")
    const items = parsePlan(analysis)
    const entities = items.filter((item) => item.type === "entity").map((item) => item.name)
    const concepts = items.filter((item) => item.type === "concept").map((item) => item.name)
    const gate = evaluatePlannedCountGate({
      expectedEntityNames: entities,
      expectedConceptNames: concepts,
      actualEntityNames: ["韩松", "珠海奥乐医院", "额外实体"],
      actualConceptNames: ["高脂血症", "甲状腺结节"],
    })
    expect(gate.ok).toBe(true)
  })

  it("P-02 计划数量大于最终落盘数量时失败并返回缺失样本", () => {
    const gate = evaluatePlannedCountGate({
      expectedEntityNames: ["韩松", "珠海奥乐医院"],
      expectedConceptNames: ["高脂血症", "甲状腺结节"],
      actualEntityNames: ["韩松"],
      actualConceptNames: ["高脂血症"],
    })
    expect(gate.ok).toBe(false)
    expect(gate.detail).toContain("planned_count_mismatch")
    expect(gate.detail).toContain("missing entities=1")
    expect(gate.detail).toContain("missing concepts=1")
  })
})

// ─── PART 9: setFmField ───────────────────────────────────────────────────

describe("setFmField", () => {
  it("SF-01 插入不存在的字段", () => {
    const result = setFmField("type: entity\ntitle: 韩松", "sources", '["lab.pdf"]')
    expect(result).toContain('sources: ["lab.pdf"]')
    expect(result).toContain("type: entity")
    expect(result).toContain("title: 韩松")
  })

  it("SF-02 覆盖已存在的字段", () => {
    const result = setFmField("type: entity\ntitle: 旧标题", "title", "新标题")
    expect(result).toBe("type: entity\ntitle: 新标题")
  })

  it("SF-03 覆盖首行字段", () => {
    const result = setFmField("type: concept\ntitle: 高脂血症", "type", "entity")
    expect(result).toBe("type: entity\ntitle: 高脂血症")
  })

  it("SF-04 空字符串 fm 插入字段", () => {
    const result = setFmField("", "title", "韩松")
    expect(result).toBe("title: 韩松")
  })

  it("SF-05 字段值含冒号时不误匹配", () => {
    const result = setFmField("title: foo: bar", "title", "new")
    expect(result).toBe("title: new")
  })

  it("SF-06 多行 fm 只替换精确 key", () => {
    const fm = "created: 2026-01-01\nupdated: 2026-01-01\ntitle: old"
    const result = setFmField(fm, "title", "new")
    expect(result).toContain("title: new")
    expect(result).toContain("created: 2026-01-01")
    expect(result).not.toContain("title: old")
  })
})

// ─── PART 10: ensureCanonicalTitleType ───────────────────────────────────

function makeDoc(fm: string, body: string): string {
  return `---\n${fm.trim()}\n---\n${body}`
}

describe("ensureCanonicalTitleType", () => {
  // ── 实体路径 ────────────────────────────────────────────────────────────

  it("CT-01 实体路径：title 已正确时不变", () => {
    const doc = makeDoc("type: entity\ntitle: 韩松\nsources: [\"lab.pdf\"]", "韩松 entity body")
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告/entities/韩松.md", doc)
    const m = result.match(/^title:\s*(.+)$/m)
    expect(m?.[1]?.trim()).toBe("韩松")
  })

  it("CT-02 实体路径：title 错误时被修正", () => {
    const doc = makeDoc("type: entity\ntitle: 珠海奥乐医院\nsources: [\"lab.pdf\"]", "body")
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告/entities/韩松.md", doc)
    const m = result.match(/^title:\s*(.+)$/m)
    expect(m?.[1]?.trim()).toBe("韩松")
  })

  it("CT-03 实体路径：title 缺失时插入", () => {
    const doc = makeDoc("type: entity\nsources: [\"lab.pdf\"]", "body")
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告/entities/韩松.md", doc)
    expect(result).toMatch(/^title:\s*韩松/m)
  })

  it("CT-04 实体路径：type 错误时被修正", () => {
    const doc = makeDoc("type: concept\ntitle: 韩松", "body")
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告/entities/韩松.md", doc)
    expect(result).toMatch(/^type:\s*entity/m)
  })

  it("CT-05 实体路径：type 缺失时插入", () => {
    const doc = makeDoc("title: 韩松", "body")
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告/entities/韩松.md", doc)
    expect(result).toMatch(/^type:\s*entity/m)
  })

  it("CT-06 实体路径：连字符文件名保持原样（不转为空格）", () => {
    const doc = makeDoc("type: entity\ntitle: wrong", "body")
    const result = ensureCanonicalTitleType("wiki/sources/test/entities/high-density-lipoprotein.md", doc)
    expect(result).toMatch(/^title:\s*high-density-lipoprotein/m)
  })

  // ── 概念路径 ────────────────────────────────────────────────────────────

  it("CT-07 概念路径：title 错误时被修正", () => {
    const doc = makeDoc("type: concept\ntitle: 错误标题", "body")
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告/concepts/高脂血症.md", doc)
    expect(result).toMatch(/^title:\s*高脂血症/m)
  })

  it("CT-08 概念路径：type 错误时被修正为 concept", () => {
    const doc = makeDoc("type: entity\ntitle: 高脂血症", "body")
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告/concepts/高脂血症.md", doc)
    expect(result).toMatch(/^type:\s*concept/m)
  })

  // ── 汇总页路径 ───────────────────────────────────────────────────────────

  it("CT-09 汇总页：title 错误时被修正为 sourceBase", () => {
    const doc = makeDoc("type: source\ntitle: 错误", "body")
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告.md", doc)
    expect(result).toMatch(/^title:\s*2023体检报告/m)
  })

  it("CT-10 汇总页：type 错误时被修正为 source", () => {
    const doc = makeDoc("type: entity\ntitle: 2023体检报告", "body")
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告.md", doc)
    expect(result).toMatch(/^type:\s*source/m)
  })

  it("CT-11 汇总页：连字符 sourceBase 保持原样（不转为空格）", () => {
    const doc = makeDoc("type: source\ntitle: wrong", "body")
    const result = ensureCanonicalTitleType("wiki/sources/lab-report-2026.md", doc)
    expect(result).toMatch(/^title:\s*lab-report-2026/m)
  })

  // ── overview.md ─────────────────────────────────────────────────────────

  it("CT-12 overview.md：type 被修正为 overview", () => {
    const doc = makeDoc("type: source\ntitle: old", "body")
    const result = ensureCanonicalTitleType("wiki/overview.md", doc)
    expect(result).toMatch(/^type:\s*overview/m)
  })

  it("CT-13 overview.md：title 被修正为 'Wiki 总览'", () => {
    const doc = makeDoc("type: overview\ntitle: wrong", "body")
    const result = ensureCanonicalTitleType("wiki/overview.md", doc)
    expect(result).toMatch(/^title:\s*Wiki 总览/m)
  })

  // ── 无关路径（不应修改） ─────────────────────────────────────────────────

  it("CT-14 log.md 路径：无 canonical 映射，内容不变", () => {
    const doc = makeDoc("type: log\ntitle: log", "## log")
    const result = ensureCanonicalTitleType("wiki/log.md", doc)
    expect(result).toBe(doc)
  })

  it("CT-15 index.md 路径：无 canonical 映射，内容不变", () => {
    const doc = makeDoc("title: index", "# Wiki Index")
    const result = ensureCanonicalTitleType("wiki/index.md", doc)
    expect(result).toBe(doc)
  })

  it("CT-16 无 frontmatter 的内容：原样返回", () => {
    const doc = "# No frontmatter\njust body"
    expect(ensureCanonicalTitleType("wiki/sources/foo/entities/bar.md", doc)).toBe(doc)
  })

  // ── 正文不受影响 ─────────────────────────────────────────────────────────

  it("CT-17 正文内容不被 ensureCanonicalTitleType 修改", () => {
    const body = "这是正文，提到了[[韩松]]和[[高脂血症]]。"
    const doc = makeDoc("type: entity\ntitle: wrong", body)
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告/entities/韩松.md", doc)
    expect(result).toContain(body)
  })

  it("CT-18 frontmatter 中其他字段（created/updated/tags）不受影响", () => {
    const fm = "type: entity\ntitle: wrong\ncreated: 2026-01-01\nupdated: 2026-01-01\ntags: [健康]"
    const doc = makeDoc(fm, "body")
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告/entities/韩松.md", doc)
    expect(result).toContain("created: 2026-01-01")
    expect(result).toContain("updated: 2026-01-01")
    expect(result).toContain("tags: [健康]")
  })

  it("CT-19 sources 字段不受影响", () => {
    const fm = `type: entity\ntitle: wrong\nsources: ["2023体检报告.pdf"]`
    const doc = makeDoc(fm, "body")
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告/entities/韩松.md", doc)
    expect(result).toContain(`sources: ["2023体检报告.pdf"]`)
  })

  // ── 幂等性 ──────────────────────────────────────────────────────────────

  it("CT-20 幂等性：连续两次调用结果相同", () => {
    const doc = makeDoc("type: entity\ntitle: wrong\nsources: [\"lab.pdf\"]", "body")
    const rel = "wiki/sources/2023体检报告/entities/韩松.md"
    const once = ensureCanonicalTitleType(rel, doc)
    const twice = ensureCanonicalTitleType(rel, once)
    expect(twice).toBe(once)
  })

  it("CT-21 幂等性：已正确的文档不会被修改（完全等值）", () => {
    const doc = makeDoc("type: entity\ntitle: 韩松\nsources: [\"lab.pdf\"]", "[[韩松]] entity body")
    const rel = "wiki/sources/2023体检报告/entities/韩松.md"
    expect(ensureCanonicalTitleType(rel, doc)).toBe(doc)
  })

  // ── 跨源污染防护 ─────────────────────────────────────────────────────────

  it("CT-22 来源 A 的实体内容被放到来源 B 的路径时，title 被修正为路径决定的值", () => {
    // LLM 串台：将 2025 体检的内容写到 2023 体检路径
    const doc = makeDoc(
      "type: entity\ntitle: 2025实体\nsources: [\"2025体检报告.pdf\"]",
      "2025年实体正文",
    )
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告/entities/高血压.md", doc)
    expect(result).toMatch(/^title:\s*高血压/m)
    // sources 字段不受影响
    expect(result).toContain('sources: ["2025体检报告.pdf"]')
  })

  it("CT-23 汇总页串台：2023 体检汇总误写到 2025 体检路径，title 被修正", () => {
    const doc = makeDoc("type: source\ntitle: 2023体检报告\nsources: [\"2023体检报告.pdf\"]", "2023汇总")
    const result = ensureCanonicalTitleType("wiki/sources/2025体检报告.md", doc)
    expect(result).toMatch(/^title:\s*2025体检报告/m)
  })

  // ── 边界情况 ─────────────────────────────────────────────────────────────

  it("CT-24 frontmatter 只有分隔符（空 fm）：插入 title 和 type", () => {
    const doc = "---\n\n---\nbody"
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告/entities/韩松.md", doc)
    expect(result).toMatch(/^title:\s*韩松/m)
    expect(result).toMatch(/^type:\s*entity/m)
  })

  it("CT-25 中文文件名保持原样，不做拼音/ASCII 转换", () => {
    const doc = makeDoc("type: concept\ntitle: wrong", "body")
    const result = ensureCanonicalTitleType("wiki/sources/2023体检报告/concepts/丙氨酸氨基转移酶偏高.md", doc)
    expect(result).toMatch(/^title:\s*丙氨酸氨基转移酶偏高/m)
  })

  it("CT-26 深层嵌套路径（多级子目录）不匹配 entity/concept 正则时不修改 title", () => {
    // 超出 entities/concepts 格式的深层路径 → 无 canonical 映射
    const doc = makeDoc("type: entity\ntitle: foo", "body")
    const result = ensureCanonicalTitleType("wiki/sources/a/b/c/entities/foo.md", doc)
    // 仍应匹配（正则 .+ 允许多级），应修正 title
    expect(result).toMatch(/^title:\s*foo/m)
  })

  it("CT-27 路径含 concepts 但文件在 entities 子目录下：以实际 entities 为准", () => {
    const doc = makeDoc("type: concept\ntitle: wrong", "body")
    const result = ensureCanonicalTitleType("wiki/sources/my-source/entities/甲状腺结节.md", doc)
    expect(result).toMatch(/^type:\s*entity/m)
    expect(result).toMatch(/^title:\s*甲状腺结节/m)
  })

  it("CT-28 概念文件名含点号时处理正确", () => {
    // basename 去除 .md 后仍含 . (不常见但应不崩溃)
    const doc = makeDoc("type: concept\ntitle: wrong", "body")
    const result = ensureCanonicalTitleType("wiki/sources/test/concepts/ALT.AST.md", doc)
    expect(result).toMatch(/^title:\s*ALT.AST/m)
  })

  it("CT-29 overview.md 路径：同时修正 type 和 title（完整双修）", () => {
    const doc = makeDoc("type: source\ntitle: random", "body")
    const result = ensureCanonicalTitleType("wiki/overview.md", doc)
    expect(result).toMatch(/^type:\s*overview/m)
    expect(result).toMatch(/^title:\s*Wiki 总览/m)
  })

  it("CT-30 已含 overview type 的 overview.md：不重复插入字段", () => {
    const doc = makeDoc("type: overview\ntitle: Wiki 总览", "body")
    const result = ensureCanonicalTitleType("wiki/overview.md", doc)
    const typeMatches = result.match(/^type:/gm)
    const titleMatches = result.match(/^title:/gm)
    expect(typeMatches?.length).toBe(1)
    expect(titleMatches?.length).toBe(1)
  })
})
