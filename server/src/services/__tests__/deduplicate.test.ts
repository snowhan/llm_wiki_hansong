/**
 * TDD tests for deduplicate service functions.
 * Tests cover task lifecycle and parseMergePlan parsing.
 * LLM call / file I/O is NOT tested here.
 */
import { describe, it, expect } from "vitest"
import {
  startDeduplicateTask,
  getDeduplicateTask,
  parseMergePlan,
  buildDeduplicatePrompt,
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

  it("prompt 提示 LLM 使用 wiki/sources/<source-base>/entities/ 路径格式", () => {
    const prompt = buildDeduplicatePrompt("listing")
    expect(prompt).toContain("wiki/sources/")
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
