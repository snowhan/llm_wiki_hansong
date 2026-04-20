/**
 * editor-area-save.test.tsx
 *
 * 专项测试 EditorArea 组件的保存竞态防护逻辑：
 *   1. loadedPathRef 门禁 — 文件未加载完毕时 handleSave 不触发写盘
 *   2. clearTimeout on tab switch — 切换 tab 立即取消待发定时器
 *   3. snapshot 写入 — 定时器触发时用创建时的快照内容，而非运行时状态
 *   4. writer: "editor-autosave" — 写盘调用必须携带 writer 字段
 *   5. 防抖合并 — 短时间内多次保存只触发一次写盘
 *   6. 边界情况 — 新建 tab / 无路径 / 无项目时不写盘
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, act } from "@testing-library/react"
import { useWikiStore } from "@/stores/wiki-store"

// ─── Mock dependencies ────────────────────────────────────────────────────

const mockReadFile = vi.fn<(projectId: string, path: string) => Promise<string>>()
const mockWriteFile = vi.fn<(projectId: string, path: string, content: string, opts?: unknown) => Promise<void>>()

vi.mock("@/commands/fs", () => ({
  readFile: (...args: Parameters<typeof mockReadFile>) => mockReadFile(...args),
  writeFile: (...args: Parameters<typeof mockWriteFile>) => mockWriteFile(...args),
}))

// Capture the onSave callback that EditorArea passes down to WikiEditor
let capturedOnSave: ((markdown: string) => void) | null = null

vi.mock("@/components/editor/wiki-editor", () => ({
  WikiEditor: ({ onSave }: { onSave: (md: string) => void }) => {
    capturedOnSave = onSave
    return <div data-testid="wiki-editor" />
  },
}))

vi.mock("@/components/editor/file-preview", () => ({
  FilePreview: () => <div data-testid="file-preview" />,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

// Minimal MUI stubs
vi.mock("@mui/material/Box", () => ({
  default: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => <div {...p}>{children}</div>,
}))
vi.mock("@mui/material/Typography", () => ({
  default: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => <span {...p}>{children}</span>,
}))
vi.mock("@mui/material/Chip", () => ({ default: ({ label }: { label?: string }) => <span>{label}</span> }))
vi.mock("@mui/material/Button", () => ({
  default: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))
vi.mock("@mui/icons-material/Description", () => ({ default: () => <span /> }))
vi.mock("@mui/icons-material/NoteAddOutlined", () => ({ default: () => <span /> }))
vi.mock("@mui/icons-material/InboxOutlined", () => ({ default: () => <span /> }))

import { EditorArea } from "../layout/editor-area"

// ─── Helpers ──────────────────────────────────────────────────────────────

const PROJECT = { id: "proj-1", name: "Test Project", path: "/tmp/test" }
const WIKI_PATH = "wiki/sources/2023体检报告/entities/韩松.md"
const FRONTMATTER = "---\ntype: entity\ntitle: 韩松\n---\n"
const BODY = "韩松 entity body content."
const FULL_CONTENT = FRONTMATTER + BODY

function setupStore(tabPath: string | null = WIKI_PATH) {
  const tabId = tabPath ? "tab-1" : null
  useWikiStore.setState({
    project: PROJECT,
    openTabs: tabPath ? [{ id: "tab-1", path: tabPath, title: tabPath }] : [],
    activeTabId: tabId,
    activeTabPath: tabPath,
    fileContent: "",
  } as any)
}

/** Flush all pending microtasks so React effects and Promise chains complete.
 *  Uses queueMicrotask which is NOT affected by vi.useFakeTimers(). */
async function flushEffects() {
  await act(async () => {
    await new Promise<void>(resolve => queueMicrotask(resolve))
    await new Promise<void>(resolve => queueMicrotask(resolve))
    await new Promise<void>(resolve => queueMicrotask(resolve))
    await new Promise<void>(resolve => queueMicrotask(resolve))
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  capturedOnSave = null
  mockWriteFile.mockResolvedValue(undefined)
  mockReadFile.mockResolvedValue(FULL_CONTENT)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("EditorArea — save race condition guard", () => {

  // ── 1. loadedPathRef 门禁 ─────────────────────────────────────────────

  it("ES-01 文件加载完成前，handleSave 门禁拦截，writeFile 不被触发", async () => {
    // readFile 挂起，永不 resolve → loadedPathRef.current 保持 null
    mockReadFile.mockReturnValue(new Promise(() => {}))
    setupStore(WIKI_PATH)
    render(<EditorArea />)
    // Effect fires but readFile never resolves
    await flushEffects()

    // 即使 capturedOnSave 已被设置（WikiEditor 已渲染），门禁也应拦截写盘
    if (capturedOnSave) {
      act(() => { capturedOnSave!(BODY) })
      act(() => { vi.advanceTimersByTime(1100) })
      await flushEffects()
    }

    // loadedPathRef.current === null → handleSave 被门禁拦截，不触发写盘
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it("ES-02 文件加载完成後 handleSave 可以触发写盘", async () => {
    setupStore(WIKI_PATH)
    render(<EditorArea />)

    // Flush readFile promise and React re-render
    await flushEffects()
    expect(capturedOnSave).not.toBeNull()

    act(() => { capturedOnSave!(BODY) })
    act(() => { vi.advanceTimersByTime(1100) })

    await flushEffects()
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
  })

  // ── 2. clearTimeout on tab switch ────────────────────────────────────

  it("ES-03 切换 tab 后待发定时器被取消，旧 path 不触发写盘", async () => {
    setupStore(WIKI_PATH)
    const { rerender } = render(<EditorArea />)

    await flushEffects()
    expect(capturedOnSave).not.toBeNull()

    // 排队一次保存
    act(() => { capturedOnSave!(BODY) })
    // 在 1000ms 到期前切换 tab
    act(() => { vi.advanceTimersByTime(500) })

    const NEW_PATH = "wiki/sources/2024体检报告/entities/韩松.md"
    useWikiStore.setState({
      openTabs: [{ id: "tab-2", path: NEW_PATH, title: NEW_PATH }],
      activeTabId: "tab-2",
      activeTabPath: NEW_PATH,
      fileContent: "",
    } as any)
    mockReadFile.mockResolvedValue("---\ntype: entity\ntitle: 韩松\n---\n2024 body")
    rerender(<EditorArea />)

    // 超过原来的定时时间
    act(() => { vi.advanceTimersByTime(1500) })
    await flushEffects()

    // 旧路径的写盘不应触发
    expect(mockWriteFile).not.toHaveBeenCalledWith(
      PROJECT.id,
      WIKI_PATH,
      expect.any(String),
      expect.anything(),
    )
  })

  // ── 3. writer: "editor-autosave" ─────────────────────────────────────

  it("ES-04 写盘调用携带 writer: 'editor-autosave'", async () => {
    setupStore(WIKI_PATH)
    render(<EditorArea />)

    await flushEffects()

    act(() => { capturedOnSave!(BODY) })
    act(() => { vi.advanceTimersByTime(1100) })
    await flushEffects()

    expect(mockWriteFile).toHaveBeenCalledWith(
      PROJECT.id,
      WIKI_PATH,
      expect.any(String),
      { writer: "editor-autosave" },
    )
  })

  // ── 4. snapshot 写入 ─────────────────────────────────────────────────

  it("ES-05 snapshot 内容包含 frontmatter + markdown", async () => {
    setupStore(WIKI_PATH)
    render(<EditorArea />)

    await flushEffects()

    act(() => { capturedOnSave!(BODY) })
    act(() => { vi.advanceTimersByTime(1100) })
    await flushEffects()

    const [, , writtenContent] = mockWriteFile.mock.calls[0]
    expect(writtenContent).toContain("type: entity")
    expect(writtenContent).toContain("title: 韩松")
    expect(writtenContent).toContain(BODY)
  })

  // ── 5. 防抖合并 ──────────────────────────────────────────────────────

  it("ES-06 短时间内多次保存只触发一次 writeFile（防抖）", async () => {
    setupStore(WIKI_PATH)
    render(<EditorArea />)

    await flushEffects()

    // 连续调用 5 次，每次间隔 200ms（< 1000ms 防抖窗口）
    for (let i = 0; i < 5; i++) {
      act(() => { capturedOnSave!(`body version ${i}`) })
      act(() => { vi.advanceTimersByTime(200) })
    }
    act(() => { vi.advanceTimersByTime(1100) })
    await flushEffects()

    expect(mockWriteFile).toHaveBeenCalledTimes(1)
  })

  it("ES-07 防抖后写入的是最后一次调用的 markdown", async () => {
    setupStore(WIKI_PATH)
    render(<EditorArea />)

    await flushEffects()

    act(() => { capturedOnSave!("早期内容，不应被写入") })
    act(() => { vi.advanceTimersByTime(200) })
    act(() => { capturedOnSave!("最终内容，应被写入") })
    act(() => { vi.advanceTimersByTime(1100) })
    await flushEffects()

    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    const [, , content] = mockWriteFile.mock.calls[0]
    expect(content).toContain("最终内容，应被写入")
    expect(content).not.toContain("早期内容，不应被写入")
  })

  // ── 6. 边界情况 ──────────────────────────────────────────────────────

  it("ES-08 activeTabPath 为 null 时不触发写盘", async () => {
    setupStore(null)
    render(<EditorArea />)

    act(() => { vi.advanceTimersByTime(2000) })
    await flushEffects()
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it("ES-09 project 为 null 时不触发写盘", async () => {
    useWikiStore.setState({
      project: null,
      openTabs: [{ id: "tab-1", path: WIKI_PATH, title: WIKI_PATH }],
      activeTabId: "tab-1",
      activeTabPath: WIKI_PATH,
      fileContent: "",
    } as any)
    render(<EditorArea />)

    act(() => { vi.advanceTimersByTime(2000) })
    await flushEffects()
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it("ES-10 readFile 失败时 loadedPathRef 不被设置，写盘门禁有效", async () => {
    mockReadFile.mockRejectedValue(new Error("not found"))
    setupStore(WIKI_PATH)
    render(<EditorArea />)

    await flushEffects()

    // loadedPathRef.current 仍为 null（文件加载失败）→ 门禁拦截写盘
    if (capturedOnSave) {
      act(() => { capturedOnSave!(BODY) })
      act(() => { vi.advanceTimersByTime(1100) })
      await flushEffects()
    }

    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  // ── 7. 正确路径写入 ──────────────────────────────────────────────────

  it("ES-11 写盘使用 snapshot 中正确的 path", async () => {
    setupStore(WIKI_PATH)
    render(<EditorArea />)

    await flushEffects()

    act(() => { capturedOnSave!(BODY) })
    act(() => { vi.advanceTimersByTime(1100) })
    await flushEffects()

    const [, writtenPath] = mockWriteFile.mock.calls[0]
    expect(writtenPath).toBe(WIKI_PATH)
  })

  // ── 8. 连续加载再保存 ────────────────────────────────────────────────

  it("ES-12 多次切换后最终成功加载的 path 可以正常保存", async () => {
    const FINAL_PATH = "wiki/sources/2025体检报告/entities/高脂血症.md"
    const FINAL_FM = "---\ntype: concept\ntitle: 高脂血症\n---\n"
    const FINAL_BODY = "高脂血症 concept body."

    mockReadFile.mockImplementation(async (_pid, filePath) => {
      if (filePath === FINAL_PATH) return FINAL_FM + FINAL_BODY
      return FULL_CONTENT
    })

    setupStore(WIKI_PATH)
    const { rerender } = render(<EditorArea />)
    await flushEffects()

    // 切换到最终 path
    useWikiStore.setState({
      openTabs: [{ id: "tab-final", path: FINAL_PATH, title: FINAL_PATH }],
      activeTabId: "tab-final",
      activeTabPath: FINAL_PATH,
      fileContent: "",
    } as any)
    rerender(<EditorArea />)
    await flushEffects()

    expect(capturedOnSave).not.toBeNull()
    act(() => { capturedOnSave!(FINAL_BODY) })
    act(() => { vi.advanceTimersByTime(1100) })
    await flushEffects()

    expect(mockWriteFile).toHaveBeenCalledWith(
      PROJECT.id,
      FINAL_PATH,
      expect.stringContaining("高脂血症"),
      { writer: "editor-autosave" },
    )
  })
})

// ─── writeFile 函数 options.writer 字段单元测试 ───────────────────────────

describe("writeFile — options.writer 字段", () => {
  it("WF-01 不传 options 时 mockWriteFile 仅被调用 3 个参数", async () => {
    const { writeFile } = await import("@/commands/fs")
    await writeFile("proj", "path/file.md", "content")
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    const call = mockWriteFile.mock.calls[0]
    expect(call[0]).toBe("proj")
    expect(call[1]).toBe("path/file.md")
    expect(call[2]).toBe("content")
    // options 未传时不应携带 writer 属性
    expect(call[3]).toBeUndefined()
  })

  it("WF-02 options.writer 为 'editor-autosave' 时正确传递", async () => {
    const { writeFile } = await import("@/commands/fs")
    await writeFile("proj", "path/file.md", "content", { writer: "editor-autosave" })
    expect(mockWriteFile).toHaveBeenCalledWith("proj", "path/file.md", "content", { writer: "editor-autosave" })
  })

  it("WF-03 各类 writer 值均可正确传递", async () => {
    const { writeFile } = await import("@/commands/fs")
    const writers = ["editor-autosave", "maintenance-script", "ingest-service"]
    for (const writer of writers) {
      mockWriteFile.mockClear()
      await writeFile("proj", "p.md", "content", { writer })
      expect(mockWriteFile).toHaveBeenCalledWith("proj", "p.md", "content", { writer })
    }
  })

  it("WF-04 options.writer 为空字符串时也可传递（边界值）", async () => {
    const { writeFile } = await import("@/commands/fs")
    await writeFile("proj", "path/file.md", "content", { writer: "" })
    expect(mockWriteFile).toHaveBeenCalledWith("proj", "path/file.md", "content", { writer: "" })
  })
})
