import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { WikiProject } from "../types.js"
import { config } from "../config.js"
import { getState, setState } from "./state-service.js"

const REQUIRED_DIRS = ["wiki", "raw", "raw/sources"]
const PROJECT_MARKER = ".llm-wiki"
const REGISTRY_KEY = "projectRegistry"

/**
 * Throw if `targetPath` is not strictly inside `config.projectsRoot`.
 * Normalizes both paths to prevent traversal attacks (e.g. `../outside`).
 */
function assertInsideProjectsRoot(targetPath: string): void {
  const root = path.normalize(config.projectsRoot)
  const normalized = path.normalize(targetPath)
  // Must start with "<root>/" — reject the root itself and any path outside it
  if (!normalized.startsWith(root + path.sep)) {
    throw new Error(
      `Project path must be inside PROJECTS_ROOT (${root}). Got: ${normalized}`,
    )
  }
}

// ── Project registry ──────────────────────────────────────────────────────

interface RegistryEntry {
  name: string
  absolutePath: string
}

async function loadRegistry(): Promise<Record<string, RegistryEntry>> {
  const raw = await getState(REGISTRY_KEY)
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, RegistryEntry>
  }
  return {}
}

async function saveRegistry(registry: Record<string, RegistryEntry>): Promise<void> {
  await setState(REGISTRY_KEY, registry)
}

/**
 * Find an existing registry entry by absolute path, or create a new one.
 * Returns the project ID.
 */
async function getOrCreateId(name: string, absolutePath: string): Promise<string> {
  const registry = await loadRegistry()
  const normalized = path.normalize(absolutePath)

  // Check if this path is already registered
  const existing = Object.entries(registry).find(
    ([, entry]) => path.normalize(entry.absolutePath) === normalized,
  )
  if (existing) {
    // Update name in case it changed
    if (existing[1].name !== name) {
      registry[existing[0]] = { ...existing[1], name }
      await saveRegistry(registry)
    }
    return existing[0]
  }

  // Create new entry
  const id = randomUUID()
  registry[id] = { name, absolutePath: normalized }
  await saveRegistry(registry)
  return id
}

// ── Public API ────────────────────────────────────────────────────────────

export async function getProjectRoot(projectId: string): Promise<string> {
  const registry = await loadRegistry()
  const entry = registry[projectId]
  if (!entry) throw new Error(`Project not found: ${projectId}`)
  return entry.absolutePath
}

export async function createProject(name: string, parentPath?: string): Promise<WikiProject> {
  const base = parentPath ?? config.projectsRoot
  // When caller provides an explicit parentPath, ensure it is inside projectsRoot
  if (parentPath !== undefined) {
    assertInsideProjectsRoot(path.join(base, name))
  }
  await fs.mkdir(base, { recursive: true })
  const projectPath = path.join(base, name)
  await fs.mkdir(projectPath, { recursive: true })

  for (const dir of REQUIRED_DIRS) {
    await fs.mkdir(path.join(projectPath, dir), { recursive: true })
  }
  await fs.mkdir(path.join(projectPath, PROJECT_MARKER), { recursive: true })

  const id = await getOrCreateId(name, projectPath)
  return { id, name }
}

export async function openProject(projectPath: string): Promise<WikiProject> {
  assertInsideProjectsRoot(projectPath)
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
  const id = await getOrCreateId(name, projectPath)
  return { id, name }
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
      const id = await getOrCreateId(entry.name, full)
      projects.push({ id, name: entry.name })
    } catch {
      // not a wiki project
    }
  }

  return projects
}

export async function deleteProjectFromRegistry(projectId: string): Promise<void> {
  const registry = await loadRegistry()
  delete registry[projectId]
  await saveRegistry(registry)
}

export async function getRegistryEntries(): Promise<Array<{ id: string } & RegistryEntry>> {
  const registry = await loadRegistry()
  return Object.entries(registry).map(([id, entry]) => ({ id, ...entry }))
}
