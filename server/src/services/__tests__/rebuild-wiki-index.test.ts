import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { rebuildWikiIndex } from "../ingest-service.js"

const tempDirs: string[] = []

async function makeTempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-index-"))
  tempDirs.push(dir)
  await fs.mkdir(path.join(dir, "wiki"), { recursive: true })
  return dir
}

async function writeWikiFile(projectDir: string, relPath: string, content: string): Promise<void> {
  const full = path.join(projectDir, "wiki", relPath)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, content, "utf-8")
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe("rebuildWikiIndex", () => {
  it("按 frontmatter 扫描并重建 index.md，忽略 index/log/overview", async () => {
    const projectDir = await makeTempProject()
    await writeWikiFile(
      projectDir,
      "sources/2023体检报告.md",
      `---
type: source
title: 2023体检报告
---
source page`,
    )
    await writeWikiFile(
      projectDir,
      "sources/2023体检报告/entities/韩松.md",
      `---
type: entity
title: 韩松
---
entity page`,
    )
    await writeWikiFile(
      projectDir,
      "sources/2023体检报告/concepts/高脂血症.md",
      `---
type: concept
title: 高脂血症
---
concept page`,
    )
    await writeWikiFile(projectDir, "overview.md", "legacy overview")
    await writeWikiFile(projectDir, "log.md", "legacy log")
    await writeWikiFile(projectDir, "index.md", "legacy index")

    await rebuildWikiIndex(projectDir)
    const index = await fs.readFile(path.join(projectDir, "wiki", "index.md"), "utf-8")

    expect(index).toContain("# Wiki Index")
    expect(index).toContain("## Sources")
    expect(index).toContain("- [[2023体检报告]] — 2023体检报告")
    expect(index).toContain("## Entitys")
    expect(index).toContain("- [[韩松]] — 韩松")
    expect(index).toContain("## Concepts")
    expect(index).toContain("- [[高脂血症]] — 高脂血症")
    expect(index).not.toContain("legacy overview")
    expect(index).not.toContain("legacy log")
  })

  it("对缺失 title/type 的页面使用默认值并写入 other 分组", async () => {
    const projectDir = await makeTempProject()
    await writeWikiFile(projectDir, "custom/foo.md", `---
updated: 2026-01-01
---
foo body`)

    await rebuildWikiIndex(projectDir)
    const index = await fs.readFile(path.join(projectDir, "wiki", "index.md"), "utf-8")
    expect(index).toContain("## Others")
    expect(index).toContain("- [[foo]] — foo")
  })
})

