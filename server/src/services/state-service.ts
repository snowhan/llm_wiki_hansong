import fs from "node:fs/promises"
import path from "node:path"
import { config } from "../config.js"

let cache: Record<string, unknown> | null = null

async function ensureDir() {
  await fs.mkdir(path.dirname(config.appStatePath), { recursive: true })
}

async function load(): Promise<Record<string, unknown>> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(config.appStatePath, "utf-8")
    cache = JSON.parse(raw) as Record<string, unknown>
  } catch {
    cache = {}
  }
  return cache
}

async function save() {
  await ensureDir()
  await fs.writeFile(config.appStatePath, JSON.stringify(cache, null, 2), "utf-8")
}

export async function getState(key: string): Promise<unknown> {
  const state = await load()
  return state[key] ?? null
}

export async function setState(key: string, value: unknown): Promise<void> {
  const state = await load()
  state[key] = value
  await save()
}
