import fs from "node:fs/promises"
import fss from "node:fs"
import path from "node:path"
import type { FileNode } from "../types.js"

const MAX_DEPTH = 30

export async function readFileContent(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8")
}

export async function writeFileContent(filePath: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, contents, "utf-8")
}

export async function listDirectoryTree(dirPath: string, depth = 0): Promise<FileNode[]> {
  if (depth > MAX_DEPTH) return []
  let entries: fss.Dirent[]
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  const nodes: FileNode[] = []
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    const fullPath = path.join(dirPath, entry.name)
    const isDir = entry.isDirectory()
    const node: FileNode = { name: entry.name, path: fullPath, is_dir: isDir }
    if (isDir) {
      node.children = await listDirectoryTree(fullPath, depth + 1)
    }
    nodes.push(node)
  }
  return nodes
}

export async function copyFile(source: string, destination: string): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.copyFile(source, destination)
}

export async function copyDirectory(source: string, destination: string): Promise<string[]> {
  await fs.mkdir(destination, { recursive: true })
  const copiedFiles: string[] = []

  async function walk(src: string, dest: string) {
    const entries = await fs.readdir(src, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true })
        await walk(srcPath, destPath)
      } else {
        await fs.copyFile(srcPath, destPath)
        copiedFiles.push(destPath)
      }
    }
  }

  await walk(source, destination)
  return copiedFiles
}

export async function deleteFileOrDir(filePath: string): Promise<void> {
  const stat = await fs.stat(filePath)
  if (stat.isDirectory()) {
    await fs.rm(filePath, { recursive: true, force: true })
  } else {
    await fs.unlink(filePath)
  }
}

export async function createDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

export async function findRelatedWikiPages(
  projectPath: string,
  sourceName: string,
): Promise<string[]> {
  const wikiDir = path.join(projectPath, "wiki")
  const results: string[] = []

  async function walk(dir: string) {
    let entries: fss.Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.name.endsWith(".md")) {
        try {
          const content = await fs.readFile(full, "utf-8")
          if (content.includes(sourceName)) {
            results.push(full)
          }
        } catch { /* skip */ }
      }
    }
  }

  await walk(wikiDir)
  return results
}

export async function browsePath(dirPath: string): Promise<{ dirs: string[]; files: string[] }> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const dirs: string[] = []
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    const full = path.join(dirPath, entry.name)
    if (entry.isDirectory()) dirs.push(full)
    else files.push(full)
  }
  dirs.sort()
  files.sort()
  return { dirs, files }
}
