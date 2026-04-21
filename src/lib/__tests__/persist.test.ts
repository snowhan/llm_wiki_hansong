import { describe, it, expect, vi, beforeEach } from "vitest"
import { saveChatHistory, loadChatHistory } from "../persist"

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

describe("saveChatHistory", () => {
  it("writes conversations and per-conversation messages", async () => {
    mockWriteFile.mockResolvedValue(undefined)
    const convs = [{ id: "c1", title: "Chat 1", createdAt: 1, updatedAt: 2 }]
    const msgs = [
      { id: "m1", role: "user" as const, content: "hi", timestamp: 1, conversationId: "c1" },
      { id: "m2", role: "assistant" as const, content: "hello", timestamp: 2, conversationId: "c1" },
    ]
    await saveChatHistory("proj-uuid", convs, msgs)

    expect(mockWriteFile).toHaveBeenCalledTimes(2)
    // Each call: (projectId, relativePath, data)
    const relativePaths = mockWriteFile.mock.calls.map((call) => call[1] as string)
    expect(relativePaths.some((p: string) => p.includes("conversations.json"))).toBe(true)
    expect(relativePaths.some((p: string) => p.includes("chats/c1.json"))).toBe(true)
  })
})

describe("loadChatHistory", () => {
  it("returns empty when no files exist", async () => {
    mockReadFile.mockRejectedValue(new Error("Not found"))
    const result = await loadChatHistory("proj-uuid")
    expect(result).toEqual({ conversations: [], messages: [] })
  })

  it("loads new format (separate files)", async () => {
    const convs = [{ id: "c1", title: "Chat", createdAt: 1, updatedAt: 2 }]
    const msgs = [{ id: "m1", role: "user", content: "hi", timestamp: 1, conversationId: "c1" }]

    mockReadFile.mockImplementation(async (_projectId: string, relativePath: string) => {
      if (relativePath.includes("conversations.json")) return JSON.stringify(convs)
      if (relativePath.includes("chats/c1.json")) return JSON.stringify(msgs)
      throw new Error("Not found")
    })

    const result = await loadChatHistory("proj-uuid")
    expect(result.conversations).toEqual(convs)
    expect(result.messages).toEqual(msgs)
  })

  it("handles missing conversations file as empty state", async () => {
    mockReadFile.mockRejectedValue(new Error("Not found"))

    const result = await loadChatHistory("proj-uuid")
    expect(result.conversations).toHaveLength(0)
    expect(result.messages).toHaveLength(0)
  })
})
