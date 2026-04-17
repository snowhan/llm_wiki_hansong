import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { startClipWatcher, stopClipWatcher } from "../clip-watcher"
import { useWikiStore } from "@/stores/wiki-store"
import { listDirectory } from "@/commands/fs"

vi.mock("./ingest", () => ({ autoIngest: vi.fn().mockResolvedValue([]) }))

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

describe("clip-watcher", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    stopClipWatcher()
    useWikiStore.setState({
      project: { name: "test", path: "/test" },
      llmConfig: { provider: "openai", apiKey: "key", model: "m", contextSize: 4096 },
      setFileTree: vi.fn(),
    } as any)
    vi.mocked(listDirectory).mockResolvedValue([])
  })

  afterEach(() => {
    stopClipWatcher()
    vi.useRealTimers()
  })

  it("polls clip server every 3 seconds", () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ ok: false }) })
    startClipWatcher()
    expect(mockFetch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3000)
    expect(mockFetch).toHaveBeenCalledWith("/api/clip/status", { method: "GET" })
  })

  it("does not start a second interval if already running", () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ ok: false }) })
    startClipWatcher()
    startClipWatcher()
    vi.advanceTimersByTime(3000)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("stopClipWatcher clears the interval", () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ ok: false }) })
    startClipWatcher()
    stopClipWatcher()
    vi.advanceTimersByTime(6000)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("refreshes file tree when clip matches current project", async () => {
    const setFileTree = vi.fn()
    useWikiStore.setState({ setFileTree } as any)
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        ok: true,
        clips: [{ projectPath: "/test", filePath: "/test/raw/sources/clip.md" }],
      }),
    })

    startClipWatcher()
    await vi.advanceTimersByTimeAsync(3000)
    expect(listDirectory).toHaveBeenCalledWith("/test")
  })

  it("silently ignores fetch errors", () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"))
    startClipWatcher()
    expect(() => vi.advanceTimersByTime(3000)).not.toThrow()
  })
})
