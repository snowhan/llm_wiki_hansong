import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("../persist", () => ({
  saveReviewItems: vi.fn().mockResolvedValue(undefined),
  saveChatHistory: vi.fn().mockResolvedValue(undefined),
}))

import { setupAutoSave } from "../auto-save"
import { useReviewStore } from "@/stores/review-store"
import { useChatStore } from "@/stores/chat-store"
import { useWikiStore } from "@/stores/wiki-store"
import { saveReviewItems, saveChatHistory } from "../persist"

describe("setupAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useWikiStore.setState({ project: { id: "test-uuid", name: "test", path: "/test" } } as any)
    useReviewStore.setState({ items: [] })
    useChatStore.setState({ conversations: [], messages: [], isStreaming: false })
  })

  afterEach(() => { vi.useRealTimers() })

  it("saves review items after 1s debounce on store change", () => {
    setupAutoSave()
    useReviewStore.setState({ items: [{ id: "1", type: "suggestion", title: "t", detail: "", options: [], resolved: false }] as any })
    expect(saveReviewItems).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(saveReviewItems).toHaveBeenCalledWith("test-uuid", expect.any(Array))
  })

  it("saves chat history after 2s debounce", () => {
    setupAutoSave()
    useChatStore.setState({ conversations: [{ id: "c1", title: "t", createdAt: 0, updatedAt: 0 }], messages: [], isStreaming: false })
    expect(saveChatHistory).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(saveChatHistory).toHaveBeenCalled()
  })

  it("does not save when no project", () => {
    useWikiStore.setState({ project: null } as any)
    setupAutoSave()
    useReviewStore.setState({ items: [] })
    vi.advanceTimersByTime(2000)
    expect(saveReviewItems).not.toHaveBeenCalled()
  })

  it("debounces rapid consecutive changes", () => {
    setupAutoSave()
    useReviewStore.setState({ items: [{ id: "1" }] as any })
    vi.advanceTimersByTime(500)
    useReviewStore.setState({ items: [{ id: "1" }, { id: "2" }] as any })
    vi.advanceTimersByTime(500)
    expect(saveReviewItems).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(saveReviewItems).toHaveBeenCalledTimes(1)
  })
})
