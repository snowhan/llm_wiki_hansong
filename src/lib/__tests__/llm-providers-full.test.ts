import { describe, it, expect, vi } from "vitest"
import { getProviderConfig } from "../llm-providers"
import type { LlmConfig } from "@/stores/wiki-store"
import type { ContentPart, ChatMessage } from "../llm-providers"

vi.stubGlobal("crypto", {
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = i
    return arr
  },
})

const baseConfig: LlmConfig = {
  provider: "openai",
  apiKey: "test-key",
  model: "gpt-4",
  ollamaUrl: "http://localhost:11434",
  customEndpoint: "http://custom:8080",
  maxContextSize: 128000,
}

describe("getProviderConfig — OpenAI", () => {
  const cfg = getProviderConfig({ ...baseConfig, provider: "openai" })

  it("uses correct URL", () => {
    expect(cfg.url).toBe("https://api.openai.com/v1/chat/completions")
  })

  it("sets Authorization header", () => {
    expect(cfg.headers.Authorization).toBe("Bearer test-key")
  })

  it("builds body with model and stream", () => {
    const body = cfg.buildBody([{ role: "user", content: "hi" }]) as Record<string, unknown>
    expect(body.model).toBe("gpt-4")
    expect(body.stream).toBe(true)
    expect(body.messages).toHaveLength(1)
  })

  it("parses OpenAI stream line", () => {
    const line = 'data: {"choices":[{"delta":{"content":"hello"}}]}'
    expect(cfg.parseStream(line)).toBe("hello")
  })

  it("returns null for [DONE]", () => {
    expect(cfg.parseStream("data: [DONE]")).toBeNull()
  })

  it("returns null for non-data lines", () => {
    expect(cfg.parseStream("event: message")).toBeNull()
  })
})

describe("getProviderConfig — Anthropic", () => {
  const cfg = getProviderConfig({ ...baseConfig, provider: "anthropic" })

  it("uses correct URL", () => {
    expect(cfg.url).toBe("https://api.anthropic.com/v1/messages")
  })

  it("sets x-api-key header", () => {
    expect(cfg.headers["x-api-key"]).toBe("test-key")
  })

  it("sets anthropic-version header", () => {
    expect(cfg.headers["anthropic-version"]).toBe("2023-06-01")
  })

  it("separates system messages", () => {
    const body = cfg.buildBody([
      { role: "system", content: "You are helpful" },
      { role: "user", content: "hi" },
    ]) as Record<string, unknown>
    expect(body.system).toBe("You are helpful")
    expect((body.messages as Array<{ role: string }>).length).toBe(1)
  })

  it("includes max_tokens", () => {
    const body = cfg.buildBody([{ role: "user", content: "hi" }]) as Record<string, unknown>
    expect(body.max_tokens).toBe(4096)
  })

  it("parses Anthropic content_block_delta", () => {
    const line = 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}'
    expect(cfg.parseStream(line)).toBe("hello")
  })
})

describe("getProviderConfig — Google", () => {
  const cfg = getProviderConfig({ ...baseConfig, provider: "google", model: "gemini-pro" })

  it("uses model in URL", () => {
    expect(cfg.url).toContain("gemini-pro:streamGenerateContent")
  })

  it("sets x-goog-api-key", () => {
    expect(cfg.headers["x-goog-api-key"]).toBe("test-key")
  })

  it("builds contents array with role mapping", () => {
    const body = cfg.buildBody([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]) as Record<string, unknown>
    const contents = body.contents as Array<{ role: string }>
    expect(contents[0].role).toBe("user")
    expect(contents[1].role).toBe("model")
  })

  it("parses Google stream line", () => {
    const line = 'data: {"candidates":[{"content":{"parts":[{"text":"hey"}]}}]}'
    expect(cfg.parseStream(line)).toBe("hey")
  })
})

describe("getProviderConfig — Ollama", () => {
  const cfg = getProviderConfig({ ...baseConfig, provider: "ollama" })

  it("uses ollamaUrl", () => {
    expect(cfg.url).toBe("http://localhost:11434/v1/chat/completions")
  })

  it("has no Authorization header", () => {
    expect(cfg.headers.Authorization).toBeUndefined()
  })
})

describe("getProviderConfig — MiniMax", () => {
  const cfg = getProviderConfig({ ...baseConfig, provider: "minimax" })

  it("uses correct URL", () => {
    expect(cfg.url).toBe("https://api.minimax.io/v1/chat/completions")
  })

  it("includes temperature 1.0", () => {
    const body = cfg.buildBody([]) as Record<string, unknown>
    expect(body.temperature).toBe(1.0)
  })
})

describe("getProviderConfig — Custom", () => {
  it("uses customEndpoint", () => {
    const cfg = getProviderConfig({ ...baseConfig, provider: "custom" })
    expect(cfg.url).toBe("http://custom:8080/chat/completions")
  })

  it("omits Authorization when no apiKey", () => {
    const cfg = getProviderConfig({ ...baseConfig, provider: "custom", apiKey: "" })
    expect(cfg.headers.Authorization).toBeUndefined()
  })
})

// ── Multimodal ContentPart tests ─────────────────────────────────────────────

const imagePartMsg: ChatMessage = {
  role: "user",
  content: [
    { type: "text", text: "Describe this image" },
    { type: "image_url", image_url: { url: "data:image/png;base64,abc123", detail: "auto" } },
  ],
}

describe("Multimodal — OpenAI passes ContentPart[] natively", () => {
  const cfg = getProviderConfig({ ...baseConfig, provider: "openai", model: "gpt-4o" })

  it("preserves ContentPart[] as-is in messages", () => {
    const body = cfg.buildBody([imagePartMsg]) as Record<string, unknown>
    const msgs = body.messages as ChatMessage[]
    expect(Array.isArray(msgs[0].content)).toBe(true)
    const parts = msgs[0].content as ContentPart[]
    expect(parts[0]).toEqual({ type: "text", text: "Describe this image" })
    expect(parts[1]).toMatchObject({ type: "image_url", image_url: { url: "data:image/png;base64,abc123" } })
  })

  it("still handles plain string content", () => {
    const body = cfg.buildBody([{ role: "user", content: "hello" }]) as Record<string, unknown>
    const msgs = body.messages as ChatMessage[]
    expect(msgs[0].content).toBe("hello")
  })
})

describe("Multimodal — Anthropic converts ContentPart[] to native format", () => {
  const cfg = getProviderConfig({ ...baseConfig, provider: "anthropic", model: "claude-3-5-sonnet-20241022" })

  it("converts image_url to Anthropic base64 format", () => {
    const body = cfg.buildBody([imagePartMsg]) as Record<string, unknown>
    const msgs = body.messages as Array<{ role: string; content: unknown[] }>
    const parts = msgs[0].content
    expect(parts[0]).toEqual({ type: "text", text: "Describe this image" })
    expect(parts[1]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "abc123" },
    })
  })

  it("still handles plain string content", () => {
    const body = cfg.buildBody([
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
    ]) as Record<string, unknown>
    const msgs = body.messages as Array<{ content: unknown }>
    expect(msgs[0].content).toBe("hello")
  })
})

describe("Multimodal — Google converts ContentPart[] to inline_data format", () => {
  const cfg = getProviderConfig({ ...baseConfig, provider: "google", model: "gemini-1.5-pro" })

  it("converts image_url to Google inline_data format", () => {
    const body = cfg.buildBody([imagePartMsg]) as Record<string, unknown>
    const contents = body.contents as Array<{ role: string; parts: unknown[] }>
    const parts = contents[0].parts
    expect(parts[0]).toEqual({ text: "Describe this image" })
    expect(parts[1]).toMatchObject({
      inline_data: { mime_type: "image/png", data: "abc123" },
    })
  })

  it("still handles plain string content", () => {
    const body = cfg.buildBody([{ role: "user", content: "hi" }]) as Record<string, unknown>
    const contents = body.contents as Array<{ parts: unknown[] }>
    expect(contents[0].parts[0]).toEqual({ text: "hi" })
  })
})

describe("Multimodal — ContentPart type exports", () => {
  it("ContentPart can be text type", () => {
    const part: ContentPart = { type: "text", text: "hello" }
    expect(part.type).toBe("text")
  })

  it("ContentPart can be image_url type", () => {
    const part: ContentPart = { type: "image_url", image_url: { url: "data:image/jpeg;base64,xyz" } }
    expect(part.type).toBe("image_url")
  })
})
