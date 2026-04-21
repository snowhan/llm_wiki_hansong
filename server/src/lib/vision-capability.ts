/**
 * Vision capability detection for LLM providers (server-side mirror of client-side version).
 */
export function supportsVision(provider: string, model: string): boolean {
  const m = model.toLowerCase()

  switch (provider) {
    case "openai":
      return /gpt-4[o.\-]|gpt-4.*turbo|gpt-4.*vision/.test(m)
    case "anthropic":
      return /claude-3/.test(m)
    case "google":
      return /gemini-(1\.5|2\.|pro-vision)/.test(m)
    case "ollama":
      return /llava|bakllava|moondream|minicpm|vision/.test(m)
    case "wps":
      return true
    default:
      return false
  }
}
