/**
 * Unit tests for preprocessFile and checkMarkitdown in preprocess-service.
 *
 * child_process.spawn is fully mocked via a fake EventEmitter so tests run
 * without any real processes or file-system I/O.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter } from "node:events"
import type { ChildProcess } from "node:child_process"

// ── fs mock ────────────────────────────────────────────────────────────────────
vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}))

// ── spawn mock ─────────────────────────────────────────────────────────────────
const mockSpawn = vi.fn()
vi.mock("node:child_process", () => ({ spawn: mockSpawn }))

// ── helpers ────────────────────────────────────────────────────────────────────

function makeFakeProc(
  { exitCode = 0, stdout = "", stderr = "", spawnError }: {
    exitCode?: number
    stdout?: string
    stderr?: string
    spawnError?: Error
  } = {},
): ChildProcess {
  const proc = new EventEmitter() as unknown as ChildProcess

  const stdoutEE = new EventEmitter()
  const stderrEE = new EventEmitter()
  ;(proc as any).stdout = stdoutEE
  ;(proc as any).stderr = stderrEE

  // Schedule events asynchronously so callers can attach listeners first
  setImmediate(() => {
    if (spawnError) {
      proc.emit("error", spawnError)
      return
    }
    if (stdout) stdoutEE.emit("data", Buffer.from(stdout))
    if (stderr) stderrEE.emit("data", Buffer.from(stderr))
    proc.emit("close", exitCode)
  })

  return proc
}

// ── imports under test (after mocks are set up) ────────────────────────────────
import fs from "node:fs/promises"

// Reset module cache between tests so _markitdownCommand is re-discovered
let preprocessModule: typeof import("../preprocess-service.js")

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  preprocessModule = await import("../preprocess-service.js")
})

afterEach(() => {
  vi.clearAllMocks()
})

// ── checkMarkitdown ────────────────────────────────────────────────────────────

describe("checkMarkitdown", () => {
  it("returns true when any candidate responds to --help", async () => {
    mockSpawn.mockImplementation((_cmd: string, _args: string[]) => makeFakeProc({ exitCode: 0 }))
    const result = await preprocessModule.checkMarkitdown()
    expect(result).toBe(true)
  })

  it("returns false when all candidates fail", async () => {
    mockSpawn.mockImplementation((_cmd: string, _args: string[]) =>
      makeFakeProc({ exitCode: 127 }),
    )
    const result = await preprocessModule.checkMarkitdown()
    expect(result).toBe(false)
  })

  it("returns false when spawn emits error for all candidates", async () => {
    mockSpawn.mockImplementation(() =>
      makeFakeProc({ spawnError: new Error("ENOENT") }),
    )
    const result = await preprocessModule.checkMarkitdown()
    expect(result).toBe(false)
  })
})

// ── preprocessFile – text file ─────────────────────────────────────────────────

describe("preprocessFile – text files", () => {
  it("reads .txt file directly and writes cache", async () => {
    vi.mocked(fs.readFile)
      .mockRejectedValueOnce(new Error("no cache"))   // cache read
      .mockResolvedValueOnce("hello world" as any)    // actual file
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)

    const events: string[] = []
    const result = await preprocessModule.preprocessFile("/proj/notes.txt", (e) => {
      events.push(e.stage)
    })

    expect(result).toBe("hello world")
    expect(events).toContain("done")
    expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
      "/proj/notes.txt.cache.txt",
      "hello world",
      "utf-8",
    )
  })
})

// ── preprocessFile – valid cache ───────────────────────────────────────────────

describe("preprocessFile – valid cache hit", () => {
  it("returns cached content and emits 'cached' without running markitdown", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("cached content" as any)

    const events: string[] = []
    const result = await preprocessModule.preprocessFile("/proj/doc.pdf", (e) => {
      events.push(e.stage)
    })

    expect(result).toBe("cached content")
    expect(events).toEqual(["cached"])
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})

// ── preprocessFile – stale fallback cache ─────────────────────────────────────

describe("preprocessFile – stale fallback cache", () => {
  it("ignores fallback cache and re-runs markitdown", async () => {
    const fallbackContent =
      "[Binary file: doc.pdf]\n\n(markitdown is not installed; install it with: pip install markitdown)"

    vi.mocked(fs.readFile).mockResolvedValueOnce(fallbackContent as any)
    // markitdown discovery: first candidate succeeds
    mockSpawn.mockImplementationOnce(() => makeFakeProc({ exitCode: 0 })) // --help
    // actual extraction
    mockSpawn.mockImplementationOnce(() =>
      makeFakeProc({ exitCode: 0, stdout: "extracted text" }),
    )
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)

    const events: string[] = []
    const result = await preprocessModule.preprocessFile("/proj/doc.pdf", (e) => {
      events.push(e.stage)
    })

    expect(result).toBe("extracted text")
    expect(events).toContain("done")
    // markitdown was actually called
    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["/proj/doc.pdf"]),
      expect.any(Object),
    )
  })
})

// ── preprocessFile – markitdown unavailable ───────────────────────────────────

describe("preprocessFile – markitdown unavailable", () => {
  it("returns fallback message and writes fallback cache when markitdown not found", async () => {
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("no cache"))
    mockSpawn.mockImplementation(() => makeFakeProc({ exitCode: 127 }))
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)

    const events: string[] = []
    const result = await preprocessModule.preprocessFile("/proj/doc.pdf", (e) => {
      events.push(e.stage)
    })

    expect(result).toContain("markitdown is not installed")
    expect(result).toContain("[Binary file: doc.pdf]")
    expect(events).toContain("done")
    expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
      "/proj/doc.pdf.cache.txt",
      expect.stringContaining("markitdown is not installed"),
      "utf-8",
    )
  })
})

// ── preprocessFile – markitdown success ───────────────────────────────────────

describe("preprocessFile – markitdown success", () => {
  it("resolves with extracted content and writes cache", async () => {
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("no cache"))
    // discovery
    mockSpawn.mockImplementationOnce(() => makeFakeProc({ exitCode: 0 }))
    // extraction
    mockSpawn.mockImplementationOnce(() =>
      makeFakeProc({ exitCode: 0, stdout: "# Document\n\nContent here." }),
    )
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)

    const events: Array<{ stage: string; done?: boolean }> = []
    const result = await preprocessModule.preprocessFile("/proj/report.pdf", (e) => {
      events.push({ stage: e.stage, done: e.done })
    })

    expect(result).toBe("# Document\n\nContent here.")
    const doneEvent = events.find((e) => e.stage === "done")
    expect(doneEvent?.done).toBe(true)
    expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
      "/proj/report.pdf.cache.txt",
      "# Document\n\nContent here.",
      "utf-8",
    )
  })
})

// ── preprocessFile – markitdown non-zero exit ─────────────────────────────────

describe("preprocessFile – markitdown non-zero exit", () => {
  it("resolves with '' and emits error event (does not reject)", async () => {
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("no cache"))
    mockSpawn.mockImplementationOnce(() => makeFakeProc({ exitCode: 0 })) // discovery
    mockSpawn.mockImplementationOnce(() =>
      makeFakeProc({ exitCode: 1, stderr: "Conversion failed" }),
    )

    const events: Array<{ stage: string; error?: string }> = []
    const result = await preprocessModule.preprocessFile("/proj/broken.pdf", (e) => {
      events.push({ stage: e.stage, error: e.error })
    })

    expect(result).toBe("")
    const errEvent = events.find((e) => e.stage === "error")
    expect(errEvent).toBeDefined()
    expect(errEvent?.error).toContain("code 1")
  })
})

// ── preprocessFile – spawn error ──────────────────────────────────────────────

describe("preprocessFile – spawn error", () => {
  it("resolves with '' and emits error event when spawn fails", async () => {
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("no cache"))
    mockSpawn.mockImplementationOnce(() => makeFakeProc({ exitCode: 0 })) // discovery
    mockSpawn.mockImplementationOnce(() =>
      makeFakeProc({ spawnError: new Error("ENOENT: no such file") }),
    )

    const events: Array<{ stage: string; error?: string }> = []
    const result = await preprocessModule.preprocessFile("/proj/doc.pdf", (e) => {
      events.push({ stage: e.stage, error: e.error })
    })

    expect(result).toBe("")
    const errEvent = events.find((e) => e.stage === "error")
    expect(errEvent).toBeDefined()
    expect(errEvent?.error).toContain("ENOENT")
  })
})
