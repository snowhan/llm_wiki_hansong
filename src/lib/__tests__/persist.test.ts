import { describe, it, expect, vi, beforeEach } from "vitest"
import { saveReviewItems, loadReviewItems, saveChatHistory, loadChatHistory } from "../persist"

const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
const mockCreateDirectory = vi.fn()

vi.mock("@/commands/fs", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  createDirectory: (...args: unknown[]) => mockCreateDirectory(...args),
}))

beforeEach(() => {
  mockReadFile.mockReset()
  mockWriteFile.mockReset()
  mockCreateDirectory.mockResolvedValue(undefined)
})

describe("saveReviewItems", () => {
  it("writes review items to file", async () => {
    mockWriteFile.mockResolvedValue(undefined)
    const items = [
      {
        id: "r-1",
        type: "suggestion" as const,
        title: "Test",
        description: "Desc",
        options: [],
        resolved: false,
        createdAt: 123,
      },
    ]
    await saveReviewItems("/proj", items)
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    const [path, data] = mockWriteFile.mock.calls[0]
    expect(path).toContain("review.json")
    expect(JSON.parse(data)).toEqual(items)
  })
})

describe("loadReviewItems", () => {
  it("returns empty array when file missing", async () => {
    mockReadFile.mockRejectedValue(new Error("Not found"))
    const result = await loadReviewItems("/proj")
    expect(result).toEqual([])
  })

  it("returns parsed items", async () => {
    const items = [{ id: "r-1", type: "suggestion", title: "T" }]
    mockReadFile.mockResolvedValue(JSON.stringify(items))
    const result = await loadReviewItems("/proj")
    expect(result).toEqual(items)
  })
})

describe("saveChatHistory", () => {
  it("writes conversations and per-conversation messages", async () => {
    mockWriteFile.mockResolvedValue(undefined)
    const convs = [{ id: "c1", title: "Chat 1", createdAt: 1, updatedAt: 2 }]
    const msgs = [
      { id: "m1", role: "user" as const, content: "hi", timestamp: 1, conversationId: "c1" },
      { id: "m2", role: "assistant" as const, content: "hello", timestamp: 2, conversationId: "c1" },
    ]
    await saveChatHistory("/proj", convs, msgs)

    expect(mockWriteFile).toHaveBeenCalledTimes(2)
    const paths = mockWriteFile.mock.calls.map(([p]: [string]) => p)
    expect(paths.some((p: string) => p.includes("conversations.json"))).toBe(true)
    expect(paths.some((p: string) => p.includes("chats/c1.json"))).toBe(true)
  })
})

describe("loadChatHistory", () => {
  it("returns empty when no files exist", async () => {
    mockReadFile.mockRejectedValue(new Error("Not found"))
    const result = await loadChatHistory("/proj")
    expect(result).toEqual({ conversations: [], messages: [] })
  })

  it("loads new format (separate files)", async () => {
    const convs = [{ id: "c1", title: "Chat", createdAt: 1, updatedAt: 2 }]
    const msgs = [{ id: "m1", role: "user", content: "hi", timestamp: 1, conversationId: "c1" }]

    mockReadFile.mockImplementation(async (path: string) => {
      if (path.includes("conversations.json")) return JSON.stringify(convs)
      if (path.includes("chats/c1.json")) return JSON.stringify(msgs)
      throw new Error("Not found")
    })

    const result = await loadChatHistory("/proj")
    expect(result.conversations).toEqual(convs)
    expect(result.messages).toEqual(msgs)
  })

  it("handles legacy flat array format", async () => {
    const legacyMsgs = [
      { id: "m1", role: "user", content: "old", timestamp: 100 },
    ]

    mockReadFile.mockImplementation(async (path: string) => {
      if (path.includes("conversations.json")) throw new Error("Not found")
      if (path.includes("chat-history.json")) return JSON.stringify(legacyMsgs)
      throw new Error("Not found")
    })

    const result = await loadChatHistory("/proj")
    expect(result.conversations).toHaveLength(1)
    expect(result.conversations[0].id).toBe("default")
    expect(result.messages[0].conversationId).toBe("default")
  })
})
