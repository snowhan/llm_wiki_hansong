/**
 * TDD tests for rebuild-summary service functions.
 * These tests verify the task management layer only;
 * LLM call / file I/O is not tested here.
 */
import { describe, it, expect } from "vitest"
import {
  startRebuildSummaryTask,
  getRebuildSummaryTask,
  type RebuildSummaryTask,
} from "../ingest-service.js"

describe("startRebuildSummaryTask", () => {
  it("返回一个非空 taskId", () => {
    const taskId = startRebuildSummaryTask("proj-001")
    expect(typeof taskId).toBe("string")
    expect(taskId.length).toBeGreaterThan(0)
  })

  it("每次调用返回不同的 taskId", () => {
    const id1 = startRebuildSummaryTask("proj-001")
    const id2 = startRebuildSummaryTask("proj-002")
    expect(id1).not.toBe(id2)
  })
})

describe("getRebuildSummaryTask", () => {
  it("通过 taskId 可以获取刚创建的任务", () => {
    const taskId = startRebuildSummaryTask("proj-getTask")
    const task = getRebuildSummaryTask(taskId)
    expect(task).toBeDefined()
    expect(task!.id).toBe(taskId)
    expect(task!.projectId).toBe("proj-getTask")
  })

  it("任务初始状态为 pending 或 running", () => {
    const taskId = startRebuildSummaryTask("proj-status")
    const task = getRebuildSummaryTask(taskId)!
    expect(["pending", "running"]).toContain(task.status)
  })

  it("任务包含必要字段", () => {
    const taskId = startRebuildSummaryTask("proj-fields")
    const task = getRebuildSummaryTask(taskId) as RebuildSummaryTask
    expect(task).toMatchObject({
      id: expect.any(String),
      projectId: expect.any(String),
      status: expect.any(String),
      detail: expect.any(String),
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
    expect(task.error === null || typeof task.error === "string").toBe(true)
  })

  it("未知 taskId 返回 undefined", () => {
    const task = getRebuildSummaryTask("non-existent-id-xyz")
    expect(task).toBeUndefined()
  })
})
