import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import Vditor from "vditor"
import "vditor/dist/index.css"
import { useIsDark } from "@/hooks/use-is-dark"

interface WikiEditorProps {
  content: string
  onSave: (markdown: string) => void
}

const TOOLBAR: (string | { name: string })[] = [
  "headings", "bold", "italic", "strike", "|",
  "line", "quote", "list", "ordered-list", "check", "|",
  "code", "inline-code", "table", "link", "|",
  "undo", "redo", "|",
  "outline", "edit-mode", "fullscreen",
]

export function WikiEditor({ content, onSave }: WikiEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const vditorRef = useRef<Vditor | null>(null)
  const destroyedRef = useRef(false)
  const isDark = useIsDark()
  const { i18n } = useTranslation()

  useEffect(() => {
    if (!containerRef.current) return
    destroyedRef.current = false

    const vd = new Vditor(containerRef.current, {
      mode: "ir",
      value: content,
      cdn: "/vditor",
      theme: isDark ? "dark" : "classic",
      lang: i18n.language?.startsWith("zh") ? "zh_CN" : "en_US",
      minHeight: 300,
      toolbar: TOOLBAR,
      toolbarConfig: { pin: true },
      cache: { enable: false },
      input: (val) => onSave(val),
      preview: {
        theme: { current: isDark ? "dark" : "light", path: "/vditor/dist/css/content-theme" },
        hljs: { style: isDark ? "native" : "github", lineNumber: false },
        math: { engine: "KaTeX" },
        markdown: {
          mark: true,
          footnotes: true,
          toc: false,
        },
      },
      outline: { enable: false, position: "right" },
      after: () => {
        if (destroyedRef.current) {
          vd.destroy()
          return
        }
        vditorRef.current = vd
      },
    })

    return () => {
      destroyedRef.current = true
      if (vditorRef.current) {
        vditorRef.current.destroy()
        vditorRef.current = null
      }
    }
    // content changes via key prop remount; isDark/lang handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    vditorRef.current?.setTheme(
      isDark ? "dark" : "classic",
      isDark ? "dark" : "light",
      isDark ? "native" : "github",
    )
  }, [isDark])

  return <div ref={containerRef} className="vditor-editor-wrap h-full" />
}
