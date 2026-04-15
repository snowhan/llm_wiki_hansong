import { vi } from "vitest"

export function mockFsReadFile(mapping: Record<string, string>) {
  const { readFile } = require("@/commands/fs")
  ;(readFile as ReturnType<typeof vi.fn>).mockImplementation(
    async (path: string) => {
      if (path in mapping) return mapping[path]
      throw new Error(`File not found: ${path}`)
    },
  )
}

export function mockFsListDirectory(mapping: Record<string, unknown[]>) {
  const { listDirectory } = require("@/commands/fs")
  ;(listDirectory as ReturnType<typeof vi.fn>).mockImplementation(
    async (path: string) => {
      if (path in mapping) return mapping[path]
      throw new Error(`Directory not found: ${path}`)
    },
  )
}

export function mockFsWriteFile() {
  const writes: Array<{ path: string; content: string }> = []
  const { writeFile } = require("@/commands/fs")
  ;(writeFile as ReturnType<typeof vi.fn>).mockImplementation(
    async (path: string, content: string) => {
      writes.push({ path, content })
    },
  )
  return writes
}
