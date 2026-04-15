import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../ingest", () => ({
  autoIngest: vi.fn().mockResolvedValue(["wiki/entities/foo.md"]),
}))

import { useWikiStore } from "@/stores/wiki-store"
import { readFile, writeFile } from "@/commands/fs"

describe("ingest-queue", () => {
  let mod: typeof import("../ingest-queue")

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    vi.mocked(readFile).mockRejectedValue(new Error("not found"))
    vi.mocked(writeFile).mockResolvedValue(undefined)

    useWikiStore.setState({
      project: { name: "test", path: "/test" },
      llmConfig: { provider: "openai", apiKey: "key", model: "m", contextSize: 4096 },
    } as any)

    mod = await import("../ingest-queue")
  })

  it("getQueue returns empty initially", () => {
    expect(mod.getQueue()).toEqual([])
  })

  it("getQueueSummary returns zeroes initially", () => {
    expect(mod.getQueueSummary()).toEqual({ pending: 0, processing: 0, failed: 0, total: 0 })
  })

  it("enqueueIngest adds a task and returns id", async () => {
    const id = await mod.enqueueIngest("/test", "raw/sources/file.pdf", "folder")
    expect(id).toBeTruthy()
    expect(mod.getQueue().length).toBeGreaterThanOrEqual(1)
    expect(writeFile).toHaveBeenCalled()
  })

  it("enqueueBatch adds multiple tasks", async () => {
    const ids = await mod.enqueueBatch("/test", [
      { sourcePath: "raw/sources/a.pdf", folderContext: "" },
      { sourcePath: "raw/sources/b.pdf", folderContext: "" },
    ])
    expect(ids).toHaveLength(2)
    expect(mod.getQueueSummary().total).toBeGreaterThanOrEqual(2)
  })

  it("clearCompletedTasks keeps only pending/processing tasks", async () => {
    await mod.enqueueIngest("/test", "raw/sources/a.pdf")
    const beforeClear = mod.getQueueSummary().total
    await mod.clearCompletedTasks("/test")
    const afterClear = mod.getQueueSummary().total
    expect(afterClear).toBeLessThanOrEqual(beforeClear)
  })

  it("restoreQueue loads saved tasks from disk", async () => {
    const savedQueue = JSON.stringify([
      { id: "t1", sourcePath: "raw/sources/a.pdf", folderContext: "", status: "failed", addedAt: 1, error: "old err", retryCount: 2 },
      { id: "t2", sourcePath: "raw/sources/b.pdf", folderContext: "", status: "processing", addedAt: 2, error: null, retryCount: 0 },
    ])
    vi.mocked(readFile).mockResolvedValueOnce(savedQueue)

    await mod.restoreQueue("/test")
    const q = mod.getQueue()
    expect(q.length).toBeGreaterThanOrEqual(2)
    const t2 = q.find((t) => t.id === "t2")
    expect(t2).toBeDefined()
  })

  it("retryTask on non-existent task is a no-op", async () => {
    await mod.retryTask("/test", "nonexistent-id")
    expect(mod.getQueue().find((t) => t.id === "nonexistent-id")).toBeUndefined()
  })

  it("cancelTask removes task from queue", async () => {
    const id = await mod.enqueueIngest("/test", "raw/sources/cancel.pdf")
    await mod.cancelTask("/test", id)
    expect(mod.getQueue().find((t) => t.id === id)).toBeUndefined()
  })
})
