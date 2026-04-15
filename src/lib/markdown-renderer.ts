import MarkdownIt from "markdown-it"
import { full as emoji } from "markdown-it-emoji"
import sub from "markdown-it-sub"
import sup from "markdown-it-sup"
import ins from "markdown-it-ins"
import mark from "markdown-it-mark"
import footnote from "markdown-it-footnote"
import deflist from "markdown-it-deflist"
import abbr from "markdown-it-abbr"
import taskLists from "markdown-it-task-lists"
import multimdTable from "markdown-it-multimd-table"
import katex from "@traptitech/markdown-it-katex"
import hljs from "highlight.js"

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(str: string, lang: string): string {
    let highlighted: string
    if (lang && hljs.getLanguage(lang)) {
      try {
        highlighted = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
      } catch {
        highlighted = md.utils.escapeHtml(str)
      }
    } else {
      highlighted = md.utils.escapeHtml(str)
    }
    return `<pre class="hljs-pre"><code class="hljs" lang="${md.utils.escapeHtml(lang)}">${highlighted}</code></pre>`
  },
})

md.use(multimdTable, { multiline: true, rowspan: true, headerless: true })
  .use(emoji)
  .use(sub)
  .use(sup)
  .use(ins)
  .use(mark)
  .use(footnote)
  .use(deflist)
  .use(abbr)
  .use(taskLists, { enabled: true })
  .use(katex, { throwOnError: false })

md.linkify.set({ fuzzyLink: false, fuzzyEmail: true })

export function renderMarkdown(source: string): string {
  return md.render(source)
}

export { md }
