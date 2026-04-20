import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import fallbackFixturesJson from "./fallback-fixtures.json"

export interface LlmOutputFixture {
  id: string
  sourceName: string
  llmRawOutput: string
  expectedPages?: string[]
  expectedViolations?: string[]
  tags?: string[]
  notes?: string
}

const DEFAULT_EXTERNAL_DIR = path.join(os.homedir(), ".llm-wiki-test-fixtures")

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function validateFixture(raw: unknown, sourcePath: string): LlmOutputFixture {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid fixture in ${sourcePath}: expected object`)
  }
  const fixture = raw as Record<string, unknown>
  const { id, sourceName, llmRawOutput } = fixture
  if (typeof id !== "string" || !id.trim()) {
    throw new Error(`Invalid fixture in ${sourcePath}: missing "id"`)
  }
  if (typeof sourceName !== "string" || !sourceName.trim()) {
    throw new Error(`Invalid fixture in ${sourcePath}: missing "sourceName"`)
  }
  if (typeof llmRawOutput !== "string" || !llmRawOutput.trim()) {
    throw new Error(`Invalid fixture in ${sourcePath}: missing "llmRawOutput"`)
  }
  if (fixture.expectedPages !== undefined && !isStringArray(fixture.expectedPages)) {
    throw new Error(`Invalid fixture in ${sourcePath}: "expectedPages" must be string[]`)
  }
  if (fixture.expectedViolations !== undefined && !isStringArray(fixture.expectedViolations)) {
    throw new Error(`Invalid fixture in ${sourcePath}: "expectedViolations" must be string[]`)
  }
  if (fixture.tags !== undefined && !isStringArray(fixture.tags)) {
    throw new Error(`Invalid fixture in ${sourcePath}: "tags" must be string[]`)
  }
  if (fixture.notes !== undefined && typeof fixture.notes !== "string") {
    throw new Error(`Invalid fixture in ${sourcePath}: "notes" must be string`)
  }
  return {
    id: id.trim(),
    sourceName: sourceName.trim(),
    llmRawOutput,
    ...(fixture.expectedPages ? { expectedPages: fixture.expectedPages } : {}),
    ...(fixture.expectedViolations ? { expectedViolations: fixture.expectedViolations } : {}),
    ...(fixture.tags ? { tags: fixture.tags } : {}),
    ...(typeof fixture.notes === "string" ? { notes: fixture.notes } : {}),
  }
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, "utf-8")
  return JSON.parse(raw) as unknown
}

export async function loadExternalFixtures(
  dir = process.env.LLM_WIKI_TEST_FIXTURE_DIR ?? DEFAULT_EXTERNAL_DIR,
): Promise<LlmOutputFixture[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const fixtures: LlmOutputFixture[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue
      const fullPath = path.join(dir, entry.name)
      const data = await readJsonFile(fullPath)
      if (Array.isArray(data)) {
        for (const item of data) fixtures.push(validateFixture(item, fullPath))
      } else {
        fixtures.push(validateFixture(data, fullPath))
      }
    }
    return fixtures
  } catch {
    return []
  }
}

export function loadFallbackFixtures(): LlmOutputFixture[] {
  return (fallbackFixturesJson as unknown[]).map((item, idx) =>
    validateFixture(item, `fallback-fixtures.json#${idx}`),
  )
}

export async function loadFixturesWithFallback(): Promise<{
  source: "external" | "fallback"
  fixtures: LlmOutputFixture[]
  externalDir: string
}> {
  const externalDir = process.env.LLM_WIKI_TEST_FIXTURE_DIR ?? DEFAULT_EXTERNAL_DIR
  const external = await loadExternalFixtures(externalDir)
  if (external.length > 0) {
    return { source: "external", fixtures: external, externalDir }
  }
  return { source: "fallback", fixtures: loadFallbackFixtures(), externalDir }
}

