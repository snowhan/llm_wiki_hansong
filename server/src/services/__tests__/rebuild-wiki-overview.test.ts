/**
 * TDD tests for OPT-04: rebuildWikiOverview semantic upgrade.
 * Uses a real temp directory (same pattern as rebuild-wiki-index.test.ts).
 */
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { rebuildWikiOverview } from "../ingest-service.js"

const tempDirs: string[] = []

async function makeTempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-overview-"))
  tempDirs.push(dir)
  await fs.mkdir(path.join(dir, "wiki"), { recursive: true })
  return dir
}

async function writeWikiFile(projectDir: string, relPath: string, content: string): Promise<void> {
  const full = path.join(projectDir, "wiki", relPath)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, content, "utf-8")
}

async function readOverview(projectDir: string): Promise<string> {
  return fs.readFile(path.join(projectDir, "wiki", "overview.md"), "utf-8")
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe("rebuildWikiOverview — OPT-04 语义摘要升级", () => {
  it("source 页面有 description 字段时，overview 使用 description 而非正文首行", async () => {
    const projectDir = await makeTempProject()
    await writeWikiFile(
      projectDir,
      "sources/2024体检报告.md",
      `---
type: source
title: 2024体检报告
description: 2024年年度体检结果，包含血压、血糖等各项指标及建议。
---
# 2024体检报告
正文内容在这里…`,
    )

    await rebuildWikiOverview(projectDir)
    const overview = await readOverview(projectDir)

    expect(overview).toContain("2024年年度体检结果")
    expect(overview).not.toContain("正文内容在这里")
  })

  it("source 页面无 description 时，overview 回退到正文首行", async () => {
    const projectDir = await makeTempProject()
    await writeWikiFile(
      projectDir,
      "sources/无描述报告.md",
      `---
type: source
title: 无描述报告
---
这是正文的第一行内容。`,
    )

    await rebuildWikiOverview(projectDir)
    const overview = await readOverview(projectDir)

    expect(overview).toContain("这是正文的第一行内容")
  })

  it("overview 包含 ## Key Entities 段落", async () => {
    const projectDir = await makeTempProject()
    await writeWikiFile(
      projectDir,
      "sources/src/entities/韩松.md",
      `---
type: entity
title: 韩松
---
entity content`,
    )

    await rebuildWikiOverview(projectDir)
    const overview = await readOverview(projectDir)

    expect(overview).toContain("Key Entities")
    expect(overview).toContain("[[韩松]]")
  })

  it("overview 包含 ## Key Concepts 段落", async () => {
    const projectDir = await makeTempProject()
    await writeWikiFile(
      projectDir,
      "sources/src/concepts/高尿酸血症.md",
      `---
type: concept
title: 高尿酸血症
---
concept content`,
    )

    await rebuildWikiOverview(projectDir)
    const overview = await readOverview(projectDir)

    expect(overview).toContain("Key Concepts")
    expect(overview).toContain("[[高尿酸血症]]")
  })

  it("Key Entities/Concepts 各最多列出 10 项", async () => {
    const projectDir = await makeTempProject()
    for (let i = 1; i <= 12; i++) {
      await writeWikiFile(
        projectDir,
        `sources/src/entities/entity${i}.md`,
        `---\ntype: entity\ntitle: Entity${i}\n---\ncontent`,
      )
    }

    await rebuildWikiOverview(projectDir)
    const overview = await readOverview(projectDir)

    const matches = overview.match(/\[\[entity\d+\]\]/gi) ?? []
    expect(matches.length).toBeLessThanOrEqual(10)
  })
})
