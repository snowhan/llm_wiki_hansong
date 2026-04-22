/**
 * Tests for POST /api/preprocess route.
 *
 * Verifies that:
 *  1. Errors thrown by preprocessFile after SSE headers are flushed are
 *     emitted as SSE error events instead of calling next(err), which would
 *     cause ERR_INCOMPLETE_CHUNKED_ENCODING in the browser.
 *  2. The happy path streams progress events and closes the response cleanly.
 *  3. Invalid request bodies return 400 before any SSE headers are written.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"
import type { Request, Response, NextFunction } from "express"

// ── Mock path-sandbox middleware ───────────────────────────────────────────────
vi.mock("../../middleware/path-sandbox.js", () => ({
  resolveProjectPath: vi.fn().mockResolvedValue("/data/projects/proj1/raw/sources/doc.pdf"),
}))

// ── Mock preprocess-service ────────────────────────────────────────────────────
const mockPreprocessFile = vi.fn()
vi.mock("../../services/preprocess-service.js", () => ({
  preprocessFile: (...args: unknown[]) => mockPreprocessFile(...args),
}))

// ── Import router after mocks are registered ──────────────────────────────────
import preprocessRouter from "../preprocess.js"

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use("/api/preprocess", preprocessRouter)
  // Generic error handler (should NOT be reached for SSE responses)
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: err.message })
  })
  return app
}

const VALID_BODY = { projectId: "proj1", path: "raw/sources/doc.pdf" }

beforeEach(() => {
  vi.clearAllMocks()
})

// ── 400 on invalid body ────────────────────────────────────────────────────────

describe("POST /api/preprocess – validation", () => {
  it("returns 400 when body is missing projectId", async () => {
    const res = await request(buildApp())
      .post("/api/preprocess")
      .send({ path: "raw/sources/doc.pdf" })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it("returns 400 when body is missing path", async () => {
    const res = await request(buildApp())
      .post("/api/preprocess")
      .send({ projectId: "proj1" })
    expect(res.status).toBe(400)
  })
})

// ── SSE happy path ─────────────────────────────────────────────────────────────

describe("POST /api/preprocess – SSE success", () => {
  it("sets SSE headers and closes response after preprocessFile completes", async () => {
    mockPreprocessFile.mockImplementation(
      (_path: string, onProgress: (e: object) => void) => {
        onProgress({ stage: "extracting", progress: 0.5 })
        onProgress({ stage: "done", progress: 1, done: true, content: "# Doc" })
        return Promise.resolve("# Doc")
      },
    )

    const res = await request(buildApp())
      .post("/api/preprocess")
      .send(VALID_BODY)

    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/)

    // Both SSE events should appear in the body
    expect(res.text).toContain('"stage":"extracting"')
    expect(res.text).toContain('"stage":"done"')
  })
})

// ── SSE error path ─────────────────────────────────────────────────────────────

describe("POST /api/preprocess – SSE error containment", () => {
  it("emits SSE error event and ends cleanly when preprocessFile throws", async () => {
    mockPreprocessFile.mockRejectedValue(new Error("unexpected boom"))

    const res = await request(buildApp())
      .post("/api/preprocess")
      .send(VALID_BODY)

    // Headers must already have been flushed (200) — no double response
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/)

    // Error surfaced as SSE event
    expect(res.text).toContain('"stage":"error"')
    expect(res.text).toContain("unexpected boom")
  })

  it("does NOT call the Express error handler after SSE headers are flushed", async () => {
    mockPreprocessFile.mockRejectedValue(new Error("stream error"))

    const errorHandler = vi.fn((_err: Error, _req: Request, res: Response, _next: NextFunction) => {
      res.status(500).json({ error: "should not reach here" })
    })

    const app = express()
    app.use(express.json())
    app.use("/api/preprocess", preprocessRouter)
    app.use(errorHandler as express.ErrorRequestHandler)

    const res = await request(app)
      .post("/api/preprocess")
      .send(VALID_BODY)

    expect(res.status).toBe(200)
    expect(errorHandler).not.toHaveBeenCalled()
  })

  it("emits SSE error event when onProgress receives error stage (resolve path)", async () => {
    mockPreprocessFile.mockImplementation(
      (_path: string, onProgress: (e: object) => void) => {
        onProgress({ stage: "error", progress: 1, done: true, error: "markitdown failed via markitdown (code 1): bad pdf" })
        return Promise.resolve("")
      },
    )

    const res = await request(buildApp())
      .post("/api/preprocess")
      .send(VALID_BODY)

    expect(res.status).toBe(200)
    expect(res.text).toContain('"stage":"error"')
    expect(res.text).toContain("markitdown failed")
  })
})
