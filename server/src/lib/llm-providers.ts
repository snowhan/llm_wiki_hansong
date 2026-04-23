/**
 * Server-side LLM provider configuration builder.
 * Mirrors the frontend llm-providers.ts but runs in Node.js,
 * with no access to browser APIs like import.meta.env.
 */
import { config as serverConfig } from "../config.js"

import type { LlmConfig } from "../types.js"

export type { LlmConfig }

// ── Multimodal content types ──────────────────────────────────────────────────

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string | ContentPart[]
}

export interface ProviderConfig {
  url: string
  headers: Record<string, string>
  buildBody: (messages: ChatMessage[], maxOutputTokens?: number) => unknown
  parseStream: (line: string) => string | null
}

const JSON_CONTENT_TYPE = "application/json"

// ── Helpers ───────────────────────────────────────────────────────────────────

function contentToString(content: string | ContentPart[]): string {
  if (typeof content === "string") return content
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
}

function parseDataUri(url: string): { media_type: string; data: string } | null {
  const m = url.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return null
  return { media_type: m[1], data: m[2] }
}

function toAnthropicContent(content: string | ContentPart[]): unknown {
  if (typeof content === "string") return content
  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text }
    const parsed = parseDataUri(part.image_url.url)
    if (parsed) {
      return {
        type: "image",
        source: { type: "base64", media_type: parsed.media_type, data: parsed.data },
      }
    }
    return {
      type: "image",
      source: { type: "url", url: part.image_url.url },
    }
  })
}

function toGoogleParts(content: string | ContentPart[]): unknown[] {
  if (typeof content === "string") return [{ text: content }]
  return content.map((part) => {
    if (part.type === "text") return { text: part.text }
    const parsed = parseDataUri(part.image_url.url)
    if (parsed) {
      return { inline_data: { mime_type: parsed.media_type, data: parsed.data } }
    }
    return { file_data: { file_uri: part.image_url.url } }
  })
}

// ── Stream parsers ────────────────────────────────────────────────────────────

function parseOpenAiLine(line: string): string | null {
  if (!line.startsWith("data: ")) return null
  const data = line.slice(6).trim()
  if (data === "[DONE]") return null
  try {
    const parsed = JSON.parse(data) as {
      choices: Array<{ delta: { content?: string } }>
    }
    return parsed.choices?.[0]?.delta?.content ?? null
  } catch {
    return null
  }
}

function parseAnthropicLine(line: string): string | null {
  if (!line.startsWith("data: ")) return null
  const data = line.slice(6).trim()
  try {
    const parsed = JSON.parse(data) as {
      type: string
      delta?: { type: string; text?: string }
    }
    if (
      parsed.type === "content_block_delta" &&
      parsed.delta?.type === "text_delta"
    ) {
      return parsed.delta.text ?? null
    }
    return null
  } catch {
    return null
  }
}

function parseGoogleLine(line: string): string | null {
  if (!line.startsWith("data: ")) return null
  const data = line.slice(6).trim()
  try {
    const parsed = JSON.parse(data) as {
      candidates: Array<{
        content: { parts: Array<{ text?: string }> }
      }>
    }
    return parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? null
  } catch {
    return null
  }
}

// ── Body builders ─────────────────────────────────────────────────────────────

function buildOpenAiBody(messages: ChatMessage[], model: string): Record<string, unknown> {
  return { messages, model, stream: true }
}

function buildAnthropicBody(messages: ChatMessage[], model: string): Record<string, unknown> {
  const systemMessages = messages.filter((m) => m.role === "system")
  const conversationMessages = messages.filter((m) => m.role !== "system")
  const system = systemMessages
    .map((m) => contentToString(m.content))
    .join("\n") || undefined

  const converted = conversationMessages.map((m) => ({
    role: m.role,
    content: toAnthropicContent(m.content),
  }))

  return {
    messages: converted,
    model,
    ...(system !== undefined ? { system } : {}),
    stream: true,
    max_tokens: 4096,
  }
}

function buildGoogleBody(messages: ChatMessage[]): Record<string, unknown> {
  const systemMessages = messages.filter((m) => m.role === "system")
  const conversationMessages = messages.filter((m) => m.role !== "system")

  const contents = conversationMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: toGoogleParts(m.content),
  }))

  const systemInstruction =
    systemMessages.length > 0
      ? { parts: systemMessages.map((m) => ({ text: contentToString(m.content) })) }
      : undefined

  return {
    contents,
    ...(systemInstruction !== undefined ? { systemInstruction } : {}),
  }
}

// ── Provider config ───────────────────────────────────────────────────────────

export function getProviderConfig(config: LlmConfig): ProviderConfig {
  const { provider, apiKey, model, ollamaUrl, customEndpoint } = config

  switch (provider) {
    case "openai":
      return {
        url: "https://api.openai.com/v1/chat/completions",
        headers: { "Content-Type": JSON_CONTENT_TYPE, Authorization: `Bearer ${apiKey}` },
        buildBody: (messages) => buildOpenAiBody(messages, model),
        parseStream: parseOpenAiLine,
      }

    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "Content-Type": JSON_CONTENT_TYPE,
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        buildBody: (messages) => buildAnthropicBody(messages, model),
        parseStream: parseAnthropicLine,
      }

    case "google":
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
        headers: { "Content-Type": JSON_CONTENT_TYPE, "x-goog-api-key": apiKey },
        buildBody: buildGoogleBody,
        parseStream: parseGoogleLine,
      }

    case "ollama":
      return {
        url: `${ollamaUrl}/v1/chat/completions`,
        headers: { "Content-Type": JSON_CONTENT_TYPE },
        buildBody: (messages) => buildOpenAiBody(messages, model),
        parseStream: parseOpenAiLine,
      }

    case "minimax":
      return {
        url: "https://api.minimax.io/v1/chat/completions",
        headers: { "Content-Type": JSON_CONTENT_TYPE, Authorization: `Bearer ${apiKey}` },
        buildBody: (messages) => ({ ...buildOpenAiBody(messages, model), temperature: 1.0 }),
        parseStream: parseOpenAiLine,
      }

    case "wps": {
      const wpsEnv = serverConfig.wpsGateway
      let wpsUrl = customEndpoint || wpsEnv.url || "http://ai-gateway.wps.cn/api/v3"
      let wpsToken = apiKey || wpsEnv.token
      let wpsUid = wpsEnv.uid
      let wpsProduct = wpsEnv.productName
      let wpsModel = model || wpsEnv.model || "azure/gpt-5.4"

      if (apiKey) {
        try {
          const extra = JSON.parse(apiKey) as {
            token?: string; url?: string; model?: string; uid?: string; productName?: string
          }
          wpsToken = extra.token ?? wpsToken
          wpsUrl = extra.url ?? wpsUrl
          wpsModel = extra.model ?? wpsModel
          wpsUid = extra.uid ?? wpsUid
          wpsProduct = extra.productName ?? wpsProduct
        } catch {
          // apiKey is a plain token
        }
      }

      const actionId = Array.from(
        { length: 16 },
        () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0"),
      ).join("")

      return {
        url: `${wpsUrl}/chat/completions`,
        headers: {
          "Content-Type": JSON_CONTENT_TYPE,
          Authorization: `Bearer ${wpsToken}`,
          "Ai-Gateway-Uid": wpsUid,
          "Ai-Gateway-Product-Name": wpsProduct,
          "X-Action-Id": actionId,
        },
        buildBody: (messages) => buildOpenAiBody(messages, wpsModel),
        parseStream: parseOpenAiLine,
      }
    }

    case "custom":
      return {
        url: `${customEndpoint}/chat/completions`,
        headers: {
          "Content-Type": JSON_CONTENT_TYPE,
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        buildBody: (messages) => buildOpenAiBody(messages, model),
        parseStream: parseOpenAiLine,
      }

    default:
      throw new Error(`Unknown provider: ${String(provider)}`)
  }
}
