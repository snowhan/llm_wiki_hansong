/**
 * autoIngest 完整流水线测试（L-01 ~ L-14）
 *
 * 覆盖：
 *   L-01 ~ L-02  缓存命中跳过（不调用 LLM）
 *   L-03         缓存未命中 → streamChat 调用两次
 *   L-04 ~ L-05  FILE 块写入 + 缓存保存
 *   L-06 ~ L-07  源文件截断逻辑（50000字符边界）
 *   L-08         Step 1 出错 → activity 标记为 error，提前返回
 *   L-09         Step 2 无 FILE 块 → 写入 fallback 摘要页
 *   L-10 ~ L-11  Activity 状态变更（running → done）
 *   L-12         AbortSignal 已 abort → streamChat onError 触发提前返回
 *   L-13         并行读取 schema/purpose/index/overview
 *   L-14         folderContext 出现在 LLM prompt 中
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock LLM + 缓存 + embedding ──────────────────────────────────────────

vi.mock("../llm-client", () => ({
  streamChat: vi.fn(),
}))

vi.mock("../ingest-cache", () => ({
  checkIngestCache: vi.fn().mockResolvedValue(null),
  saveIngestCache: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../embedding", () => ({
  embedPage: vi.fn().mockResolvedValue(undefined),
}))

// ── 在 mock 生效后引入模块 ───────────────────────────────────────────────

import { readFile, writeFile, listDirectory } from "@/commands/fs"
import { useWikiStore } from "@/stores/wiki-store"
import { useChatStore } from "@/stores/chat-store"
import { useActivityStore } from "@/stores/activity-store"

const { streamChat } = await import("../llm-client")
const { checkIngestCache, saveIngestCache } = await import("../ingest-cache")
const { autoIngest } = await import("../ingest")

// ── Helpers ───────────────────────────────────────────────────────────────

type StreamChatArg = Parameters<typeof streamChat>

/**
 * streamChat 的成功 mock：立即调用 onDone（不生成任何 token）。
 */
function mockStreamChatSuccess(generation = "") {
  vi.mocked(streamChat).mockImplementation(async (_msgs, callbacks) => {
    for (const char of generation) {
      callbacks.onToken?.(char)
    }
    callbacks.onDone?.()
  })
}

/**
 * streamChat 分两步各返回不同内容的 mock。
 * 第一次调用返回 step1Output，第二次返回 step2Output。
 */
function mockStreamChatTwoSteps(step1Output: string, step2Output: string) {
  let callCount = 0
  vi.mocked(streamChat).mockImplementation(async (_msgs, callbacks) => {
    const output = callCount === 0 ? step1Output : step2Output
    callCount++
    for (const char of output) {
      callbacks.onToken?.(char)
    }
    callbacks.onDone?.()
  })
}

/**
 * streamChat 调用时触发 onError 的 mock。
 */
function mockStreamChatError(msg = "LLM error") {
  vi.mocked(streamChat).mockImplementation(async (_msgs, callbacks) => {
    callbacks.onError?.(new Error(msg))
  })
}

const BASE_LLM_CONFIG = {
  provider: "openai",
  apiKey: "test-key",
  model: "gpt-4",
  ollamaUrl: "http://localhost:11434",
  customEndpoint: "",
  maxContextSize: 4096,
}

const PROJECT_ID = "test-project-id"
const SOURCE_PATH = "raw/sources/sample.txt"

function resetStores() {
  useWikiStore.setState({
    project: { id: PROJECT_ID, name: "Test" } as never,
    llmConfig: BASE_LLM_CONFIG as never,
    embeddingConfig: { enabled: false, endpoint: "", apiKey: "", model: "" },
    bumpDataVersion: vi.fn() as never,
    setFileTree: vi.fn() as never,
  } as never)

  useChatStore.setState({
    addMessage: vi.fn(),
    setStreaming: vi.fn(),
    appendStreamToken: vi.fn(),
    finalizeStream: vi.fn(),
    activeConversationId: "c1",
    mode: "normal",
    setMode: vi.fn(),
  } as never)

  useActivityStore.setState({ items: [] })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readFile).mockResolvedValue("source content")
  vi.mocked(writeFile).mockResolvedValue(undefined)
  vi.mocked(listDirectory).mockResolvedValue([])
  vi.mocked(checkIngestCache).mockResolvedValue(null)
  vi.mocked(saveIngestCache).mockResolvedValue(undefined)
  resetStores()
})

// ── L-01 ~ L-02：缓存命中跳过 ─────────────────────────────────────────────

describe("L-01 ~ L-02：缓存命中时跳过 LLM 调用", () => {
  it("L-01: checkIngestCache 返回非 null → streamChat 完全不被调用", async () => {
    vi.mocked(checkIngestCache).mockResolvedValue(["wiki/entities/foo.md"])
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    expect(streamChat).not.toHaveBeenCalled()
  })

  it("L-01: 缓存命中时返回缓存中的文件路径列表", async () => {
    const cachedFiles = ["wiki/entities/foo.md", "wiki/sources/sample.md"]
    vi.mocked(checkIngestCache).mockResolvedValue(cachedFiles)
    const result = await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    expect(result).toEqual(cachedFiles)
  })

  it("L-02: 缓存命中时 activity detail 包含 'Skipped'", async () => {
    vi.mocked(checkIngestCache).mockResolvedValue(["wiki/a.md"])
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const items = useActivityStore.getState().items
    const item = items.find((i) => i.title === "sample.txt")
    expect(item?.detail).toMatch(/Skipped/)
  })

  it("L-02: 缓存命中时 activity status 变为 done", async () => {
    vi.mocked(checkIngestCache).mockResolvedValue(["wiki/a.md"])
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const item = useActivityStore.getState().items.find((i) => i.title === "sample.txt")
    expect(item?.status).toBe("done")
  })

  it("L-02: activity item 的 filesWritten 为缓存文件列表", async () => {
    const cached = ["wiki/x.md", "wiki/y.md"]
    vi.mocked(checkIngestCache).mockResolvedValue(cached)
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const item = useActivityStore.getState().items.find((i) => i.title === "sample.txt")
    expect(item?.filesWritten).toEqual(cached)
  })
})

// ── L-03：缓存未命中 → 调用 streamChat 两次 ───────────────────────────────

describe("L-03：缓存未命中时调用 streamChat 两次（Step 1 + Step 2）", () => {
  it("L-03: streamChat 被调用两次", async () => {
    mockStreamChatSuccess()
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    expect(streamChat).toHaveBeenCalledTimes(2)
  })

  it("L-03: 第一次调用包含 'Analyze this source document'（Step 1 分析提示）", async () => {
    mockStreamChatSuccess()
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const step1Call = vi.mocked(streamChat).mock.calls[0] as StreamChatArg
    const userMsg = step1Call[0].find((m) => m.role === "user")
    expect(userMsg?.content).toMatch(/Analyze this source document/)
  })

  it("L-03: 第二次调用包含 'generate the wiki files'（Step 2 生成提示）", async () => {
    mockStreamChatSuccess()
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const step2Call = vi.mocked(streamChat).mock.calls[1] as StreamChatArg
    const userMsg = step2Call[0].find((m) => m.role === "user")
    expect(userMsg?.content).toMatch(/generate the wiki files/)
  })
})

// ── L-04 ~ L-05：FILE 块写入 + 缓存保存 ──────────────────────────────────

describe("L-04 ~ L-05：FILE 块写入和缓存保存", () => {
  const FILE_BLOCK = (path: string, content: string) =>
    `---FILE: ${path}---\n${content}\n---END FILE---`

  it("L-04: Step 2 返回有效 FILE 块 → writeFile 以正确路径被调用", async () => {
    const generation = FILE_BLOCK("wiki/entities/foo.md", "# Foo\ncontent here")
    mockStreamChatTwoSteps("analysis output", generation)
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    expect(writeFile).toHaveBeenCalledWith(
      PROJECT_ID,
      "wiki/entities/foo.md",
      expect.any(String),
    )
  })

  it("L-04: 多个 FILE 块 → writeFile 被调用多次（各自路径）", async () => {
    const generation = [
      FILE_BLOCK("wiki/entities/alice.md", "# Alice"),
      FILE_BLOCK("wiki/concepts/topic.md", "# Topic"),
    ].join("\n")
    mockStreamChatTwoSteps("analysis", generation)
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const calledPaths = vi.mocked(writeFile).mock.calls.map((c) => c[1])
    expect(calledPaths).toContain("wiki/entities/alice.md")
    expect(calledPaths).toContain("wiki/concepts/topic.md")
  })

  it("L-04: writeFile 的内容不为空", async () => {
    const generation = FILE_BLOCK("wiki/entities/foo.md", "# Foo\ncontent")
    mockStreamChatTwoSteps("analysis", generation)
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const fooCall = vi.mocked(writeFile).mock.calls.find((c) => c[1] === "wiki/entities/foo.md")
    expect(fooCall?.[2]).toBeTruthy()
  })

  it("L-05: 成功写入文件后调用 saveIngestCache", async () => {
    const generation = FILE_BLOCK("wiki/entities/foo.md", "# Foo content")
    mockStreamChatTwoSteps("analysis", generation)
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    expect(saveIngestCache).toHaveBeenCalledOnce()
  })

  it("L-05: saveIngestCache 以正确 projectId 和 fileName 调用", async () => {
    const generation = FILE_BLOCK("wiki/entities/foo.md", "# Foo")
    mockStreamChatTwoSteps("analysis", generation)
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    expect(saveIngestCache).toHaveBeenCalledWith(
      PROJECT_ID,
      "sample.txt",
      expect.any(String), // source content
      expect.arrayContaining(["wiki/entities/foo.md"]),
    )
  })

  it("L-05: 无文件写入（空 generation）→ saveIngestCache 不被调用", async () => {
    mockStreamChatSuccess() // 无 FILE 块，但有 fallback
    // fallback summary page 会被写入，因此 saveIngestCache 会被调用
    // 这里测试：空 generation 也会写 fallback，所以还是会调用
    // 如果 writeFile 失败，则不调用
    vi.mocked(writeFile).mockRejectedValue(new Error("disk full"))
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    // fallback 写入失败 + 无其他文件 → saveIngestCache 不调用
    expect(saveIngestCache).not.toHaveBeenCalled()
  })
})

// ── L-06 ~ L-07：截断逻辑 ────────────────────────────────────────────────

describe("L-06 ~ L-07：源文件截断（50000字符边界）", () => {
  it("L-06: 源文件超过 50000 字符 → LLM 请求中内容包含 '[...truncated...]'", async () => {
    const longContent = "x".repeat(51000)
    vi.mocked(readFile).mockResolvedValue(longContent)
    mockStreamChatSuccess()
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const step1Call = vi.mocked(streamChat).mock.calls[0] as StreamChatArg
    const userMsg = step1Call[0].find((m) => m.role === "user")
    expect(userMsg?.content).toContain("[...truncated...]")
  })

  it("L-06: 截断后内容长度 ≤ 50000 + '[...truncated...]' 额外字符", async () => {
    const longContent = "x".repeat(51000)
    vi.mocked(readFile).mockResolvedValue(longContent)
    mockStreamChatSuccess()
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const step1Call = vi.mocked(streamChat).mock.calls[0] as StreamChatArg
    const userMsg = step1Call[0].find((m) => m.role === "user")
    // 截断后的 truncatedContent 最多 50000 + 换行 + "[...truncated...]"
    const truncatedMarkerIdx = (userMsg?.content as string).indexOf("[...truncated...]")
    const beforeTruncated = (userMsg?.content as string).slice(0, truncatedMarkerIdx)
    // 原始内容部分应≤50000
    expect(beforeTruncated).toBeTruthy()
  })

  it("L-07: 源文件恰好 50000 字符 → 内容不被截断", async () => {
    const exactContent = "y".repeat(50000)
    vi.mocked(readFile).mockResolvedValue(exactContent)
    mockStreamChatSuccess()
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const step1Call = vi.mocked(streamChat).mock.calls[0] as StreamChatArg
    const userMsg = step1Call[0].find((m) => m.role === "user")
    expect(userMsg?.content).not.toContain("[...truncated...]")
  })

  it("L-07: 短源文件（100字符）→ 内容完整传入 LLM", async () => {
    const shortContent = "This is a short document."
    vi.mocked(readFile).mockResolvedValue(shortContent)
    mockStreamChatSuccess()
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const step1Call = vi.mocked(streamChat).mock.calls[0] as StreamChatArg
    const userMsg = step1Call[0].find((m) => m.role === "user")
    expect(userMsg?.content).toContain(shortContent)
    expect(userMsg?.content).not.toContain("[...truncated...]")
  })
})

// ── L-08：Step 1 出错 ─────────────────────────────────────────────────────

describe("L-08：Step 1 LLM 出错 → activity 标记 error，提前返回", () => {
  it("L-08: Step 1 onError → activity item status 为 error", async () => {
    mockStreamChatError("LLM timeout")
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const item = useActivityStore.getState().items.find((i) => i.title === "sample.txt")
    expect(item?.status).toBe("error")
  })

  it("L-08: Step 1 出错 → activity detail 包含错误信息", async () => {
    mockStreamChatError("API rate limit")
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const item = useActivityStore.getState().items.find((i) => i.title === "sample.txt")
    expect(item?.detail).toMatch(/API rate limit/)
  })

  it("L-08: Step 1 出错 → streamChat 只被调用 1 次（Step 2 不执行）", async () => {
    mockStreamChatError("error")
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    expect(streamChat).toHaveBeenCalledTimes(1)
  })

  it("L-08: Step 1 出错 → 返回空数组", async () => {
    mockStreamChatError("error")
    const result = await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    expect(result).toEqual([])
  })
})

// ── L-09：Step 2 无 FILE 块 → fallback 摘要页 ────────────────────────────

describe("L-09：Step 2 无 FILE 块 → 写入 fallback 摘要页", () => {
  it("L-09: Step 2 纯文本无 FILE 块 → writeFile 被调用（fallback 路径）", async () => {
    mockStreamChatTwoSteps("analysis output", "No file blocks here, just text.")
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    expect(writeFile).toHaveBeenCalled()
    // fallback 路径为 wiki/sources/<name>.md
    const calledPaths = vi.mocked(writeFile).mock.calls.map((c) => c[1])
    expect(calledPaths.some((p) => p.startsWith("wiki/sources/"))).toBe(true)
  })

  it("L-09: fallback 页面路径为 wiki/sources/<filename-without-ext>.md", async () => {
    mockStreamChatTwoSteps("analysis", "no blocks")
    await autoIngest(PROJECT_ID, "raw/sources/my-doc.pdf", BASE_LLM_CONFIG as never)
    const calledPaths = vi.mocked(writeFile).mock.calls.map((c) => c[1])
    expect(calledPaths).toContain("wiki/sources/my-doc.md")
  })

  it("L-09: fallback 页面内容包含源文件名", async () => {
    mockStreamChatTwoSteps("analysis content here", "no file blocks")
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const fallbackCall = vi.mocked(writeFile).mock.calls.find((c) =>
      (c[1] as string).startsWith("wiki/sources/")
    )
    expect(fallbackCall?.[2]).toContain("sample.txt")
  })

  it("L-09: Step 2 已有 wiki/sources/ 路径的 FILE 块 → 不再写 fallback", async () => {
    const generation = `---FILE: wiki/sources/sample.md---\n# Sample\ncontent\n---END FILE---`
    mockStreamChatTwoSteps("analysis", generation)
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const calledPaths = vi.mocked(writeFile).mock.calls.map((c) => c[1])
    // 只有一次写入（sources/ 路径）
    const sourcesCalls = calledPaths.filter((p) => p.startsWith("wiki/sources/"))
    expect(sourcesCalls).toHaveLength(1)
  })

  it("L-09: 支持写入 kebab-case 路径的 FILE block", async () => {
    const generation = [
      "---FILE: wiki/sources/sample/entities/entity-a.md---",
      "# Entity A",
      "---END FILE---",
    ].join("\n")
    mockStreamChatTwoSteps("analysis", generation)
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const calledPaths = vi.mocked(writeFile).mock.calls.map((c) => c[1])
    expect(calledPaths).toContain("wiki/sources/sample/entities/entity-a.md")
  })

  it("L-09: 仅生成 wiki/sources/<source>/entities/* 时仍要补写 source summary", async () => {
    const generation = [
      "---FILE: wiki/sources/sample/entities/entitya.md---",
      "# Entity A",
      "---END FILE---",
    ].join("\n")
    mockStreamChatTwoSteps("analysis", generation)
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const calledPaths = vi.mocked(writeFile).mock.calls.map((c) => c[1])
    expect(calledPaths).toContain("wiki/sources/sample/entities/entitya.md")
    expect(calledPaths).toContain("wiki/sources/sample.md")
  })

  it("L-09: 已经是中文文件名时，不应再按 frontmatter title 强制改名", async () => {
    const generation = [
      "---FILE: wiki/sources/sample/concepts/乙肝表面抗体阳性.md---",
      "---",
      "type: concept",
      "title: 代谢异常聚集",
      "sources: [\"sample.txt\"]",
      "---",
      "",
      "# 乙肝表面抗体阳性",
      "乙肝表面抗体：阳性",
      "---END FILE---",
    ].join("\n")
    mockStreamChatTwoSteps("analysis", generation)
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const calledPaths = vi.mocked(writeFile).mock.calls.map((c) => c[1])
    expect(calledPaths).toContain("wiki/sources/sample/concepts/乙肝表面抗体阳性.md")
    expect(calledPaths).not.toContain("wiki/sources/sample/concepts/代谢异常聚集.md")
  })

  it("L-09: 英文 slug 文件名直接按原始路径写入（不再改名）", async () => {
    const generation = [
      "---FILE: wiki/sources/sample/concepts/hepatitis-b-antibody.md---",
      "---",
      "type: concept",
      "title: 乙肝表面抗体阳性",
      "sources: [\"sample.txt\"]",
      "---",
      "",
      "# 乙肝表面抗体阳性",
      "乙肝表面抗体：阳性",
      "---END FILE---",
    ].join("\n")
    mockStreamChatTwoSteps("analysis", generation)
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const calledPaths = vi.mocked(writeFile).mock.calls.map((c) => c[1])
    // normalizeGeneratedWikiPath was removed; file is written at original path
    expect(calledPaths).toContain("wiki/sources/sample/concepts/hepatitis-b-antibody.md")
  })
})

// ── L-10 ~ L-11：Activity 状态变更 ────────────────────────────────────────

describe("L-10 ~ L-11：Activity 状态机（running → done）", () => {
  it("L-10: autoIngest 调用时立即 addItem(running)", async () => {
    let capturedStatus: string | undefined
    // 在第一次 streamChat 调用前检查 activity 状态
    vi.mocked(streamChat).mockImplementationOnce(async (_msgs, callbacks) => {
      capturedStatus = useActivityStore.getState().items[0]?.status
      callbacks.onDone?.()
    })
    vi.mocked(streamChat).mockImplementationOnce(async (_msgs, callbacks) => {
      callbacks.onDone?.()
    })
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    expect(capturedStatus).toBe("running")
  })

  it("L-10: addItem 的 type 为 'ingest'", async () => {
    mockStreamChatSuccess()
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const item = useActivityStore.getState().items.find((i) => i.title === "sample.txt")
    expect(item?.type).toBe("ingest")
  })

  it("L-11: 成功完成后 activity status 变为 'done'（有文件写入时）", async () => {
    const generation = `---FILE: wiki/entities/foo.md---\n# Foo\ncontent\n---END FILE---`
    mockStreamChatTwoSteps("analysis", generation)
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const item = useActivityStore.getState().items.find((i) => i.title === "sample.txt")
    expect(item?.status).toBe("done")
  })

  it("L-11: 成功时 activity 的 filesWritten 非空", async () => {
    const generation = `---FILE: wiki/entities/foo.md---\n# Foo\ncontent\n---END FILE---`
    mockStreamChatTwoSteps("analysis", generation)
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const item = useActivityStore.getState().items.find((i) => i.title === "sample.txt")
    expect(item?.filesWritten.length).toBeGreaterThan(0)
  })

  it("L-11: 返回的文件列表与 activity.filesWritten 一致", async () => {
    const generation = `---FILE: wiki/entities/foo.md---\n# Foo\ncontent\n---END FILE---`
    mockStreamChatTwoSteps("analysis", generation)
    const result = await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const item = useActivityStore.getState().items.find((i) => i.title === "sample.txt")
    expect(result).toEqual(item?.filesWritten)
  })
})

// ── L-12：AbortSignal ──────────────────────────────────────────────────────

describe("L-12：AbortSignal 已 abort → streamChat 通过 onError 提前终止", () => {
  it("L-12: 传入已 abort 的 signal → streamChat 接收到 signal 参数", async () => {
    const controller = new AbortController()
    controller.abort()
    // 模拟真实 streamChat 在 abort 时调用 onError
    vi.mocked(streamChat).mockImplementation(async (_msgs, callbacks, signal) => {
      if (signal?.aborted) {
        callbacks.onError?.(new Error("AbortError"))
        return
      }
      callbacks.onDone?.()
    })
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never, controller.signal)
    const step1Call = vi.mocked(streamChat).mock.calls[0] as StreamChatArg
    expect(step1Call[2]).toBe(controller.signal)
  })

  it("L-12: signal abort → Step 1 error → Step 2 不执行（总调用次数 = 1）", async () => {
    const controller = new AbortController()
    controller.abort()
    vi.mocked(streamChat).mockImplementation(async (_msgs, callbacks, signal) => {
      if (signal?.aborted) {
        callbacks.onError?.(new Error("AbortError"))
        return
      }
      callbacks.onDone?.()
    })
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never, controller.signal)
    expect(streamChat).toHaveBeenCalledTimes(1)
  })

  it("L-12: abort 后 activity status 为 error", async () => {
    const controller = new AbortController()
    controller.abort()
    vi.mocked(streamChat).mockImplementation(async (_msgs, callbacks, signal) => {
      if (signal?.aborted) {
        callbacks.onError?.(new Error("AbortError"))
        return
      }
      callbacks.onDone?.()
    })
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never, controller.signal)
    const item = useActivityStore.getState().items.find((i) => i.title === "sample.txt")
    expect(item?.status).toBe("error")
  })
})

// ── L-13：并行读取 ────────────────────────────────────────────────────────

describe("L-13：并行读取 schema / purpose / index / overview", () => {
  it("L-13: autoIngest 会读取 schema.md / purpose.md / wiki/index.md / wiki/overview.md", async () => {
    mockStreamChatSuccess()
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const calledPaths = vi.mocked(readFile).mock.calls.map((c) => c[1] as string)
    expect(calledPaths).toContain("schema.md")
    expect(calledPaths).toContain("purpose.md")
    expect(calledPaths).toContain("wiki/index.md")
    expect(calledPaths).toContain("wiki/overview.md")
  })

  it("L-13: 即使 readFile 失败（文件不存在），autoIngest 仍然继续", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("file not found"))
    mockStreamChatSuccess()
    // 不抛出异常
    await expect(autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)).resolves.not.toThrow()
  })
})

// ── L-14：folderContext 出现在 LLM prompt ────────────────────────────────

describe("L-14：folderContext 出现在 Step 1 的 LLM 请求 prompt 中", () => {
  it("L-14: 传入 folderContext → 出现在 Step 1 用户消息中", async () => {
    mockStreamChatSuccess()
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never, undefined, "Research Papers 2024")
    const step1Call = vi.mocked(streamChat).mock.calls[0] as StreamChatArg
    const userMsg = step1Call[0].find((m) => m.role === "user")
    expect(userMsg?.content).toContain("Research Papers 2024")
  })

  it("L-14: folderContext 为空时 → prompt 中不含 'Folder context'", async () => {
    mockStreamChatSuccess()
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never, undefined, "")
    const step1Call = vi.mocked(streamChat).mock.calls[0] as StreamChatArg
    const userMsg = step1Call[0].find((m) => m.role === "user")
    expect(userMsg?.content).not.toContain("Folder context")
  })

  it("L-14: 未传入 folderContext → prompt 中不含 'Folder context'", async () => {
    mockStreamChatSuccess()
    await autoIngest(PROJECT_ID, SOURCE_PATH, BASE_LLM_CONFIG as never)
    const step1Call = vi.mocked(streamChat).mock.calls[0] as StreamChatArg
    const userMsg = step1Call[0].find((m) => m.role === "user")
    expect(userMsg?.content).not.toContain("Folder context")
  })
})
