import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("../persist", () => ({
  saveChatHistory: vi.fn().mockResolvedValue(undefined),
}))

import { setupAutoSave } from "../auto-save"
import { useChatStore } from "@/stores/chat-store"
import { useWikiStore } from "@/stores/wiki-store"
import { saveChatHistory } from "../persist"

let teardown: (() => void) | null = null

describe("setupAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useWikiStore.setState({ project: { id: "test-uuid", name: "test", path: "/test" } } as any)
    useChatStore.setState({ conversations: [], messages: [], isStreaming: false })
  })

  afterEach(() => {
    teardown?.()
    teardown = null
    vi.useRealTimers()
  })

  it("saves chat history after 2s debounce", () => {
    teardown = setupAutoSave()
    useChatStore.setState({ conversations: [{ id: "c1", title: "t", createdAt: 0, updatedAt: 0 }], messages: [], isStreaming: false })
    expect(saveChatHistory).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(saveChatHistory).toHaveBeenCalled()
  })

  it("does not save chat when no project", () => {
    useWikiStore.setState({ project: null } as any)
    teardown = setupAutoSave()
    useChatStore.setState({ conversations: [{ id: "c1", title: "t", createdAt: 0, updatedAt: 0 }], messages: [], isStreaming: false })
    vi.advanceTimersByTime(2000)
    expect(saveChatHistory).not.toHaveBeenCalled()
  })

  it("does not save when isStreaming", () => {
    teardown = setupAutoSave()
    useChatStore.setState({ conversations: [{ id: "c1", title: "t", createdAt: 0, updatedAt: 0 }], messages: [], isStreaming: true })
    vi.advanceTimersByTime(2000)
    expect(saveChatHistory).not.toHaveBeenCalled()
  })

  it("debounces rapid consecutive chat changes", () => {
    teardown = setupAutoSave()
    useChatStore.setState({ conversations: [{ id: "c1" }] as any, isStreaming: false })
    vi.advanceTimersByTime(500)
    useChatStore.setState({ conversations: [{ id: "c1" }, { id: "c2" }] as any, isStreaming: false })
    vi.advanceTimersByTime(500)
    expect(saveChatHistory).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1500)
    expect(saveChatHistory).toHaveBeenCalledTimes(1)
  })
})
