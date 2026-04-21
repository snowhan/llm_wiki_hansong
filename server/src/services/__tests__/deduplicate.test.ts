/**
 * TDD tests for deduplicate service functions.
 * Tests cover task lifecycle, parseMergePlan parsing, and prompt builders.
 * LLM call / file I/O is NOT tested here.
 */
import { describe, it, expect } from "vitest"
import {
  startDeduplicateTask,
  getDeduplicateTask,
  parseMergePlan,
  buildDeduplicatePrompt,
  buildMergeContentPrompt,
  type DeduplicateTask,
} from "../ingest-service.js"

describe("startDeduplicateTask", () => {
  it("返回一个非空 taskId", () => {
    const taskId = startDeduplicateTask("proj-dedup-001")
    expect(typeof taskId).toBe("string")
    expect(taskId.length).toBeGreaterThan(0)
  })

  it("每次调用返回不同的 taskId", () => {
    const id1 = startDeduplicateTask("proj-dedup-001")
    const id2 = startDeduplicateTask("proj-dedup-002")
    expect(id1).not.toBe(id2)
  })
})

describe("getDeduplicateTask", () => {
  it("通过 taskId 可以获取刚创建的任务", () => {
    const taskId = startDeduplicateTask("proj-dedup-getTask")
    const task = getDeduplicateTask(taskId)
    expect(task).toBeDefined()
    expect(task!.id).toBe(taskId)
    expect(task!.projectId).toBe("proj-dedup-getTask")
  })

  it("任务初始状态为 pending 或 running", () => {
    const taskId = startDeduplicateTask("proj-dedup-status")
    const task = getDeduplicateTask(taskId)!
    expect(["pending", "running"]).toContain(task.status)
  })

  it("任务包含必要字段", () => {
    const taskId = startDeduplicateTask("proj-dedup-fields")
    const task = getDeduplicateTask(taskId) as DeduplicateTask
    expect(task).toMatchObject({
      id: expect.any(String),
      projectId: expect.any(String),
      status: expect.any(String),
      detail: expect.any(String),
      mergeCount: expect.any(Number),
      filesDeleted: expect.any(Array),
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
    expect(task.error === null || typeof task.error === "string").toBe(true)
  })

  it("未知 taskId 返回 undefined", () => {
    const task = getDeduplicateTask("non-existent-dedup-id")
    expect(task).toBeUndefined()
  })
})

describe("buildDeduplicatePrompt", () => {
  it("prompt 中包含传入的 pageListing 内容", () => {
    const listing = "[entity] path: wiki/sources/src1/entities/ai.md | slug: [[ai]] | title: AI | sources: 3"
    const prompt = buildDeduplicatePrompt(listing)
    expect(prompt).toContain(listing)
  })

  it("prompt 包含 MERGE-PLAN 格式说明", () => {
    const prompt = buildDeduplicatePrompt("listing")
    expect(prompt).toContain("---MERGE-PLAN---")
    expect(prompt).toContain("---END MERGE-PLAN---")
    expect(prompt).toContain("canonical")
    expect(prompt).toContain("aliases")
  })

  it("prompt 提示 LLM 使用完整相对路径（非仅 slug）作为 canonical/aliases 标识符", () => {
    const prompt = buildDeduplicatePrompt("listing")
    // Should show example with full path format like sources/2024/entities/example
    expect(prompt).toContain("sources/2024/entities/example")
  })

  it("prompt 使用 sources/<year>/entities/<slug> 格式作为路径示例（不含 wiki/ 前缀）", () => {
    const prompt = buildDeduplicatePrompt("listing")
    expect(prompt).toContain("sources/2024/entities/example")
  })

  it("prompt 不再包含 FILE block 输出指令（第一轮仅识别，不生成内容）", () => {
    const prompt = buildDeduplicatePrompt("listing")
    expect(prompt).not.toContain("---FILE:")
    expect(prompt).not.toContain("---END FILE---")
  })
})

describe("parseMergePlan", () => {
  it("解析含有完整路径的合并计划（同名文件来自不同 source 目录）", () => {
    const output = `
---MERGE-PLAN---
[{"canonical":"sources/2024/entities/珠海奥乐医院","aliases":["sources/2025/entities/珠海奥乐医院"]},{"canonical":"sources/2024/entities/llm","aliases":["sources/2025/entities/large-language-model"]}]
---END MERGE-PLAN---

---FILE: wiki/sources/2024/entities/珠海奥乐医院.md---
---
type: entity
title: 珠海奥乐医院
---
Merged content.
---END FILE---
`.trim()

    const groups = parseMergePlan(output)
    expect(groups).toHaveLength(2)
    expect(groups[0]).toEqual({
      canonical: "sources/2024/entities/珠海奥乐医院",
      aliases: ["sources/2025/entities/珠海奥乐医院"],
    })
    expect(groups[1]).toEqual({
      canonical: "sources/2024/entities/llm",
      aliases: ["sources/2025/entities/large-language-model"],
    })
  })

  it("LLM 输出中无 MERGE-PLAN 区块时返回空数组", () => {
    const output = "---FILE: wiki/sources/2024/entities/ai.md---\ncontent\n---END FILE---"
    const groups = parseMergePlan(output)
    expect(groups).toEqual([])
  })

  it("MERGE-PLAN 区块中 JSON 无效时返回空数组（不抛出异常）", () => {
    const output = "---MERGE-PLAN---\nnot-valid-json\n---END MERGE-PLAN---"
    expect(() => parseMergePlan(output)).not.toThrow()
    const groups = parseMergePlan(output)
    expect(groups).toEqual([])
  })

  it("MERGE-PLAN 为空数组时返回空数组", () => {
    const output = "---MERGE-PLAN---\n[]\n---END MERGE-PLAN---"
    const groups = parseMergePlan(output)
    expect(groups).toEqual([])
  })

  it("也能兼容 LLM 仍使用纯 slug（降级兼容）", () => {
    // LLM might not always follow instructions perfectly; as long as the string
    // parses to objects with canonical+aliases strings, it should not throw
    const output = `
---MERGE-PLAN---
[{"canonical":"ai","aliases":["artificial-intelligence"]}]
---END MERGE-PLAN---
`.trim()
    const groups = parseMergePlan(output)
    expect(groups).toHaveLength(1)
    expect(groups[0].canonical).toBe("ai")
  })
})

describe("buildMergeContentPrompt", () => {
  const canonicalPath = "wiki/sources/2024/entities/珠海奥乐医院.md"

  it("prompt 中包含 canonical FILE block 路径", () => {
    const prompt = buildMergeContentPrompt(
      [{ path: "wiki/sources/2024/entities/珠海奥乐医院.md", content: "内容A" }],
      canonicalPath,
    )
    expect(prompt).toContain(`---FILE: ${canonicalPath}---`)
    expect(prompt).toContain("---END FILE---")
  })

  it("prompt 中包含所有传入词条的路径和内容", () => {
    const entries = [
      { path: "wiki/sources/2024/entities/foo.md", content: "内容A" },
      { path: "wiki/sources/2025/entities/foo.md", content: "内容B" },
    ]
    const prompt = buildMergeContentPrompt(entries, "wiki/sources/2024/entities/foo.md")
    expect(prompt).toContain("wiki/sources/2024/entities/foo.md")
    expect(prompt).toContain("wiki/sources/2025/entities/foo.md")
    expect(prompt).toContain("内容A")
    expect(prompt).toContain("内容B")
  })

  it("正文超过 10000 字符时截断并附加 [...truncated]", () => {
    const longContent = "x".repeat(10001)
    const prompt = buildMergeContentPrompt(
      [{ path: "wiki/sources/2024/entities/foo.md", content: longContent }],
      canonicalPath,
    )
    expect(prompt).toContain("[...truncated]")
    // 原文 10001 字符的内容在 prompt 中不应超过 10000 + truncated 标记
    expect(prompt).not.toContain("x".repeat(10001))
  })

  it("正文恰好 10000 字符时不截断", () => {
    const exactContent = "y".repeat(10000)
    const prompt = buildMergeContentPrompt(
      [{ path: "wiki/sources/2024/entities/foo.md", content: exactContent }],
      canonicalPath,
    )
    expect(prompt).not.toContain("[...truncated]")
    expect(prompt).toContain(exactContent)
  })

  it("prompt 包含 sources union 指令", () => {
    const prompt = buildMergeContentPrompt(
      [{ path: "wiki/sources/2024/entities/foo.md", content: "c" }],
      canonicalPath,
    )
    expect(prompt).toContain("sources")
    expect(prompt).toContain("union")
  })

  it("prompt 强调内容完整性（不删除非重叠信息）", () => {
    const prompt = buildMergeContentPrompt(
      [{ path: "wiki/sources/2024/entities/foo.md", content: "c" }],
      canonicalPath,
    )
    expect(prompt).toMatch(/Preserve|保留/i)
  })
})
