import { describe, it, expect, vi, beforeEach } from "vitest"
import { checkIngestCache, saveIngestCache, removeFromIngestCache } from "../ingest-cache"

const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()

vi.mock("@/commands/fs", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}))

beforeEach(() => {
  mockReadFile.mockReset()
  mockWriteFile.mockReset()
})

describe("checkIngestCache", () => {
  it("returns null when cache file does not exist", async () => {
    mockReadFile.mockRejectedValue(new Error("Not found"))
    const result = await checkIngestCache("proj-uuid", "file.pdf", "content")
    expect(result).toBeNull()
  })

  it("returns null when entry not in cache", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ entries: {} }))
    const result = await checkIngestCache("proj-uuid", "file.pdf", "content")
    expect(result).toBeNull()
  })

  it("returns filesWritten when hash matches", async () => {
    const content = "hello world"
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(content))
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")

    mockReadFile.mockResolvedValue(
      JSON.stringify({
        entries: {
          "file.pdf": {
            hash,
            timestamp: Date.now(),
            filesWritten: ["wiki/entities/foo.md"],
          },
        },
      }),
    )

    const result = await checkIngestCache("proj-uuid", "file.pdf", content)
    expect(result).toEqual(["wiki/entities/foo.md"])
  })

  it("returns null when hash does not match", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        entries: {
          "file.pdf": {
            hash: "stale-hash",
            timestamp: Date.now(),
            filesWritten: ["wiki/entities/foo.md"],
          },
        },
      }),
    )

    const result = await checkIngestCache("proj-uuid", "file.pdf", "new content")
    expect(result).toBeNull()
  })
})

describe("saveIngestCache", () => {
  it("writes cache file with new entry", async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ entries: {} }))
    mockWriteFile.mockResolvedValue(undefined)

    await saveIngestCache("proj-uuid", "file.pdf", "content", ["wiki/a.md"])

    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    // writeFile(projectId, relativePath, data)
    const [_projectId, relativePath, data] = mockWriteFile.mock.calls[0]
    expect(relativePath).toContain("ingest-cache.json")
    const parsed = JSON.parse(data)
    expect(parsed.entries["file.pdf"]).toBeDefined()
    expect(parsed.entries["file.pdf"].filesWritten).toEqual(["wiki/a.md"])
  })

  it("preserves existing entries", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        entries: { "old.pdf": { hash: "abc", timestamp: 1, filesWritten: [] } },
      }),
    )
    mockWriteFile.mockResolvedValue(undefined)

    await saveIngestCache("proj-uuid", "new.pdf", "content", [])

    const [, , data] = mockWriteFile.mock.calls[0]
    const parsed = JSON.parse(data)
    expect(parsed.entries["old.pdf"]).toBeDefined()
    expect(parsed.entries["new.pdf"]).toBeDefined()
  })
})

describe("removeFromIngestCache", () => {
  it("removes specified entry", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        entries: {
          "a.pdf": { hash: "x", timestamp: 1, filesWritten: [] },
          "b.pdf": { hash: "y", timestamp: 2, filesWritten: [] },
        },
      }),
    )
    mockWriteFile.mockResolvedValue(undefined)

    await removeFromIngestCache("proj-uuid", "a.pdf")

    const [, , data] = mockWriteFile.mock.calls[0]
    const parsed = JSON.parse(data)
    expect(parsed.entries["a.pdf"]).toBeUndefined()
    expect(parsed.entries["b.pdf"]).toBeDefined()
  })
})
