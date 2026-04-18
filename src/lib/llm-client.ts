export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onDone: () => void
  onError: (error: Error) => void
}

const DECODER = new TextDecoder()

function parseLines(chunk: Uint8Array, buffer: string): [string[], string] {
  const text = buffer + DECODER.decode(chunk, { stream: true })
  const lines = text.split("\n")
  const remaining = lines.pop() ?? ""
  return [lines, remaining]
}

/**
 * Stream a chat completion via the server-side LLM proxy.
 * The server reads the LLM configuration from its own state.
 * No API keys or provider URLs are sent from the frontend.
 */
export async function streamChat(
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const { onToken, onDone, onError } = callbacks

  const timeoutMs = 15 * 60 * 1000
  let combinedSignal = signal
  let timeoutController: AbortController | undefined

  if (typeof AbortSignal.timeout === "function") {
    timeoutController = new AbortController()
    const timeoutId = setTimeout(() => timeoutController?.abort(), timeoutMs)

    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(timeoutId)
        timeoutController?.abort()
      })
    }
    combinedSignal = timeoutController.signal
  }

  const { getStoredToken } = await import("@/lib/auth")
  const token = getStoredToken()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch("/api/llm/stream", {
      method: "POST",
      headers,
      body: JSON.stringify({ messages }),
      signal: combinedSignal,
    })
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.message === "Load failed")) {
      if (signal?.aborted) {
        onDone()
        return
      }
      onError(new Error("Request timed out or network error. The model may need more time — try again or use a faster model."))
      return
    }
    onError(err instanceof Error ? err : new Error(String(err)))
    return
  }

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}: ${response.statusText}`
    try {
      const body = await response.text()
      if (body) errorDetail += ` — ${body}`
    } catch {
      // ignore body read failure
    }
    onError(new Error(errorDetail))
    return
  }

  if (!response.body) {
    onError(new Error("Response body is null"))
    return
  }

  const reader = response.body.getReader()
  let lineBuffer = ""

  // The server proxies the raw SSE stream, so we need to parse it here
  // using the stored provider's parseStream function
  // But since the server now handles the provider config, we receive
  // the raw provider stream. We need to parse it generically.
  // For now, we'll just extract text from SSE data lines using OpenAI format
  // as the most common pattern. The server can add a content-type header hint.

  function parseServerSentLine(line: string): string | null {
    if (!line.startsWith("data: ")) return null
    const data = line.slice(6).trim()
    if (data === "[DONE]") return null
    try {
      // Try OpenAI/compatible format
      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta: { content?: string } }>
        candidates?: Array<{ content: { parts: Array<{ text?: string }> } }>
        type?: string
        delta?: { type: string; text?: string }
      }
      // OpenAI/Ollama/Minimax/WPS/Custom
      if (parsed.choices?.[0]?.delta?.content !== undefined) {
        return parsed.choices[0].delta.content ?? null
      }
      // Google
      if (parsed.candidates?.[0]?.content?.parts?.[0]?.text !== undefined) {
        return parsed.candidates[0].content.parts[0].text ?? null
      }
      // Anthropic
      if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
        return parsed.delta.text ?? null
      }
      return null
    } catch {
      return null
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        if (lineBuffer.trim()) {
          const token = parseServerSentLine(lineBuffer.trim())
          if (token !== null) onToken(token)
        }
        break
      }

      const [lines, remaining] = parseLines(value, lineBuffer)
      lineBuffer = remaining

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const token = parseServerSentLine(trimmed)
        if (token !== null) onToken(token)
      }
    }

    onDone()
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || signal?.aborted)) {
      onDone()
      return
    }
    if (err instanceof Error && err.message === "Load failed") {
      onError(new Error("Connection lost during streaming. Try again."))
      return
    }
    onError(err instanceof Error ? err : new Error(String(err)))
  } finally {
    reader.releaseLock()
  }
}
