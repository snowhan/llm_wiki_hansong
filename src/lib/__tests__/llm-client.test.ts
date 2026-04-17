import { describe, it, expect, vi, beforeEach } from "vitest"
import { streamChat, type StreamCallbacks } from "../llm-client"
import type { LlmConfig } from "@/stores/wiki-store"

vi.mock("../llm-providers", () => ({
  getProviderConfig: vi.fn(() => ({
    url: "https://api.example.com/v1/chat/completions",
    headers: { "Content-Type": "application/json", Authorization: "Bearer key" },
    buildBody: (msgs: unknown[]) => ({ model: "test", messages: msgs, stream: true }),
    parseStream: (line: string) => {
      if (line === "data: [DONE]") return null
      if (line.startsWith("data: ")) {
        try {
          const json = JSON.parse(line.slice(6))
          return json.choices?.[0]?.delta?.content ?? null
        } catch {
          return null
        }
      }
      return null
    },
  })),
}))

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

const config: LlmConfig = {
  provider: "openai",
  apiKey: "test-key",
  model: "gpt-4",
  ollamaUrl: "http://localhost:11434",
  customEndpoint: "",
  maxContextSize: 4096,
}

function makeSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
}

function makeCallbacks() {
  const tokens: string[] = []
  const errors: Error[] = []
  let done = false
  const cb: StreamCallbacks = {
    onToken: (t) => tokens.push(t),
    onDone: () => { done = true },
    onError: (e) => errors.push(e),
  }
  return { tokens, errors, isDone: () => done, cb }
}

describe("streamChat", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("streams tokens from SSE response", async () => {
    const stream = makeSSEStream([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      "data: [DONE]\n\n",
    ])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const { tokens, cb, isDone } = makeCallbacks()
    await streamChat(config, [{ role: "user", content: "hi" }], cb)
    expect(tokens).toEqual(["Hello", " world"])
    expect(isDone()).toBe(true)
  })

  it("calls onError on non-ok response", async () => {
    mockFetch.mockResolvedValue(new Response("Bad request", { status: 400, statusText: "Bad Request" }))

    const { errors, cb } = makeCallbacks()
    await streamChat(config, [{ role: "user", content: "hi" }], cb)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("400")
  })

  it("calls onError when response body is null", async () => {
    const resp = new Response(null, { status: 200 })
    Object.defineProperty(resp, "body", { value: null })
    mockFetch.mockResolvedValue(resp)

    const { errors, cb } = makeCallbacks()
    await streamChat(config, [{ role: "user", content: "hi" }], cb)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("null")
  })

  it("calls onDone on user-initiated abort", async () => {
    const ac = new AbortController()
    ac.abort()
    const err = Object.assign(new Error("Aborted"), { name: "AbortError" })
    mockFetch.mockRejectedValue(err)

    const { cb, isDone, errors } = makeCallbacks()
    await streamChat(config, [{ role: "user", content: "hi" }], cb, ac.signal)
    expect(isDone()).toBe(true)
    expect(errors).toHaveLength(0)
  })

  it("calls onError on network error (non-abort)", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"))

    const { errors, cb } = makeCallbacks()
    await streamChat(config, [{ role: "user", content: "hi" }], cb)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe("Network failure")
  })

  it("handles multi-line chunks split across boundaries", async () => {
    const stream = makeSSEStream([
      'data: {"choices":[{"delta":{"con',
      'tent":"split"}}]}\n\ndata: [DONE]\n\n',
    ])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const { tokens, cb } = makeCallbacks()
    await streamChat(config, [{ role: "user", content: "hi" }], cb)
    expect(tokens).toEqual(["split"])
  })

  it("handles remaining buffer after stream ends", async () => {
    const stream = makeSSEStream([
      'data: {"choices":[{"delta":{"content":"last"}}]}',
    ])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const { tokens, cb } = makeCallbacks()
    await streamChat(config, [{ role: "user", content: "hi" }], cb)
    expect(tokens).toEqual(["last"])
  })

  it("handles Load failed as timeout/network error", async () => {
    mockFetch.mockRejectedValue(new Error("Load failed"))

    const { errors, cb } = makeCallbacks()
    await streamChat(config, [{ role: "user", content: "hi" }], cb)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("timed out")
  })
})
