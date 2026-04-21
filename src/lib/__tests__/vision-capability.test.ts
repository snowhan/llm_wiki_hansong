import { describe, it, expect } from "vitest"
import { supportsVision } from "../vision-capability"

describe("supportsVision — OpenAI", () => {
  it("gpt-4o supports vision", () => {
    expect(supportsVision("openai", "gpt-4o")).toBe(true)
  })

  it("gpt-4o-mini supports vision", () => {
    expect(supportsVision("openai", "gpt-4o-mini")).toBe(true)
  })

  it("gpt-4-turbo supports vision", () => {
    expect(supportsVision("openai", "gpt-4-turbo")).toBe(true)
  })

  it("gpt-4-vision-preview supports vision", () => {
    expect(supportsVision("openai", "gpt-4-vision-preview")).toBe(true)
  })

  it("gpt-4.1 supports vision", () => {
    expect(supportsVision("openai", "gpt-4.1")).toBe(true)
  })

  it("gpt-3.5-turbo does NOT support vision", () => {
    expect(supportsVision("openai", "gpt-3.5-turbo")).toBe(false)
  })

  it("gpt-4 base does NOT support vision", () => {
    expect(supportsVision("openai", "gpt-4")).toBe(false)
  })
})

describe("supportsVision — Anthropic", () => {
  it("claude-3-opus supports vision", () => {
    expect(supportsVision("anthropic", "claude-3-opus-20240229")).toBe(true)
  })

  it("claude-3-sonnet supports vision", () => {
    expect(supportsVision("anthropic", "claude-3-sonnet-20240229")).toBe(true)
  })

  it("claude-3-5-sonnet supports vision", () => {
    expect(supportsVision("anthropic", "claude-3-5-sonnet-20241022")).toBe(true)
  })

  it("claude-3-haiku supports vision", () => {
    expect(supportsVision("anthropic", "claude-3-haiku-20240307")).toBe(true)
  })

  it("claude-2 does NOT support vision", () => {
    expect(supportsVision("anthropic", "claude-2.1")).toBe(false)
  })

  it("claude-instant does NOT support vision", () => {
    expect(supportsVision("anthropic", "claude-instant-1")).toBe(false)
  })
})

describe("supportsVision — Google", () => {
  it("gemini-1.5-pro supports vision", () => {
    expect(supportsVision("google", "gemini-1.5-pro")).toBe(true)
  })

  it("gemini-1.5-flash supports vision", () => {
    expect(supportsVision("google", "gemini-1.5-flash")).toBe(true)
  })

  it("gemini-2.0-flash supports vision", () => {
    expect(supportsVision("google", "gemini-2.0-flash")).toBe(true)
  })

  it("gemini-pro-vision supports vision", () => {
    expect(supportsVision("google", "gemini-pro-vision")).toBe(true)
  })

  it("gemini-1.0-pro does NOT support vision", () => {
    expect(supportsVision("google", "gemini-1.0-pro")).toBe(false)
  })
})

describe("supportsVision — Ollama", () => {
  it("llava supports vision", () => {
    expect(supportsVision("ollama", "llava")).toBe(true)
  })

  it("llava:13b supports vision", () => {
    expect(supportsVision("ollama", "llava:13b")).toBe(true)
  })

  it("bakllava supports vision", () => {
    expect(supportsVision("ollama", "bakllava")).toBe(true)
  })

  it("moondream supports vision", () => {
    expect(supportsVision("ollama", "moondream")).toBe(true)
  })

  it("minicpm-v supports vision", () => {
    expect(supportsVision("ollama", "minicpm-v")).toBe(true)
  })

  it("llama3 does NOT support vision", () => {
    expect(supportsVision("ollama", "llama3")).toBe(false)
  })

  it("mistral does NOT support vision", () => {
    expect(supportsVision("ollama", "mistral")).toBe(false)
  })
})

describe("supportsVision — WPS", () => {
  it("wps provider always returns true (gateway handles routing)", () => {
    expect(supportsVision("wps", "azure/gpt-5.4")).toBe(true)
  })
})

describe("supportsVision — Custom/MiniMax", () => {
  it("custom provider returns false by default", () => {
    expect(supportsVision("custom", "some-model")).toBe(false)
  })

  it("minimax returns false by default", () => {
    expect(supportsVision("minimax", "MiniMax-M2.7")).toBe(false)
  })
})

describe("supportsVision — edge cases", () => {
  it("unknown provider returns false", () => {
    expect(supportsVision("unknown-provider", "some-model")).toBe(false)
  })

  it("empty model string returns false", () => {
    expect(supportsVision("openai", "")).toBe(false)
  })

  it("case-insensitive model matching", () => {
    expect(supportsVision("openai", "GPT-4O")).toBe(true)
    expect(supportsVision("anthropic", "CLAUDE-3-SONNET")).toBe(true)
  })
})
