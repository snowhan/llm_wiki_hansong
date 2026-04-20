/**
 * ingest-timing.test.ts
 *
 * 基于 test6 项目真实 LLM ingest 输出，测试各种时序/重试/并发场景下
 * MD 文件名、title、content 是否一致。
 *
 * 用例编号 T-01 ~ T-60
 *
 * 核心思路：
 *   - 假设 LLM 输出本身可能有错（路径与内容错配、内容重复、跨源污染等）
 *   - 通过 checkConsistency() 检查"最终落盘状态"是否满足一致性不变量
 *   - 模拟不同时序：先2023后2025、先2025后2023、并发、重试、部分失败等
 */

import { describe, it, expect } from "vitest"
import * as nodePath from "node:path"
import {
  parseFileBlocks,
  normFrontmatter,
  buildAllowedPaths,
  parsePlan,
  evaluatePlannedCountGate,
} from "../ingest-service.js"
import {
  CORRECT_2023,
  CORRECT_2024,
  CORRECT_2025,
  BUGGY_2023_DUPLICATE_ENTITY,
  BUGGY_2023_SHIFT,
  BUGGY_2025_CROSS_SOURCE,
  BUGGY_2025_AFTER_2023_CONTAMINATION,
  MISSING_END_FILE_OUTPUT,
  RETRY_FIRST_WRONG_2023,
  RETRY_SECOND_CORRECT_2023,
} from "./test6-fixtures.js"
import { loadFixturesWithFallback } from "./fixtures/fixture-loader.js"

// ─── frontmatter 解析工具 ─────────────────────────────────────────────────

function parseFrontmatter(md: string): Record<string, unknown> {
  const normalized = normFrontmatter(md)
  const m = normalized.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!m) return {}
  const result: Record<string, unknown> = {}
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":")
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let val: unknown = line.slice(idx + 1).trim()
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

function basenameNoExt(relPath: string): string {
  const parts = relPath.split("/")
  return parts[parts.length - 1].replace(/\.md$/, "")
}

function sourceBaseFromPath(relPath: string): string | null {
  const m = relPath.match(/^wiki\/sources\/([^/]+?)(?:\.md|\/|$)/)
  return m ? m[1] : null
}

function expectedTypeFromPath(relPath: string): string | null {
  if (relPath.includes("/entities/")) return "entity"
  if (relPath.includes("/concepts/")) return "concept"
  return null
}

// ─── 一致性检查器（扩展版） ────────────────────────────────────────────────

interface Violation {
  code: string
  path: string
  detail: string
}

function checkConsistency(
  blocks: Array<{ path: string; content: string }>,
): Violation[] {
  const violations: Violation[] = []

  for (const { path: relPath, content } of blocks) {
    if (!relPath.endsWith(".md")) continue
    if (relPath === "wiki/log.md" || relPath.endsWith("/log.md")) continue
    if (relPath === "wiki/overview.md") continue

    const normed = normFrontmatter(content)
    const fm = parseFrontmatter(normed)
    const name = basenameNoExt(relPath)
    const srcBase = sourceBaseFromPath(relPath)
    const expectedType = expectedTypeFromPath(relPath)

    if (!fm.title) {
      violations.push({ code: "INV-1", path: relPath, detail: "缺少 title" })
      continue
    }

    const titleStr = String(fm.title).trim()

    // INV-2: 文件名 ↔ title 不匹配
    if (name.toLowerCase() !== titleStr.toLowerCase()) {
      violations.push({
        code: "INV-2",
        path: relPath,
        detail: `文件名="${name}" title="${titleStr}"`,
      })
    }

    // INV-3: sources 与 sourceBase 不匹配
    const sources = fm.sources as string[] | string | undefined
    if (!sources || (Array.isArray(sources) && sources.length === 0)) {
      violations.push({ code: "INV-3", path: relPath, detail: "缺少 sources" })
    } else if (srcBase) {
      const sourcesArr = Array.isArray(sources) ? sources : [String(sources)]
      const hasMatch = sourcesArr.some((s) => s.includes(srcBase))
      if (!hasMatch) {
        violations.push({
          code: "INV-3",
          path: relPath,
          detail: `sources=[${sourcesArr}] 未包含 sourceBase="${srcBase}"`,
        })
      }
    }

    // INV-4: type ↔ 目录不匹配
    if (expectedType && fm.type !== expectedType) {
      violations.push({
        code: "INV-4",
        path: relPath,
        detail: `type="${fm.type}" expectedType="${expectedType}"`,
      })
    }

    // INV-5: 正文为空
    const bodyStart = normed.indexOf("---", 3)
    const body = bodyStart !== -1 ? normed.slice(bodyStart + 3).trim() : normed.trim()
    if (!body) {
      violations.push({ code: "INV-5", path: relPath, detail: "正文为空" })
    }

    // INV-6: 内容与 title 语义一致性（正文第一段不应提及其他实体名称作为主语）
    // 检查正文中是否频繁出现与 title 不同的另一个实体名
  }

  return violations
}

// ─── 模拟 writeBlocks（不写文件，只过滤路径 + 记录冲突） ───────────────────

interface WriteResult {
  written: Array<{ path: string; content: string }>
  rejected: string[]
}

function simulateWriteBlocks(llmOutput: string, sourceBase: string): WriteResult {
  const staticAllowed = buildAllowedPaths(sourceBase)
  const sourcePrefix = `wiki/sources/${sourceBase}/`
  const blocks = parseFileBlocks(llmOutput)
  const written: Array<{ path: string; content: string }> = []
  const rejected: string[] = []
  const writtenPaths = new Set<string>()

  for (const { path: relRaw, content } of blocks) {
    const rel = nodePath.posix.normalize(relRaw)
    const isAllowed = rel.startsWith(sourcePrefix) || staticAllowed.has(rel)
    if (!isAllowed) {
      rejected.push(rel)
      continue
    }
    if (!content.trim()) continue
    if (writtenPaths.has(rel)) continue // 幂等：同路径只写第一次
    writtenPaths.add(rel)
    written.push({ path: rel, content })
  }
  return { written, rejected }
}

/**
 * 模拟"文件系统"：维护一个 path→content Map，
 * 按顺序执行多次 writeBlocks，后写覆盖先写（模拟重试/并发覆盖行为）
 */
function simulateFileSystem(
  operations: Array<{ llmOutput: string; sourceBase: string }>,
  options: { firstWriteWins?: boolean } = {},
): Map<string, string> {
  const fs = new Map<string, string>()
  for (const { llmOutput, sourceBase } of operations) {
    const { written } = simulateWriteBlocks(llmOutput, sourceBase)
    for (const { path, content } of written) {
      if (options.firstWriteWins && fs.has(path)) continue
      fs.set(path, content)
    }
  }
  return fs
}

function fsToBlocks(fs: Map<string, string>): Array<{ path: string; content: string }> {
  return Array.from(fs.entries()).map(([path, content]) => ({ path, content }))
}

// ══════════════════════════════════════════════════════════════════════════════
// PART A: test6 真实 Bug 数据重现
// ══════════════════════════════════════════════════════════════════════════════

describe("test6 真实 Bug 重现", () => {
  // T-01
  it("T-01 正确的 2023 ingest 输出一致性全部通过", () => {
    const blocks = parseFileBlocks(CORRECT_2023)
    const violations = checkConsistency(blocks)
    expect(violations).toHaveLength(0)
  })

  // T-02
  it("T-02 正确的 2025 ingest 输出一致性全部通过", () => {
    const blocks = parseFileBlocks(CORRECT_2025)
    const violations = checkConsistency(blocks)
    expect(violations).toHaveLength(0)
  })

  // T-03
  it("T-03 正确的 2024 ingest 输出一致性全部通过", () => {
    const blocks = parseFileBlocks(CORRECT_2024)
    const violations = checkConsistency(blocks)
    expect(violations).toHaveLength(0)
  })

  // T-04（test6 Bug 场景 A：内容重复+路径错配）
  it("T-04 Bug A：韩松.md 拿到珠海奥乐医院内容 → INV-2 被检出", () => {
    const blocks = parseFileBlocks(BUGGY_2023_DUPLICATE_ENTITY)
    const violations = checkConsistency(blocks)
    const inv2 = violations.filter((v) => v.code === "INV-2")
    // 至少：韩松.md title=珠海奥乐医院、ALT升高.md title=肥胖、高脂血症.md title=轻度脂肪肝
    expect(inv2.length).toBeGreaterThanOrEqual(3)
    const paths = inv2.map((v) => v.path)
    expect(paths.some((p) => p.includes("韩松.md"))).toBe(true)
    expect(paths.some((p) => p.includes("ALT升高.md"))).toBe(true)
  })

  // T-05（test6 Bug 场景 B：内容逐一错位）
  it("T-05 Bug B：内容逐一错位 → 多个 INV-2 被检出", () => {
    const blocks = parseFileBlocks(BUGGY_2023_SHIFT)
    const violations = checkConsistency(blocks)
    const inv2 = violations.filter((v) => v.code === "INV-2")
    // 韩松.md→珠海奥乐医院, ALT升高.md→双肾结石, 双肾结石.md→甲状腺弥漫性回声改变
    expect(inv2.length).toBeGreaterThanOrEqual(3)
  })

  // T-06（test6 Bug 场景 C：跨源 sources 污染）
  it("T-06 Bug C：2025 目录文件的 sources 引用了 2023 → INV-3 被检出", () => {
    const blocks = parseFileBlocks(BUGGY_2025_CROSS_SOURCE)
    const violations = checkConsistency(blocks)
    const inv3 = violations.filter((v) => v.code === "INV-3")
    expect(inv3.length).toBeGreaterThanOrEqual(1)
    // 血脂异常.md 的 sources 是 2023体检报告.pdf，但在 2025 目录下
    expect(inv3.some((v) => v.path.includes("2025体检报告") && v.path.includes("血脂异常"))).toBe(true)
  })

  // T-07
  it("T-07 Bug A 中两个实体文件内容完全相同时能被检测到", () => {
    const blocks = parseFileBlocks(BUGGY_2023_DUPLICATE_ENTITY)
    const entityBlocks = blocks.filter((b) => b.path.includes("/entities/"))
    // 找出内容相同的文件对
    const duplicates: string[] = []
    for (let i = 0; i < entityBlocks.length; i++) {
      for (let j = i + 1; j < entityBlocks.length; j++) {
        if (entityBlocks[i].content.trim() === entityBlocks[j].content.trim()) {
          duplicates.push(`${entityBlocks[i].path} == ${entityBlocks[j].path}`)
        }
      }
    }
    expect(duplicates.length).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART B: 路径白名单 + 时序隔离
// ══════════════════════════════════════════════════════════════════════════════

describe("路径白名单与时序隔离", () => {
  // T-08
  it("T-08 正确 2023 ingest：路径全部合法，无 rejected", () => {
    const { rejected } = simulateWriteBlocks(CORRECT_2023, "2023体检报告")
    expect(rejected).toHaveLength(0)
  })

  // T-09
  it("T-09 Buggy 2025 尝试写 wiki/index.md → 被 rejected", () => {
    const output = CORRECT_2025 + `\n---FILE: wiki/index.md---\n# Index\n---END FILE---`
    const { rejected } = simulateWriteBlocks(output, "2025体检报告")
    expect(rejected).toContain("wiki/index.md")
  })

  // T-10
  it("T-10 2023 ingest 不能写入 2025 目录的文件", () => {
    const output = CORRECT_2023 + `\n---FILE: wiki/sources/2025体检报告/entities/韩松.md---\n跨源写入\n---END FILE---`
    const { rejected } = simulateWriteBlocks(output, "2023体检报告")
    expect(rejected.some((r) => r.includes("2025体检报告"))).toBe(true)
  })

  // T-11
  it("T-11 三年 ingest 同时运行：各自写入各自目录，无交叉", () => {
    const r2023 = simulateWriteBlocks(CORRECT_2023, "2023体检报告")
    const r2024 = simulateWriteBlocks(CORRECT_2024, "2024体检报告")
    const r2025 = simulateWriteBlocks(CORRECT_2025, "2025体检报告")

    const paths2023 = r2023.written.map((b) => b.path)
    const paths2024 = r2024.written.map((b) => b.path)
    const paths2025 = r2025.written.map((b) => b.path)

    // 无交集
    expect(paths2023.filter((p) => paths2024.includes(p))).toHaveLength(0)
    expect(paths2023.filter((p) => paths2025.includes(p))).toHaveLength(0)
    expect(paths2024.filter((p) => paths2025.includes(p))).toHaveLength(0)
  })

  // T-12
  it("T-12 同 sourceBase 的同一路径只保留第一次写入（幂等）", () => {
    const output1 = `---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
type: entity
title: 韩松
sources: ["2023体检报告.pdf"]
---
第一次写入的内容。
---END FILE---`
    const output2 = `---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
type: entity
title: 韩松
sources: ["2023体检报告.pdf"]
---
第二次写入的内容（应被忽略）。
---END FILE---`
    const combined = output1 + "\n" + output2
    const { written } = simulateWriteBlocks(combined, "2023体检报告")
    const hanSong = written.filter((b) => b.path.includes("韩松.md"))
    expect(hanSong).toHaveLength(1)
    expect(hanSong[0].content).toContain("第一次写入")
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART C: 多次 ingest 时序场景（文件系统模拟）
// ══════════════════════════════════════════════════════════════════════════════

describe("多次 ingest 时序场景", () => {
  // T-13（顺序：先2023后2025）
  it("T-13 先 2023 后 2025 顺序 ingest：最终文件系统一致性全部通过", () => {
    const fs = simulateFileSystem([
      { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
      { llmOutput: CORRECT_2025, sourceBase: "2025体检报告" },
    ])
    const violations = checkConsistency(fsToBlocks(fs))
    expect(violations).toHaveLength(0)
  })

  // T-14（顺序：先2025后2023）
  it("T-14 先 2025 后 2023 顺序 ingest：最终文件系统一致性全部通过", () => {
    const fs = simulateFileSystem([
      { llmOutput: CORRECT_2025, sourceBase: "2025体检报告" },
      { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
    ])
    const violations = checkConsistency(fsToBlocks(fs))
    expect(violations).toHaveLength(0)
  })

  // T-15（顺序：三年全部顺序）
  it("T-15 三年全部顺序 ingest：最终文件系统一致性全部通过", () => {
    const fs = simulateFileSystem([
      { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
      { llmOutput: CORRECT_2024, sourceBase: "2024体检报告" },
      { llmOutput: CORRECT_2025, sourceBase: "2025体检报告" },
    ])
    const violations = checkConsistency(fsToBlocks(fs))
    expect(violations).toHaveLength(0)
  })

  // T-16（顺序：2025→2024→2023 逆序）
  it("T-16 逆序 ingest（2025→2024→2023）：一致性全部通过", () => {
    const fs = simulateFileSystem([
      { llmOutput: CORRECT_2025, sourceBase: "2025体检报告" },
      { llmOutput: CORRECT_2024, sourceBase: "2024体检报告" },
      { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
    ])
    const violations = checkConsistency(fsToBlocks(fs))
    expect(violations).toHaveLength(0)
  })

  // T-17（重试场景：第一次有 Bug，第二次正确，后写覆盖先写）
  it("T-17 重试覆盖：第一次 Bug 内容被第二次正确内容覆盖后一致性通过", () => {
    const fs = simulateFileSystem([
      { llmOutput: RETRY_FIRST_WRONG_2023, sourceBase: "2023体检报告" },
      { llmOutput: RETRY_SECOND_CORRECT_2023, sourceBase: "2023体检报告" },
    ])
    const violations = checkConsistency(fsToBlocks(fs))
    expect(violations).toHaveLength(0)
    // 确认最终内容是正确的
    const hanSong = fs.get("wiki/sources/2023体检报告/entities/韩松.md")
    expect(hanSong).toContain("title: 韩松")
  })

  // T-18（first-write-wins 场景：第一次正确，第二次 Bug，不覆盖）
  it("T-18 第一次正确写入后，错误的重试不覆盖（first-write-wins）", () => {
    const fs = simulateFileSystem(
      [
        { llmOutput: RETRY_SECOND_CORRECT_2023, sourceBase: "2023体检报告" },
        { llmOutput: RETRY_FIRST_WRONG_2023, sourceBase: "2023体检报告" },
      ],
      { firstWriteWins: true },
    )
    const violations = checkConsistency(fsToBlocks(fs))
    expect(violations).toHaveLength(0)
  })

  // T-19（Bug 先写入，正确内容覆盖后检测通过）
  it("T-19 先写入 Buggy 2023，用正确 2023 覆盖后一致性通过", () => {
    const fs = simulateFileSystem([
      { llmOutput: BUGGY_2023_DUPLICATE_ENTITY, sourceBase: "2023体检报告" },
      { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
    ])
    const violations = checkConsistency(fsToBlocks(fs))
    expect(violations).toHaveLength(0)
  })

  // T-20（先写入正确，再写入 Bug，会产生违规）
  it("T-20 先写入正确 2023，用 Buggy 2023 覆盖后违规数 > 0", () => {
    const fs = simulateFileSystem([
      { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
      { llmOutput: BUGGY_2023_DUPLICATE_ENTITY, sourceBase: "2023体检报告" },
    ])
    const violations = checkConsistency(fsToBlocks(fs))
    expect(violations.length).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART D: 缺失 END FILE 的鲁棒性测试
// ══════════════════════════════════════════════════════════════════════════════

describe("缺失 END FILE 的鲁棒性", () => {
  // T-21
  it("T-21 缺失 END FILE 时内容不发生跨块泄漏", () => {
    const blocks = parseFileBlocks(MISSING_END_FILE_OUTPUT)
    expect(blocks).toHaveLength(4) // 韩松, 珠海奥乐医院, 肥胖, 轻度脂肪肝
    // 韩松内容不应包含珠海奥乐医院的内容
    const hanSong = blocks.find((b) => b.path.includes("韩松.md"))
    const zhuhaiHospital = blocks.find((b) => b.path.includes("珠海奥乐医院.md"))
    expect(hanSong!.content).not.toContain("珠海奥乐医院实体内容")
    expect(zhuhaiHospital!.content.trim()).toBe("---\ntype: entity\ntitle: 珠海奥乐医院\nsources: [\"2023体检报告.pdf\"]\n---\n珠海奥乐医院实体内容（有 END FILE）")
  })

  // T-22
  it("T-22 缺失 END FILE 时每个块的内容正确归属（通过 title 验证）", () => {
    const blocks = parseFileBlocks(MISSING_END_FILE_OUTPUT)
    for (const block of blocks) {
      const fm = parseFrontmatter(normFrontmatter(block.content))
      if (!fm.title) continue
      const name = basenameNoExt(block.path)
      expect(String(fm.title).trim().toLowerCase()).toBe(name.toLowerCase())
    }
  })

  // T-23
  it("T-23 缺失 END FILE 的 ingest 路径过滤后一致性通过", () => {
    const { written } = simulateWriteBlocks(MISSING_END_FILE_OUTPUT, "2023体检报告")
    const violations = checkConsistency(written)
    expect(violations).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART E: 跨源隔离（test6 真实跨源污染场景）
// ══════════════════════════════════════════════════════════════════════════════

describe("跨源隔离 — test6 场景", () => {
  // T-24
  it("T-24 2025 ingest 试图写 2023 路径的文件 → 被 rejected", () => {
    const crossOutput = CORRECT_2025 + `\n---FILE: wiki/sources/2023体检报告/entities/韩松.md---\n跨源污染\n---END FILE---`
    const { rejected } = simulateWriteBlocks(crossOutput, "2025体检报告")
    expect(rejected.some((r) => r.includes("2023体检报告"))).toBe(true)
  })

  // T-25（test6 核心 Bug：sources 字段跨源）
  it("T-25 跨源 sources 污染被 INV-3 检出：2025目录下文件 sources 引用 2023", () => {
    const { written } = simulateWriteBlocks(BUGGY_2025_CROSS_SOURCE, "2025体检报告")
    const violations = checkConsistency(written)
    const inv3 = violations.filter((v) => v.code === "INV-3")
    expect(inv3.length).toBeGreaterThanOrEqual(1)
  })

  // T-26
  it("T-26 2025 ingest 完成后的 2023 ingest 中源污染被检出", () => {
    const { written } = simulateWriteBlocks(BUGGY_2025_AFTER_2023_CONTAMINATION, "2025体检报告")
    const violations = checkConsistency(written)
    expect(violations.filter((v) => v.code === "INV-3").length).toBeGreaterThan(0)
  })

  // T-27
  it("T-27 三年 ingest 各自独立完成后，合并文件系统一致性通过", () => {
    const fs2023 = simulateWriteBlocks(CORRECT_2023, "2023体检报告").written
    const fs2024 = simulateWriteBlocks(CORRECT_2024, "2024体检报告").written
    const fs2025 = simulateWriteBlocks(CORRECT_2025, "2025体检报告").written
    const allBlocks = [...fs2023, ...fs2024, ...fs2025]
    const violations = checkConsistency(allBlocks)
    expect(violations).toHaveLength(0)
  })

  // T-28
  it("T-28 2023 和 2025 都有韩松.md，内容不同，各自一致", () => {
    const fs2023 = simulateWriteBlocks(CORRECT_2023, "2023体检报告").written
    const fs2025 = simulateWriteBlocks(CORRECT_2025, "2025体检报告").written

    const hs2023 = fs2023.find((b) => b.path === "wiki/sources/2023体检报告/entities/韩松.md")
    const hs2025 = fs2025.find((b) => b.path === "wiki/sources/2025体检报告/entities/韩松.md")

    expect(hs2023).toBeDefined()
    expect(hs2025).toBeDefined()
    expect(hs2023!.content).not.toBe(hs2025!.content)
    // 分别检查一致性
    expect(checkConsistency([hs2023!])).toHaveLength(0)
    expect(checkConsistency([hs2025!])).toHaveLength(0)
  })

  // T-29
  it("T-29 2025 源污染场景中：污染检测不影响正确的 2023 ingest 文件", () => {
    const fs = simulateFileSystem([
      { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
      { llmOutput: BUGGY_2025_CROSS_SOURCE, sourceBase: "2025体检报告" },
    ])
    const all = fsToBlocks(fs)
    const violations = checkConsistency(all)

    // 2023 的文件应全部通过
    const v2023 = violations.filter((v) => v.path.includes("2023体检报告"))
    expect(v2023).toHaveLength(0)

    // 2025 的违规应存在
    const v2025 = violations.filter((v) => v.path.includes("2025体检报告"))
    expect(v2025.length).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART F: 内容重复检测
// ══════════════════════════════════════════════════════════════════════════════

describe("内容重复检测（test6 韩松.md == 珠海奥乐医院.md 场景）", () => {
  /**
   * 在 test6 中，韩松.md 和 珠海奥乐医院.md 的内容完全相同。
   * 这是最严重的错误之一：两个不同的实体文件有完全相同的内容。
   */
  function detectDuplicateContent(
    blocks: Array<{ path: string; content: string }>,
  ): Array<[string, string]> {
    const duplicates: Array<[string, string]> = []
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        if (
          blocks[i].content.trim() === blocks[j].content.trim() &&
          blocks[i].path !== blocks[j].path
        ) {
          duplicates.push([blocks[i].path, blocks[j].path])
        }
      }
    }
    return duplicates
  }

  // T-30
  it("T-30 正确的 2023 ingest：无重复内容", () => {
    const blocks = parseFileBlocks(CORRECT_2023)
    const dups = detectDuplicateContent(blocks)
    expect(dups).toHaveLength(0)
  })

  // T-31（test6 Bug 场景）
  it("T-31 Buggy 2023：韩松.md 和 珠海奥乐医院.md 内容重复被检测出", () => {
    const blocks = parseFileBlocks(BUGGY_2023_DUPLICATE_ENTITY)
    const dups = detectDuplicateContent(blocks)
    const entityDups = dups.filter(
      ([a, b]) => a.includes("/entities/") && b.includes("/entities/"),
    )
    expect(entityDups.length).toBeGreaterThan(0)
  })

  // T-32
  it("T-32 三年正确 ingest 合并后无重复内容（不同源的同名文件内容不同）", () => {
    const blocks = [
      ...parseFileBlocks(CORRECT_2023),
      ...parseFileBlocks(CORRECT_2024),
      ...parseFileBlocks(CORRECT_2025),
    ]
    // 同名但不同源的文件不算重复（路径不同）
    const same_source_dups = detectDuplicateContent(blocks).filter(
      ([a, b]) => {
        const srcA = sourceBaseFromPath(a)
        const srcB = sourceBaseFromPath(b)
        return srcA === srcB // 只有同源才算真重复
      },
    )
    expect(same_source_dups).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART G: 并发 ingest 时序场景（模拟并发写入竞态）
// ══════════════════════════════════════════════════════════════════════════════

describe("并发 ingest 时序（竞态场景）", () => {
  /**
   * 并发场景下，多个 ingest 同时写入文件，最终状态取决于写入顺序。
   * 通过排列组合不同的写入顺序来验证最终一致性。
   */
  function allPermutations<T>(arr: T[]): T[][] {
    if (arr.length <= 1) return [arr]
    const result: T[][] = []
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
      for (const perm of allPermutations(rest)) {
        result.push([arr[i], ...perm])
      }
    }
    return result
  }

  const INGESTS = [
    { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
    { llmOutput: CORRECT_2024, sourceBase: "2024体检报告" },
    { llmOutput: CORRECT_2025, sourceBase: "2025体检报告" },
  ]

  // T-33
  it("T-33 三年 ingest 所有 6 种写入顺序都通过一致性检查", () => {
    const perms = allPermutations(INGESTS)
    expect(perms).toHaveLength(6)

    for (const perm of perms) {
      const fs = simulateFileSystem(perm)
      const violations = checkConsistency(fsToBlocks(fs))
      expect(violations).toHaveLength(0)
    }
  })

  // T-34
  it("T-34 正确2023 + 错误2025（跨源污染）的混合场景：2023通过，2025有违规", () => {
    const perms = [
      [
        { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
        { llmOutput: BUGGY_2025_CROSS_SOURCE, sourceBase: "2025体检报告" },
      ],
      [
        { llmOutput: BUGGY_2025_CROSS_SOURCE, sourceBase: "2025体检报告" },
        { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
      ],
    ]
    for (const perm of perms) {
      const fs = simulateFileSystem(perm)
      const violations = checkConsistency(fsToBlocks(fs))
      // 2025 目录必有违规
      expect(violations.some((v) => v.path.includes("2025体检报告"))).toBe(true)
      // 2023 目录无违规
      expect(violations.some((v) => v.path.includes("2023体检报告"))).toBe(false)
    }
  })

  // T-35
  it("T-35 同一 source 并发两次 ingest（两次输出相同）：结果一致", () => {
    const ops = [
      { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
      { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
    ]
    const fs = simulateFileSystem(ops)
    const violations = checkConsistency(fsToBlocks(fs))
    expect(violations).toHaveLength(0)
  })

  // T-36
  it("T-36 同一 source 并发两次 ingest（第一次有 Bug，第二次正确）：后写覆盖", () => {
    const ops = [
      { llmOutput: BUGGY_2023_DUPLICATE_ENTITY, sourceBase: "2023体检报告" },
      { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
    ]
    const fs = simulateFileSystem(ops)
    const violations = checkConsistency(fsToBlocks(fs))
    expect(violations).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART H: 部分完成 / 增量 ingest 场景
// ══════════════════════════════════════════════════════════════════════════════

describe("部分完成与增量 ingest 场景", () => {
  // T-37（只完成了一部分文件的 ingest）
  it("T-37 2023 ingest 只完成了实体文件（concepts 未写），已写的文件一致性通过", () => {
    const partialOutput = `---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
type: entity
title: 韩松
sources: ["2023体检报告.pdf"]
---
韩松的信息。
---END FILE---
---FILE: wiki/sources/2023体检报告/entities/珠海奥乐医院.md---
---
type: entity
title: 珠海奥乐医院
sources: ["2023体检报告.pdf"]
---
珠海奥乐医院的信息。
---END FILE---`
    const { written } = simulateWriteBlocks(partialOutput, "2023体检报告")
    const violations = checkConsistency(written)
    expect(violations).toHaveLength(0)
  })

  // T-38（增量：第一次只写 2023，第二次补 2024）
  it("T-38 增量 ingest：先完成 2023 再完成 2024，合并后一致性通过", () => {
    const fs = simulateFileSystem([
      { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
    ])
    // 增量写入 2024
    const r2024 = simulateWriteBlocks(CORRECT_2024, "2024体检报告")
    for (const { path, content } of r2024.written) {
      fs.set(path, content)
    }
    const violations = checkConsistency(fsToBlocks(fs))
    expect(violations).toHaveLength(0)
  })

  // T-39（空内容块被跳过后，其他文件正常）
  it("T-39 部分块内容为空（被 skip）时，有内容的块一致性通过", () => {
    const output = `---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
type: entity
title: 韩松
sources: ["2023体检报告.pdf"]
---
韩松内容。
---END FILE---
---FILE: wiki/sources/2023体检报告/entities/空内容.md---
---END FILE---
---FILE: wiki/sources/2023体检报告/concepts/肥胖.md---
---
type: concept
title: 肥胖
sources: ["2023体检报告.pdf"]
---
肥胖内容。
---END FILE---`
    const { written } = simulateWriteBlocks(output, "2023体检报告")
    // 空内容的块被跳过
    expect(written.some((b) => b.path.includes("空内容"))).toBe(false)
    // 有内容的块一致性通过
    const violations = checkConsistency(written)
    expect(violations).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PART I: 边缘场景发散
// ══════════════════════════════════════════════════════════════════════════════

describe("边缘场景发散", () => {
  // T-40（实体名包含年份数字，不与 sourceBase 混淆）
  it("T-40 实体名含年份数字不影响 sourceBase 匹配", () => {
    const output = `---FILE: wiki/sources/2023体检报告/entities/2023年度体检.md---
---
type: entity
title: 2023年度体检
sources: ["2023体检报告.pdf"]
---
2023年度体检的信息。
---END FILE---`
    const blocks = parseFileBlocks(output)
    const violations = checkConsistency(blocks)
    expect(violations).toHaveLength(0)
  })

  // T-41（title 含特殊字符）
  it("T-41 title 含括号等特殊字符时文件名能匹配", () => {
    const output = `---FILE: wiki/sources/2023体检报告/concepts/ALT升高(转氨酶).md---
---
type: concept
title: ALT升高(转氨酶)
sources: ["2023体检报告.pdf"]
---
ALT升高内容。
---END FILE---`
    const blocks = parseFileBlocks(output)
    const violations = checkConsistency(blocks)
    expect(violations).toHaveLength(0)
  })

  // T-42（sources 是字符串格式而不是数组时，以字符串方式匹配）
  it("T-42 sources 为字符串格式时以字符串形式匹配 sourceBase", () => {
    const output = `---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
type: entity
title: 韩松
sources: 2023体检报告.pdf
---
内容。
---END FILE---`
    const blocks = parseFileBlocks(output)
    // sources 是字符串 "2023体检报告.pdf"，包含 sourceBase "2023体检报告"，应该通过
    const violations = checkConsistency(blocks)
    expect(violations.filter((v) => v.code === "INV-3")).toHaveLength(0)
  })

  // T-43（所有文件名相同但在不同 source 目录下）
  it("T-43 不同 source 目录下的同名文件（轻度脂肪肝.md）各自一致", () => {
    const output2023 = `---FILE: wiki/sources/2023体检报告/concepts/轻度脂肪肝.md---
---
type: concept
title: 轻度脂肪肝
sources: ["2023体检报告.pdf"]
---
2023年轻度脂肪肝表现。
---END FILE---`
    const output2024 = `---FILE: wiki/sources/2024体检报告/concepts/轻度脂肪肝.md---
---
type: concept
title: 轻度脂肪肝
sources: ["2024体检报告.pdf"]
---
2024年轻度脂肪肝表现。
---END FILE---`
    const blocks = [
      ...parseFileBlocks(output2023),
      ...parseFileBlocks(output2024),
    ]
    const violations = checkConsistency(blocks)
    expect(violations).toHaveLength(0)
  })

  // T-44（title 含 wiki 链接语法 [[...]]）
  it("T-44 title 不含 wikilink 语法时不受影响", () => {
    const output = `---FILE: wiki/sources/2023体检报告/concepts/高脂血症.md---
---
type: concept
title: 高脂血症
sources: ["2023体检报告.pdf"]
---
[[高脂血症]]是心脑血管风险因素。
---END FILE---`
    const blocks = parseFileBlocks(output)
    expect(checkConsistency(blocks)).toHaveLength(0)
  })

  // T-45（LLM 在同一个块内重复输出相同路径两次）
  it("T-45 同一路径在 LLM 输出中出现两次：只保留第一次（幂等性）", () => {
    const output = `---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
type: entity
title: 韩松
sources: ["2023体检报告.pdf"]
---
第一次韩松内容。
---END FILE---
---FILE: wiki/sources/2023体检报告/entities/韩松.md---
---
type: entity
title: 韩松
sources: ["2023体检报告.pdf"]
---
第二次韩松内容（应被丢弃）。
---END FILE---`
    const { written } = simulateWriteBlocks(output, "2023体检报告")
    const hanSong = written.filter((b) => b.path.includes("韩松.md"))
    expect(hanSong).toHaveLength(1)
    expect(hanSong[0].content).toContain("第一次韩松内容")
  })

  // T-46（ingest 后追加 overview.md）
  it("T-46 wiki/overview.md 被允许写入，且不参与 title 检查", () => {
    const output = CORRECT_2023 + `
---FILE: wiki/overview.md---
# Wiki Overview
本 wiki 包含三年体检报告分析。
---END FILE---`
    const { written, rejected } = simulateWriteBlocks(output, "2023体检报告")
    expect(written.some((b) => b.path === "wiki/overview.md")).toBe(true)
    expect(rejected).toHaveLength(0)
    const violations = checkConsistency(written)
    expect(violations).toHaveLength(0)
  })

  // T-47（路径大小写差异 — 使用 ASCII sourceBase）
  it("T-47 路径 sourceBase 大小写必须完全匹配（ASCII）", () => {
    const output = `---FILE: wiki/sources/MySource/entities/Entity.md---
---
type: entity
title: Entity
sources: ["MySource.pdf"]
---
内容。
---END FILE---`
    // 使用全小写 sourceBase，不匹配驼峰路径
    const { rejected } = simulateWriteBlocks(output, "mysource")
    expect(rejected.length).toBeGreaterThan(0)
  })

  // T-48（100个文件的大型 ingest）
  it("T-48 100个 concepts 文件的大型 ingest：全部通过一致性检查", () => {
    const lines: string[] = []
    for (let i = 0; i < 100; i++) {
      lines.push(`---FILE: wiki/sources/大型文档/concepts/概念${i}.md---`)
      lines.push(`---`)
      lines.push(`type: concept`)
      lines.push(`title: 概念${i}`)
      lines.push(`sources: ["大型文档.pdf"]`)
      lines.push(`---`)
      lines.push(``)
      lines.push(`概念${i}的详细说明，包含医学术语和临床意义。`)
      lines.push(`---END FILE---`)
    }
    const { written } = simulateWriteBlocks(lines.join("\n"), "大型文档")
    expect(written).toHaveLength(100)
    const violations = checkConsistency(written)
    expect(violations).toHaveLength(0)
  })

  // T-49（sources 字段含 .pdf 扩展名 vs 不含）
  it("T-49 sources 含 .pdf 后缀时 sourceBase 匹配仍然有效", () => {
    const blocks = [
      {
        path: "wiki/sources/2023体检报告/entities/韩松.md",
        content: `---\ntitle: 韩松\ntype: entity\nsources: ["2023体检报告.pdf"]\n---\n内容`,
      },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })

  // T-50（实体名含 . 号）
  it("T-50 概念名称包含点号时文件名匹配不受干扰", () => {
    const output = `---FILE: wiki/sources/2023体检报告/concepts/BMI≥28.md---
---
type: concept
title: BMI≥28
sources: ["2023体检报告.pdf"]
---
BMI大于等于28属于肥胖范围。
---END FILE---`
    const blocks = parseFileBlocks(output)
    expect(checkConsistency(blocks)).toHaveLength(0)
  })

  // T-51（从磁盘读取真实 test6 数据验证一致性违规）
  it("T-51 test6 真实 Buggy 数据结构：基于 fixture 验证检测到预期违规数量", () => {
    // 使用 BUGGY_2023_DUPLICATE_ENTITY（模拟 test6 实际状态）
    const blocks = parseFileBlocks(BUGGY_2023_DUPLICATE_ENTITY)
    const violations = checkConsistency(blocks)

    // test6 中观察到的违规：
    // - 韩松.md: title=珠海奥乐医院 (INV-2)
    // - ALT升高.md: title=肥胖 (INV-2)
    // - 肺结节.md: title=肥胖 (INV-2)
    // - 高脂血症.md: title=轻度脂肪肝 (INV-2)
    expect(violations.filter((v) => v.code === "INV-2").length).toBeGreaterThanOrEqual(3)
  })

  // T-52（三年全部 Bug 数据合并后违规总数正确）
  it("T-52 三年 Buggy 数据合并：违规数量 ≥ 预期最小值", () => {
    const buggy2023 = parseFileBlocks(BUGGY_2023_DUPLICATE_ENTITY)
    const buggy2025 = parseFileBlocks(BUGGY_2025_CROSS_SOURCE)
    const violations = checkConsistency([...buggy2023, ...buggy2025])
    expect(violations.length).toBeGreaterThanOrEqual(5)
  })

  // T-53（只有 overview 和 log 时，无 violations）
  it("T-53 只有 overview.md 和 log.md 时检查通过", () => {
    const blocks = [
      { path: "wiki/overview.md", content: "# Overview\n全局概述。" },
      { path: "wiki/log.md", content: "日志记录。" },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })

  // T-54（所有正确 ingest 的 written 总数正确）
  it("T-54 三年正确 ingest 写入文件总数符合预期", () => {
    const r2023 = simulateWriteBlocks(CORRECT_2023, "2023体检报告")
    const r2024 = simulateWriteBlocks(CORRECT_2024, "2024体检报告")
    const r2025 = simulateWriteBlocks(CORRECT_2025, "2025体检报告")

    // 2023: 1 summary + 2 entities + 8 concepts = 11
    expect(r2023.written.length).toBe(11)
    // 2024: 1 summary + 1 entity + 8 concepts = 10
    expect(r2024.written.length).toBe(10)
    // 2025: 1 summary + 2 entities + 11 concepts = 14
    expect(r2025.written.length).toBe(14)
  })

  // T-55（不同类型的 violations 互相独立）
  it("T-55 同一文件同时存在 INV-2 和 INV-3 时均被独立报告", () => {
    const blocks = [
      {
        path: "wiki/sources/2023体检报告/entities/韩松.md",
        content: `---
title: 珠海奥乐医院
type: entity
sources: ["2025体检报告.pdf"]
---
内容`,
      },
    ]
    const violations = checkConsistency(blocks)
    expect(violations.some((v) => v.code === "INV-2")).toBe(true)
    expect(violations.some((v) => v.code === "INV-3")).toBe(true)
  })

  // T-56（汇总页 sourceBase.md 不含子目录路径）
  it("T-56 sourceBase.md 汇总页不被 INV-4 检查，允许不含 type", () => {
    const blocks = [
      {
        path: "wiki/sources/2023体检报告.md",
        content: `---
title: 2023体检报告
sources: ["2023体检报告.pdf"]
---
汇总页内容。`,
      },
    ]
    expect(checkConsistency(blocks)).toHaveLength(0)
  })

  // T-57（验证 violations 的 path 字段包含完整相对路径）
  it("T-57 violation 的 path 字段包含完整相对路径", () => {
    const blocks = [
      {
        path: "wiki/sources/2023体检报告/entities/韩松.md",
        content: `---
title: 错误
type: entity
sources: ["2023体检报告.pdf"]
---
内容`,
      },
    ]
    const violations = checkConsistency(blocks)
    expect(violations[0].path).toBe("wiki/sources/2023体检报告/entities/韩松.md")
  })

  // T-58（entities 目录下的 sources 包含 .pdf 后缀验证）
  it("T-58 2024 entities 只有珠海奥乐医院，一致性通过", () => {
    const { written } = simulateWriteBlocks(CORRECT_2024, "2024体检报告")
    const entities = written.filter((b) => b.path.includes("/entities/"))
    expect(entities).toHaveLength(1)
    expect(entities[0].path).toContain("珠海奥乐医院")
    const violations = checkConsistency(entities)
    expect(violations).toHaveLength(0)
  })

  // T-59（多次 ingest 后所有 violations 可追溯到具体文件）
  it("T-59 Bug 场景下每条 violation 都能追溯到具体 path", () => {
    const blocks = parseFileBlocks(BUGGY_2023_DUPLICATE_ENTITY)
    const violations = checkConsistency(blocks)
    for (const v of violations) {
      expect(v.path).toBeTruthy()
      expect(v.path.startsWith("wiki/")).toBe(true)
      expect(v.code).toMatch(/^INV-\d+$/)
      expect(v.detail).toBeTruthy()
    }
  })

  // T-60（压力测试：三年各 50 个文件，全部正确，无任何违规）
  it("T-60 压力测试：三年各 50 个 concepts 全部正确时违规数为 0", () => {
    const years = ["2023体检报告", "2024体检报告", "2025体检报告"]
    const allWritten: Array<{ path: string; content: string }> = []
    for (const year of years) {
      const lines: string[] = []
      for (let i = 0; i < 50; i++) {
        lines.push(`---FILE: wiki/sources/${year}/concepts/概念${i}.md---`)
        lines.push(`---\ntype: concept\ntitle: 概念${i}\nsources: ["${year}.pdf"]\n---\n概念${i}内容。`)
        lines.push(`---END FILE---`)
      }
      const { written } = simulateWriteBlocks(lines.join("\n"), year)
      allWritten.push(...written)
    }
    expect(allWritten).toHaveLength(150)
    const violations = checkConsistency(allWritten)
    expect(violations).toHaveLength(0)
  })
})

describe("外部 fixture 时序回归", () => {
  it("T-61 外部/回退 fixture 合并写入后，expectedViolations 与最终状态一致", async () => {
    const { fixtures } = await loadFixturesWithFallback()
    const operations = fixtures.map((fixture) => ({
      llmOutput: fixture.llmRawOutput,
      sourceBase: fixture.sourceName.replace(/\.[^.]+$/, ""),
      expectedViolations: fixture.expectedViolations ?? [],
    }))

    const fsMap = simulateFileSystem(
      operations.map(({ llmOutput, sourceBase }) => ({ llmOutput, sourceBase })),
    )
    const violations = checkConsistency(fsToBlocks(fsMap))
    const actualCodes = new Set(violations.map((v) => v.code))

    const requiredCodes = new Set(
      operations.flatMap((op) => op.expectedViolations),
    )
    for (const code of requiredCodes) {
      expect(actualCodes.has(code)).toBe(true)
    }
  })
})

describe("post-rebuild 计数门禁时序", () => {
  function extractNamesByType(blocks: Array<{ path: string; content: string }>): {
    entityNames: string[]
    conceptNames: string[]
  } {
    const entityNames = blocks
      .filter((block) => block.path.includes("/entities/"))
      .map((block) => basenameNoExt(block.path))
    const conceptNames = blocks
      .filter((block) => block.path.includes("/concepts/"))
      .map((block) => basenameNoExt(block.path))
    return { entityNames, conceptNames }
  }

  it("T-62 并发完成态快照下计划数量与最终数量一致时通过", () => {
    const analysis = [
      "## File Plan",
      "ENTITY: 韩松 | 受检者",
      "ENTITY: 珠海奥乐医院 | 体检机构",
      "CONCEPT: 高脂血症 | 代谢异常",
      "CONCEPT: 轻度脂肪肝 | 影像学概念",
    ].join("\n")
    const items = parsePlan(analysis)
    const expectedEntityNames = items.filter((item) => item.type === "entity").map((item) => item.name)
    const expectedConceptNames = items.filter((item) => item.type === "concept").map((item) => item.name)

    const fsMap = simulateFileSystem([
      { llmOutput: CORRECT_2023, sourceBase: "2023体检报告" },
      { llmOutput: CORRECT_2025, sourceBase: "2025体检报告" },
      { llmOutput: CORRECT_2024, sourceBase: "2024体检报告" },
    ])
    const finalBlocks = fsToBlocks(fsMap).filter((block) => block.path.includes("wiki/sources/2023体检报告/"))
    const actual = extractNamesByType(finalBlocks)
    const gate = evaluatePlannedCountGate({
      expectedEntityNames,
      expectedConceptNames,
      actualEntityNames: actual.entityNames,
      actualConceptNames: actual.conceptNames,
    })
    expect(gate.ok).toBe(true)
  })

  it("T-63 并发完成态快照下若拒写导致数量不足则失败", () => {
    const items = parsePlan([
      "## File Plan",
      "ENTITY: 韩松 | 受检者",
      "ENTITY: 珠海奥乐医院 | 体检机构",
      "CONCEPT: ALT升高 | 指标异常",
      "CONCEPT: 高脂血症 | 代谢异常",
    ].join("\n"))
    const expectedEntityNames = items.filter((item) => item.type === "entity").map((item) => item.name)
    const expectedConceptNames = items.filter((item) => item.type === "concept").map((item) => item.name)

    const insufficientOutput = [
      "---FILE: wiki/sources/2023体检报告/entities/韩松.md---",
      "---",
      "type: entity",
      "title: 韩松",
      "sources: [\"2023体检报告.pdf\"]",
      "---",
      "韩松实体页。",
      "---END FILE---",
      "---FILE: wiki/sources/2023体检报告/concepts/高脂血症.md---",
      "---",
      "type: concept",
      "title: 高脂血症",
      "sources: [\"2023体检报告.pdf\"]",
      "---",
      "高脂血症概念页。",
      "---END FILE---",
    ].join("\n")
    const { written } = simulateWriteBlocks(insufficientOutput, "2023体检报告")
    const actual = extractNamesByType(written)
    const gate = evaluatePlannedCountGate({
      expectedEntityNames,
      expectedConceptNames,
      actualEntityNames: actual.entityNames,
      actualConceptNames: actual.conceptNames,
    })
    expect(gate.ok).toBe(false)
    expect(gate.detail).toContain("planned_count_mismatch")
  })
})
