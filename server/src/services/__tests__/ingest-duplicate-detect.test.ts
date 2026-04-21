/**
 * TDD tests for OPT-10: detectCrossSourceDuplicates.
 * Verifies that after ingest, entities/concepts sharing a slug across
 * different source directories are flagged as duplicate review items.
 */
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { detectCrossSourceDuplicates } from "../ingest-service.js"

const tempDirs: string[] = []

async function makeTempWiki(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-dedup-detect-"))
  tempDirs.push(dir)
  await fs.mkdir(path.join(dir, "wiki", "sources"), { recursive: true })
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

describe("detectCrossSourceDuplicates", () => {
  it("已有 sources/A/entities/foo.md 时，新写入 sources/B/entities/foo.md 返回 duplicate 项", async () => {
    const projectDir = await makeTempWiki()

    // Existing entity from source A
    await writeWikiFile(
      projectDir,
      "sources/sourceA/entities/珠海奥乐医院.md",
      `---\ntype: entity\ntitle: 珠海奥乐医院\n---\nexisting`,
    )

    // Newly written path from source B
    const newlyWritten = ["wiki/sources/sourceB/entities/珠海奥乐医院.md"]
    // Ensure the new file exists too
    await writeWikiFile(
      projectDir,
      "sources/sourceB/entities/珠海奥乐医院.md",
      `---\ntype: entity\ntitle: 珠海奥乐医院\n---\nnew`,
    )

    const items = await detectCrossSourceDuplicates(
      path.join(projectDir, "wiki"),
      newlyWritten,
    )

    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items[0].type).toBe("duplicate")
    expect(items[0].title).toContain("珠海奥乐医院")
  })

  it("同一 source 目录下无重复时，返回空数组", async () => {
    const projectDir = await makeTempWiki()

    await writeWikiFile(
      projectDir,
      "sources/sourceA/entities/唯一实体.md",
      `---\ntype: entity\ntitle: 唯一实体\n---\ncontent`,
    )

    const newlyWritten = ["wiki/sources/sourceA/entities/唯一实体.md"]

    const items = await detectCrossSourceDuplicates(
      path.join(projectDir, "wiki"),
      newlyWritten,
    )

    expect(items).toHaveLength(0)
  })

  it("concept 重复也能被检测到", async () => {
    const projectDir = await makeTempWiki()

    await writeWikiFile(
      projectDir,
      "sources/sourceA/concepts/高尿酸血症.md",
      `---\ntype: concept\ntitle: 高尿酸血症\n---\nexisting`,
    )
    await writeWikiFile(
      projectDir,
      "sources/sourceB/concepts/高尿酸血症.md",
      `---\ntype: concept\ntitle: 高尿酸血症\n---\nnew`,
    )

    const items = await detectCrossSourceDuplicates(
      path.join(projectDir, "wiki"),
      ["wiki/sources/sourceB/concepts/高尿酸血症.md"],
    )

    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items[0].type).toBe("duplicate")
  })

  it("新写入路径不是 entity/concept 时，不产生 duplicate 项", async () => {
    const projectDir = await makeTempWiki()

    const items = await detectCrossSourceDuplicates(
      path.join(projectDir, "wiki"),
      ["wiki/sources/sourceA.md", "wiki/log.md", "wiki/overview.md"],
    )

    expect(items).toHaveLength(0)
  })
})
