import fs from "node:fs/promises"
import path from "node:path"
import { JSDOM } from "jsdom"
import { Readability } from "@mozilla/readability"
import TurndownService from "turndown"

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
})

export interface ClipResult {
  filePath: string
  title: string
}

export async function clipUrl(url: string, projectPath: string): Promise<ClipResult> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()

  if (!article) {
    throw new Error("Failed to extract readable content from the URL")
  }

  const markdown = turndown.turndown(article.content)
  const title = article.title || new URL(url).hostname
  const safeTitle = title.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80)
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const fileName = `${safeTitle}_${timestamp}.md`

  const destDir = path.join(projectPath, "raw", "sources")
  await fs.mkdir(destDir, { recursive: true })
  const filePath = path.join(destDir, fileName)

  const frontmatter = [
    "---",
    `title: "${title}"`,
    `source: "${url}"`,
    `clipped_at: "${new Date().toISOString()}"`,
    "---",
    "",
  ].join("\n")

  await fs.writeFile(filePath, frontmatter + markdown, "utf-8")

  return { filePath, title }
}
