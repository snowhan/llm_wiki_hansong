import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { Highlight } from "@tiptap/extension-highlight"
import { Image } from "@tiptap/extension-image"
import { Link } from "@tiptap/extension-link"
import { Mathematics } from "@tiptap/extension-mathematics"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { TableKit } from "@tiptap/extension-table"
import { TableOfContents } from "@tiptap/extension-table-of-contents"
import { TaskItem } from "@tiptap/extension-list/task-item"
import { TaskList } from "@tiptap/extension-list/task-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { UniqueID } from "@tiptap/extension-unique-id"
import { Markdown } from "@tiptap/markdown"
import type { Extensions } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { common, createLowlight } from "lowlight"
import { SlashCommandsExtension } from "./slash-extension"

const lowlight = createLowlight(common)

lowlight.registerAlias({
  javascript: "js",
  typescript: "ts",
  shell: ["bash", "sh"],
  xml: ["html", "htm"],
})

export { lowlight }

export type GetEditorExtensionsOptions = {
  /**
   * When true, UniqueID does not mutate the document (read-only viewers).
   * @default false
   */
  readonly?: boolean
}

let cachedEdit: Extensions | null = null
let cachedReadonly: Extensions | null = null

function buildExtensions(options: GetEditorExtensionsOptions = {}): Extensions {
  const readonly = options.readonly ?? false

  return [
    StarterKit.configure({
      codeBlock: false,
      link: false,
    }),
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: "plaintext",
    }),
    Image.configure({ allowBase64: true }),
    TableKit.configure({
      table: { resizable: true },
    }),
    Highlight.configure({ multicolor: true }),
    Mathematics.configure({
      katexOptions: {
        throwOnError: false,
        output: "html",
      },
    }),
    Link.configure({
      autolink: true,
      openOnClick: false,
      // Allow wiki: internal-link scheme without touching linkifyjs global registration
      // (avoids "already initialized" warning from registerCustomProtocol in onCreate).
      isAllowedUri: (url, ctx) => /^wiki:/i.test(url) || ctx.defaultValidate(url),
    }),
    Subscript,
    Superscript,
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    UniqueID.configure({
      types: ["heading", "paragraph", "blockquote", "codeBlock"],
      updateDocument: !readonly,
    }),
    TableOfContents,
    Markdown,
    SlashCommandsExtension,
  ]
}

/**
 * TipTap extensions aligned with PandaWiki-style setup: StarterKit (no default code block),
 * lowlight code blocks, tables (resizable), math, markdown serialization, etc.
 */
export function getEditorExtensions(options?: GetEditorExtensionsOptions): Extensions {
  const readonly = options?.readonly ?? false
  if (readonly) {
    if (!cachedReadonly) cachedReadonly = buildExtensions({ readonly: true })
    return cachedReadonly
  }
  if (!cachedEdit) cachedEdit = buildExtensions({ readonly: false })
  return cachedEdit
}
