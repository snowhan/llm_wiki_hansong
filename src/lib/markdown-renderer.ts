import VditorPreview from "vditor/dist/method.min"

const CDN = "/vditor"

export interface RenderOptions {
  isDark?: boolean
}

/**
 * Render markdown to HTML string (async, via Vditor/Lute).
 * Used by MarkdownView for React-managed rendering.
 */
export async function renderMarkdown(source: string, opts?: RenderOptions): Promise<string> {
  const dark = opts?.isDark ?? false
  return VditorPreview.md2html(source, {
    mode: dark ? "dark" : "light",
    cdn: CDN,
    markdown: {
      mark: true,
      footnotes: true,
      toc: false,
      sanitize: false,
    },
    hljs: {
      style: dark ? "native" : "github",
      lineNumber: false,
    },
    math: {
      engine: "KaTeX",
    },
  })
}

/**
 * Full DOM-based preview rendering (code highlight, math, etc.).
 * Used for non-streaming contexts where we want the richest output.
 */
export async function renderPreview(
  element: HTMLDivElement,
  source: string,
  opts?: RenderOptions,
): Promise<void> {
  const dark = opts?.isDark ?? false
  await VditorPreview.preview(element, source, {
    mode: dark ? "dark" : "light",
    cdn: CDN,
    markdown: {
      mark: true,
      footnotes: true,
      toc: false,
      sanitize: false,
    },
    hljs: {
      style: dark ? "native" : "github",
      lineNumber: false,
    },
    math: {
      engine: "KaTeX",
    },
  })
}
