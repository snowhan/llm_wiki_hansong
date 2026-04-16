import { generateHTML } from "@tiptap/html"
import { MarkdownManager } from "@tiptap/markdown"
import { getEditorExtensions } from "@/components/editor/editor-extensions"

export interface RenderOptions {
  isDark?: boolean
}

/**
 * Render markdown to an HTML string using the same TipTap extensions as the editor.
 */
export function renderMarkdownToHtml(markdown: string): string {
  const extensions = getEditorExtensions({ readonly: true })
  const manager = new MarkdownManager({ extensions })
  const doc = manager.parse(markdown.length ? markdown : "\n")
  return generateHTML(doc, extensions)
}

/**
 * @deprecated Prefer `renderMarkdownToHtml` (sync). Kept for callers expecting async + options.
 */
export async function renderMarkdown(
  source: string,
  _opts?: RenderOptions,
): Promise<string> {
  return renderMarkdownToHtml(source)
}

/**
 * Render markdown into a DOM element (replaces innerHTML).
 */
export async function renderPreview(
  element: HTMLDivElement,
  source: string,
  _opts?: RenderOptions,
): Promise<void> {
  element.innerHTML = renderMarkdownToHtml(source)
}
