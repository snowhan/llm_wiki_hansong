import type { WikiState } from "@/stores/wiki-store"

export interface Command {
  id: string
  label: string
  description?: string
  group: "navigate" | "theme" | "action" | "file"
  keywords?: string[]
  action: () => void
}

type StoreSlice = Pick<
  WikiState,
  "setActiveView" | "setColorScheme" | "openTabs" | "navigateInCurrentTab"
>

export function buildCommands(store: StoreSlice): Command[] {
  return [
    // ── Navigate ─────────────────────────────────────────────────────────
    {
      id: "nav-wiki",
      label: "打开 Wiki",
      description: "切换到 Wiki 编辑视图",
      group: "navigate",
      keywords: ["wiki", "editor", "编辑", "文档"],
      action: () => store.setActiveView("wiki"),
    },
    {
      id: "nav-sources",
      label: "打开文件源",
      description: "切换到文件源管理视图",
      group: "navigate",
      keywords: ["sources", "files", "文件", "来源"],
      action: () => store.setActiveView("sources"),
    },
    {
      id: "nav-search",
      label: "打开搜索",
      description: "全文语义搜索",
      group: "navigate",
      keywords: ["search", "find", "搜索", "查找"],
      action: () => store.setActiveView("search"),
    },
    {
      id: "nav-graph",
      label: "打开知识图谱",
      description: "可视化知识关系图",
      group: "navigate",
      keywords: ["graph", "network", "图谱", "关系"],
      action: () => store.setActiveView("graph"),
    },
    {
      id: "nav-settings",
      label: "打开设置",
      description: "应用配置与 LLM 设置",
      group: "navigate",
      keywords: ["settings", "config", "设置", "配置"],
      action: () => store.setActiveView("settings"),
    },

    // ── Theme ────────────────────────────────────────────────────────────
    {
      id: "theme-light",
      label: "浅色主题",
      description: "切换到浅色模式",
      group: "theme",
      keywords: ["light", "white", "浅色", "白天"],
      action: () => store.setColorScheme("light"),
    },
    {
      id: "theme-dark",
      label: "深色主题",
      description: "切换到深色模式",
      group: "theme",
      keywords: ["dark", "night", "深色", "夜间"],
      action: () => store.setColorScheme("dark"),
    },
    {
      id: "theme-system",
      label: "跟随系统主题",
      description: "自动跟随操作系统深/浅色设置",
      group: "theme",
      keywords: ["system", "auto", "系统", "自动"],
      action: () => store.setColorScheme("system"),
    },
  ]
}

/** Fuzzy match: returns true if every char of `query` appears in order in `target` (case-insensitive). */
export function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  return qi === q.length
}

export function filterCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) return commands
  const q = query.trim().toLowerCase()
  return commands.filter((cmd) => {
    const searchText = [cmd.label, cmd.description ?? "", ...(cmd.keywords ?? [])].join(" ")
    return fuzzyMatch(q, searchText)
  })
}
