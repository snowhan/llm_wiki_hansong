import { useEditor, type UseEditorOptions } from "@tiptap/react"
import { useEffect, useMemo, useRef } from "react"
import type { TableOfContentData } from "@tiptap/extension-table-of-contents"
import { getEditorExtensions } from "./editor-extensions"

export type UseTiptapOptions = {
  content: string
  editable?: boolean
  onUpdate?: (markdown: string) => void
  onTocUpdate?: (toc: TableOfContentData) => void
} & Omit<
  Partial<UseEditorOptions>,
  "extensions" | "content" | "onUpdate" | "editable" | "onCreate"
>

export function useTiptap(options: UseTiptapOptions) {
  const {
    content,
    editable = true,
    onUpdate,
    onTocUpdate,
    editorProps,
    ...rest
  } = options

  const extensions = useMemo(
    () => getEditorExtensions({ readonly: !editable }),
    [editable],
  )

  const lastExternalContent = useRef<string | undefined>(undefined)

  const editor = useEditor(
    {
      ...rest,
      extensions,
      content,
      contentType: "markdown",
      editable,
      shouldRerenderOnTransaction: true,
      editorProps: {
        attributes: {
          class: "tiptap",
        },
        ...editorProps,
      },
      onCreate: ({ editor: ed }) => {
        onTocUpdate?.(ed.storage.tableOfContents?.content ?? [])
      },
      onUpdate: ({ editor: ed }) => {
        onUpdate?.(ed.getMarkdown())
        onTocUpdate?.(ed.storage.tableOfContents?.content ?? [])
      },
    },
    [extensions],
  )

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const next = content ?? ""
    if (lastExternalContent.current === next) return
    lastExternalContent.current = next
    editor.commands.setContent(next, {
      contentType: "markdown",
      emitUpdate: false,
    })
  }, [content, editor])

  return { editor }
}
