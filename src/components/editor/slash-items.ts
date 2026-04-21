import type { Editor } from "@tiptap/react"

export interface SlashItem {
  id: string
  label: string
  description?: string
  icon?: string
  group: "heading" | "list" | "block" | "media" | "advanced"
  keywords?: string[]
  command: (editor: Editor) => void
}

export const SLASH_ITEMS: SlashItem[] = [
  // ── Headings ──────────────────────────────────────────────────────────
  {
    id: "h1",
    label: "标题 1",
    description: "大标题",
    icon: "H₁",
    group: "heading",
    keywords: ["h1", "heading1", "标题1", "大标题"],
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    label: "标题 2",
    description: "中标题",
    icon: "H₂",
    group: "heading",
    keywords: ["h2", "heading2", "标题2", "中标题"],
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "标题 3",
    description: "小标题",
    icon: "H₃",
    group: "heading",
    keywords: ["h3", "heading3", "标题3", "小标题"],
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },

  // ── Lists ─────────────────────────────────────────────────────────────
  {
    id: "bullet-list",
    label: "无序列表",
    description: "圆点列表",
    icon: "•",
    group: "list",
    keywords: ["ul", "bullet", "list", "无序", "列表", "圆点"],
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: "ordered-list",
    label: "有序列表",
    description: "数字编号列表",
    icon: "1.",
    group: "list",
    keywords: ["ol", "ordered", "number", "list", "有序", "编号", "列表"],
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "task-list",
    label: "待办列表",
    description: "可勾选的任务列表",
    icon: "☑",
    group: "list",
    keywords: ["todo", "task", "check", "checkbox", "待办", "任务"],
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
  },

  // ── Blocks ────────────────────────────────────────────────────────────
  {
    id: "blockquote",
    label: "引用块",
    description: "引用文本块",
    icon: '"',
    group: "block",
    keywords: ["quote", "blockquote", "引用"],
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "code-block",
    label: "代码块",
    description: "带语法高亮的代码块",
    icon: "</>",
    group: "block",
    keywords: ["code", "codeblock", "pre", "代码", "程序"],
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "horizontal-rule",
    label: "分割线",
    description: "水平分隔线",
    icon: "—",
    group: "block",
    keywords: ["hr", "divider", "separator", "分割", "分隔"],
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },

  // ── Advanced ──────────────────────────────────────────────────────────
  {
    id: "table",
    label: "表格",
    description: "插入表格",
    icon: "⊞",
    group: "advanced",
    keywords: ["table", "grid", "表格"],
    command: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "math",
    label: "数学公式",
    description: "LaTeX 行内公式",
    icon: "∑",
    group: "advanced",
    keywords: ["math", "latex", "formula", "equation", "数学", "公式"],
    command: (editor) =>
      editor.chain().focus().insertContent({ type: "inlineMath", attrs: { latex: "" } }).run(),
  },
]

const GROUP_ORDER: Record<SlashItem["group"], number> = {
  heading: 0,
  list: 1,
  block: 2,
  media: 3,
  advanced: 4,
}

export function filterSlashItems(query: string): SlashItem[] {
  const sorted = [...SLASH_ITEMS].sort(
    (a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group]
  )
  if (!query.trim()) return sorted
  const q = query.trim().toLowerCase()
  return sorted.filter((item) => {
    const text = [item.label, item.description ?? "", ...(item.keywords ?? [])].join(" ").toLowerCase()
    return text.includes(q)
  })
}
