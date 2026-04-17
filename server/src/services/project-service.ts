import fs from "node:fs/promises"
import path from "node:path"
import type { WikiProject } from "../types.js"
import { config } from "../config.js"

const REQUIRED_DIRS = ["wiki", "raw", "raw/sources"]
const PROJECT_MARKER = ".llm-wiki"

export async function createProject(name: string, parentPath?: string): Promise<WikiProject> {
  const base = parentPath || config.projectsRoot
  await fs.mkdir(base, { recursive: true })
  const projectPath = path.join(base, name)
  await fs.mkdir(projectPath, { recursive: true })

  for (const dir of REQUIRED_DIRS) {
    await fs.mkdir(path.join(projectPath, dir), { recursive: true })
  }
  await fs.mkdir(path.join(projectPath, PROJECT_MARKER), { recursive: true })

  return { name, path: projectPath }
}

export async function openProject(projectPath: string): Promise<WikiProject> {
  const stat = await fs.stat(projectPath)
  if (!stat.isDirectory()) throw new Error("Not a directory")

  for (const dir of REQUIRED_DIRS) {
    try {
      await fs.stat(path.join(projectPath, dir))
    } catch {
      await fs.mkdir(path.join(projectPath, dir), { recursive: true })
    }
  }

  try {
    await fs.stat(path.join(projectPath, PROJECT_MARKER))
  } catch {
    await fs.mkdir(path.join(projectPath, PROJECT_MARKER), { recursive: true })
  }

  const name = path.basename(projectPath)
  return { name, path: projectPath }
}

export async function listProjects(): Promise<WikiProject[]> {
  await fs.mkdir(config.projectsRoot, { recursive: true })
  const entries = await fs.readdir(config.projectsRoot, { withFileTypes: true })
  const projects: WikiProject[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue
    const full = path.join(config.projectsRoot, entry.name)
    try {
      await fs.stat(path.join(full, PROJECT_MARKER))
      projects.push({ name: entry.name, path: full })
    } catch {
      // not a wiki project
    }
  }

  return projects
}
