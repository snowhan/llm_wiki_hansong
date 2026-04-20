import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockGetProjectRoot = vi.fn<(projectId: string) => Promise<string>>()
const mockGetState = vi.fn<(key: string) => Promise<unknown>>()

vi.mock("../project-service.js", () => ({
  getProjectRoot: (projectId: string) => mockGetProjectRoot(projectId),
}))

vi.mock("../state-service.js", () => ({
  getState: (key: string) => mockGetState(key),
}))

import { getTask, startIngestTask } from "../ingest-service.js"

const encoder = new TextEncoder()
const tempDirs: string[] = []

function makeOpenAiStreamResponse(fullText: string): Response {
  const payload = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: fullText } }] })}`,
    "data: [DONE]",
    "",
  ].join("\n")
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } })
}

async function waitTaskDone(taskId: string): Promise<void> {
  for (let i = 0; i < 300; i++) {
    const task = getTask(taskId)
    if (task?.status === "done" || task?.status === "error") return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out waiting task ${taskId}`)
}

async function createProjectWithSource(sourceName: string): Promise<{
  projectDir: string
  sourcePath: string
}> {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-ingest-"))
  tempDirs.push(projectDir)
  const sourcePath = `raw/sources/${sourceName}`
  await fs.mkdir(path.join(projectDir, "raw", "sources"), { recursive: true })
  await fs.writeFile(path.join(projectDir, sourcePath), "raw source content", "utf-8")
  return { projectDir, sourcePath }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetState.mockImplementation(async (key: string) => {
    if (key === "llmConfig") {
      return {
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-test",
      }
    }
    return null
  })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe("runIngest write regression", () => {
  it("写入真实 FILE blocks 并产出 source/entity/concept/overview/log", async () => {
    const { projectDir, sourcePath } = await createProjectWithSource("lab-2026.pdf")
    mockGetProjectRoot.mockResolvedValue(projectDir)

    let callIndex = 0
    vi.stubGlobal("fetch", vi.fn(async () => {
      callIndex += 1
      if (callIndex === 1) {
        return makeOpenAiStreamResponse("analysis result")
      }
      return makeOpenAiStreamResponse(
        [
          "---FILE: wiki/sources/lab-2026.md---",
          "---",
          "type: source",
          "title: lab-2026",
          "sources: [\"lab-2026.pdf\"]",
          "---",
          "",
          "lab-2026 source summary",
          "---END FILE---",
          "---FILE: wiki/sources/lab-2026/entities/韩松.md---",
          "---",
          "type: entity",
          "title: 韩松",
          "sources: [\"lab-2026.pdf\"]",
          "---",
          "",
          "韩松 entity body",
          "---END FILE---",
          "---FILE: wiki/sources/lab-2026/concepts/高脂血症.md---",
          "---",
          "type: concept",
          "title: 高脂血症",
          "sources: [\"lab-2026.pdf\"]",
          "---",
          "",
          "高脂血症 concept body",
          "---END FILE---",
          "---FILE: wiki/overview.md---",
          "# Overview",
          "updated overview",
          "---END FILE---",
          "---FILE: wiki/log.md---",
          "## [2026-04-19] ingest | lab-2026.pdf",
          "---END FILE---",
        ].join("\n"),
      )
    }))

    const taskId = startIngestTask("project-1", sourcePath, "", true)
    await waitTaskDone(taskId)
    const task = getTask(taskId)
    expect(task?.status).toBe("done")
    // overview.md and index.md are rebuilt programmatically and added to filesWritten
    expect(task?.filesWritten).toEqual(
      expect.arrayContaining([
        "wiki/sources/lab-2026.md",
        "wiki/sources/lab-2026/entities/韩松.md",
        "wiki/sources/lab-2026/concepts/高脂血症.md",
        "wiki/index.md",
        "wiki/overview.md",
        "wiki/log.md",
      ]),
    )

    const entity = await fs.readFile(path.join(projectDir, "wiki", "sources", "lab-2026", "entities", "韩松.md"), "utf-8")
    expect(entity).toContain("title: 韩松")
    expect(entity).toContain("entity body")
    const overview = await fs.readFile(path.join(projectDir, "wiki", "overview.md"), "utf-8")
    expect(overview).toContain("Auto-generated from current wiki pages")
    const index = await fs.readFile(path.join(projectDir, "wiki", "index.md"), "utf-8")
    expect(index).toContain("[[lab-2026]]")
    expect(index).toContain("[[韩松]]")
    expect(index).toContain("[[高脂血症]]")
  })

  it("当 LLM 输出 title 与文件名不一致时，ensureCanonicalTitleType 自动修正 title 后写入", async () => {
    const { projectDir, sourcePath } = await createProjectWithSource("lab-bad.pdf")
    mockGetProjectRoot.mockResolvedValue(projectDir)

    let callIndex = 0
    vi.stubGlobal("fetch", vi.fn(async () => {
      callIndex += 1
      if (callIndex === 1) return makeOpenAiStreamResponse("analysis result")
      return makeOpenAiStreamResponse(
        [
          "---FILE: wiki/sources/lab-bad/entities/韩松.md---",
          "---",
          "type: entity",
          "title: 珠海奥乐医院",
          "sources: [\"lab-bad.pdf\"]",
          "---",
          "",
          "[[韩松]] mismatched title, should be corrected",
          "---END FILE---",
        ].join("\n"),
      )
    }))

    const taskId = startIngestTask("project-2", sourcePath, "", true)
    await waitTaskDone(taskId)
    const task = getTask(taskId)
    expect(task?.status).toBe("done")
    // title is auto-corrected → file IS written
    expect(task?.filesWritten).toContain("wiki/sources/lab-bad/entities/韩松.md")
    expect(task?.filesWritten).toContain("wiki/sources/lab-bad.md")

    // title corrected to match filename
    const entity = await fs.readFile(path.join(projectDir, "wiki", "sources", "lab-bad", "entities", "韩松.md"), "utf-8")
    expect(entity).toContain("title: 韩松")
    expect(entity).not.toContain("title: 珠海奥乐医院")
    expect(entity).toContain("type: entity")
    const fallbackSummary = await fs.readFile(path.join(projectDir, "wiki", "sources", "lab-bad.md"), "utf-8")
    expect(fallbackSummary).toContain("title: \"lab-bad\"")
  })

  it("正文语义与 title 不一致时，当前实现允许写入（语义拦截为可选增强）", async () => {
    // NOTE: Semantic body-title consistency check is an optional guard that is
    // not currently enforced. This test documents the current (permissive) behavior.
    // If the guard is enabled in future, update this test to expect rejection.
    const { projectDir, sourcePath } = await createProjectWithSource("lab-semantic.pdf")
    mockGetProjectRoot.mockResolvedValue(projectDir)

    let callIndex = 0
    vi.stubGlobal("fetch", vi.fn(async () => {
      callIndex += 1
      if (callIndex === 1) return makeOpenAiStreamResponse("analysis result")
      return makeOpenAiStreamResponse(
        [
          "---FILE: wiki/sources/lab-semantic/entities/韩松.md---",
          "---",
          "type: entity",
          "title: 韩松",
          "sources: [\"lab-semantic.pdf\"]",
          "---",
          "",
          "这里主要讨论珠海奥乐医院，正文没有提及目标标题。",
          "---END FILE---",
        ].join("\n"),
      )
    }))

    const taskId = startIngestTask("project-3", sourcePath, "", true)
    await waitTaskDone(taskId)
    const task = getTask(taskId)
    expect(task?.status).toBe("done")
    // title already matches filename → ensureCanonicalTitleType is a no-op
    // semantic check is not enforced → file is written
    expect(task?.filesWritten).toContain("wiki/sources/lab-semantic/entities/韩松.md")
    expect(task?.filesWritten).toContain("wiki/sources/lab-semantic.md")

    const entity = await fs.readFile(
      path.join(projectDir, "wiki", "sources", "lab-semantic", "entities", "韩松.md"),
      "utf-8",
    )
    expect(entity).toContain("title: 韩松")
  })
})

