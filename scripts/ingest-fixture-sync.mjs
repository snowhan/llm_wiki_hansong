#!/usr/bin/env node
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const workspaceRoot = process.cwd()
const defaultExternalDir = path.join(os.homedir(), ".llm-wiki-test-fixtures")
const defaultAppStatePath = path.join(os.homedir(), ".llm-wiki", "app-state.json")
const fallbackFixturePath = path.join(
  workspaceRoot,
  "server",
  "src",
  "services",
  "__tests__",
  "fixtures",
  "fallback-fixtures.json",
)

function parseArgValue(flag, fallback) {
  const match = process.argv.find((arg) => arg.startsWith(`${flag}=`))
  if (!match) return fallback
  return match.slice(flag.length + 1)
}

function hasFlag(flag) {
  return process.argv.includes(flag)
}

function sanitizeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
}

function inferSourceName(messages) {
  if (!Array.isArray(messages)) return "unknown-source"
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue
    const content = typeof msg.content === "string" ? msg.content : ""
    const match = content.match(/\*\*File:\*\*\s*([^\n]+)/)
    if (match) return match[1].trim()
    const match2 = content.match(/Source Just Ingested:\s*([^\n]+)/i)
    if (match2) return match2[1].trim()
  }
  return "unknown-source"
}

function toFixture(log, idx) {
  const output = typeof log.output === "string" ? log.output : ""
  const sourceName = inferSourceName(log.messages)
  const timestamp = Number.isFinite(log.timestamp) ? log.timestamp : Date.now()
  const id = `log-${timestamp}-${idx}`
  return {
    id,
    sourceName,
    llmRawOutput: output,
    expectedPages: [],
    expectedViolations: [],
    tags: ["captured-from-llm-debug", "ingest"],
    notes: "Captured from app-state llmDebugLogs via scripts/ingest-fixture-sync.mjs",
  }
}

async function main() {
  const externalDir = parseArgValue("--dir", process.env.LLM_WIKI_TEST_FIXTURE_DIR ?? defaultExternalDir)
  const appStatePath = parseArgValue("--state", process.env.APP_STATE_PATH ?? defaultAppStatePath)
  const seedOnly = hasFlag("--seed-fallback-only")
  const includeSeed = hasFlag("--seed-fallback")

  await fs.mkdir(externalDir, { recursive: true })

  if (includeSeed || seedOnly) {
    const fallbackRaw = await fs.readFile(fallbackFixturePath, "utf-8")
    const seedPath = path.join(externalDir, "seed-fallback-fixtures.json")
    await fs.writeFile(seedPath, fallbackRaw, "utf-8")
    console.log(`[fixture-sync] seeded fallback fixtures -> ${seedPath}`)
  }

  if (seedOnly) return

  let appState
  try {
    appState = JSON.parse(await fs.readFile(appStatePath, "utf-8"))
  } catch (err) {
    console.error(`[fixture-sync] failed to read app state: ${appStatePath}`)
    console.error(String(err))
    process.exitCode = 1
    return
  }

  const logs = Array.isArray(appState?.llmDebugLogs) ? appState.llmDebugLogs : []
  const ingestLogs = logs.filter(
    (log) =>
      log &&
      log.source === "ingest" &&
      typeof log.output === "string" &&
      log.output.includes("---FILE:"),
  )

  if (ingestLogs.length === 0) {
    console.log("[fixture-sync] no ingest logs with FILE blocks found")
    return
  }

  let written = 0
  for (let i = 0; i < ingestLogs.length; i++) {
    const fixture = toFixture(ingestLogs[i], i)
    const fileName = `${sanitizeName(fixture.id)}-${sanitizeName(fixture.sourceName)}.json`
    const fullPath = path.join(externalDir, fileName)
    await fs.writeFile(fullPath, JSON.stringify(fixture, null, 2), "utf-8")
    written += 1
  }
  console.log(`[fixture-sync] wrote ${written} fixture file(s) into ${externalDir}`)
}

main().catch((err) => {
  console.error("[fixture-sync] fatal error:", err)
  process.exitCode = 1
})

