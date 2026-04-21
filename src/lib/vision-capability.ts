/**
 * Vision capability detection for LLM providers.
 * Returns true if the given provider + model combination is known to support
 * multimodal (image) input.
 *
 * This is a heuristic based on well-known model names. For unknown models,
 * the caller should attempt the request and handle 400/unsupported errors.
 */
export function supportsVision(provider: string, model: string): boolean {
  const m = model.toLowerCase()

  switch (provider) {
    case "openai":
      // gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4-vision-preview, gpt-4.1, gpt-4.5, etc.
      return /gpt-4[o.\-]|gpt-4.*turbo|gpt-4.*vision/.test(m)

    case "anthropic":
      // All claude-3-* and claude-3.x-* models support vision
      return /claude-3/.test(m)

    case "google":
      // gemini-1.5-*, gemini-2.*, gemini-pro-vision
      return /gemini-(1\.5|2\.|pro-vision)/.test(m)

    case "ollama":
      // Known vision-capable Ollama models
      return /llava|bakllava|moondream|minicpm|vision/.test(m)

    case "wps":
      // WPS gateway routes to vision-capable models; treat as supported
      return true

    default:
      return false
  }
}
