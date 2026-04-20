#!/usr/bin/env node
/**
 * debug-ingest-compare.mjs
 *
 * 对比 LLM ingest 的输出（来自 LLM 调试日志）与磁盘上实际写入的 .md 文件。
 *
 * 用法：
 *   node scripts/debug-ingest-compare.mjs [project-path]
 *
 * 例如：
 *   node scripts/debug-ingest-compare.mjs /Users/hansong/wiki/test6
 *
 * 输出：
 *   - 每个 FILE 块的路径、LLM 内容长度、磁盘文件长度、是否匹配
 *   - 如有差异，显示前 300 字符的对比
 */

import fs from "node:fs/promises"
import path from "node:path"

const SERVER_URL = "http://localhost:3001"
const PROJECT_PATH = process.argv[2] ?? "/Users/hansong/wiki/test6"

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function parseFileBlocks(text) {
  const results = []
  const lines = text.split("\n")
  let currentPath = null
  const currentLines = []

  const flush = () => {
    if (currentPath !== null) {
      results.push({ path: currentPath, content: currentLines.join("\n") })
      currentLines.length = 0
      currentPath = null
    }
  }

  for (const line of lines) {
    const startMatch = line.match(/^---FILE:\s*(.+?)\s*---$/)
    if (startMatch) {
      flush()
      currentPath = startMatch[1]
    } else if (line === "---END FILE---") {
      flush()
    } else if (currentPath !== null) {
      currentLines.push(line)
    }
  }
  flush()
  return results
}

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, "utf-8")
  } catch {
    return null
  }
}

function colorize(code, text) {
  return `\x1b[${code}m${text}\x1b[0m`
}
const green = (t) => colorize("32", t)
const red = (t) => colorize("31", t)
const yellow = (t) => colorize("33", t)
const cyan = (t) => colorize("36", t)
const bold = (t) => colorize("1", t)
const dim = (t) => colorize("2", t)

// ── 主逻辑 ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(bold("\n=== LLM Ingest 输出 vs. 磁盘文件 对比工具 ===\n"))
  console.log(`项目路径: ${cyan(PROJECT_PATH)}`)
  console.log(`服务器:   ${cyan(SERVER_URL)}\n`)

  // 1. 获取 LLM 调试日志
  let logs
  try {
    const resp = await fetch(`${SERVER_URL}/api/llm/debug/logs`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    logs = await resp.json()
  } catch (err) {
    console.error(red(`❌ 无法获取 LLM 调试日志: ${err.message}`))
    console.error(dim("   请确认服务器正在运行: npm run dev:server"))
    process.exit(1)
  }

  if (!logs.length) {
    console.log(yellow("⚠️  LLM 调试日志为空，请先触发 ingest"))
    process.exit(0)
  }

  // 2. 筛选 ingest generation 日志（有 FILE 块的）
  const generationLogs = logs.filter((log) => {
    const blocks = parseFileBlocks(log.output || "")
    return blocks.length > 0
  })

  if (!generationLogs.length) {
    console.log(yellow("⚠️  未找到含 FILE 块的 LLM 日志，请确认已完成 ingest"))
    process.exit(0)
  }

  console.log(`找到 ${bold(String(generationLogs.length))} 条含 FILE 块的生成日志\n`)

  let totalBlocks = 0
  let matchCount = 0
  let mismatchCount = 0
  let missingCount = 0
  let emptyLlmCount = 0

  // 3. 对每条日志，逐个 FILE 块对比
  for (const log of generationLogs) {
    const ts = new Date(log.timestamp).toLocaleTimeString("zh-CN")
    const source = log.source || "unknown"
    console.log(bold(`──────────────────────────────────────────────────`))
    console.log(bold(`📋 日志: [${ts}] ${source} | ${log.provider}/${log.model}`))
    console.log(`   状态: ${log.status === "done" ? green("done") : red(log.status)}  耗时: ${log.durationMs}ms`)
    console.log()

    const blocks = parseFileBlocks(log.output || "")
    console.log(`   共有 ${blocks.length} 个 FILE 块:\n`)

    for (const block of blocks) {
      totalBlocks++
      const relPath = block.path
      const llmContent = block.content
      const absPath = path.join(PROJECT_PATH, relPath)
      const diskContent = await readFileSafe(absPath)

      const llmLen = llmContent.length
      const llmTrimLen = llmContent.trim().length
      const diskLen = diskContent === null ? null : diskContent.length

      let status
      let detail = ""

      if (llmTrimLen === 0) {
        // LLM 输出本身为空
        emptyLlmCount++
        status = yellow("⚠️  LLM输出空内容")
      } else if (diskContent === null) {
        // 文件不存在
        missingCount++
        status = red("❌ 文件不存在")
      } else if (diskContent === "") {
        // 文件存在但为 0 字节
        mismatchCount++
        status = red("❌ 文件为空(0字节)")
        detail = `   LLM 前80字符: ${dim(JSON.stringify(llmContent.slice(0, 80)))}`
      } else if (diskContent === llmContent || diskContent.trim() === llmContent.trim()) {
        // 完全匹配
        matchCount++
        status = green("✅ 内容一致")
      } else {
        // 内容不同
        mismatchCount++
        status = red("❌ 内容不一致")
        const llmHead = llmContent.slice(0, 150).replace(/\n/g, "↵")
        const diskHead = diskContent.slice(0, 150).replace(/\n/g, "↵")
        detail = [
          `   LLM  (${llmLen}字节): ${dim(llmHead)}`,
          `   磁盘 (${diskLen}字节): ${dim(diskHead)}`,
        ].join("\n")
      }

      const pathShort = relPath.length > 60 ? "..." + relPath.slice(-57) : relPath
      console.log(`   ${status}  ${cyan(pathShort)}  [LLM:${llmLen}B disk:${diskLen ?? "N/A"}B]`)
      if (detail) console.log(detail)
    }
    console.log()
  }

  // 4. 汇总
  console.log(bold("══════════════════════════════════════════════════"))
  console.log(bold("📊 汇总报告"))
  console.log(`   总 FILE 块数:   ${bold(String(totalBlocks))}`)
  console.log(`   ✅ 内容一致:    ${green(String(matchCount))}`)
  console.log(`   ❌ 内容不一致:  ${mismatchCount > 0 ? red(String(mismatchCount)) : String(mismatchCount)}`)
  console.log(`   ❌ 文件缺失:    ${missingCount > 0 ? red(String(missingCount)) : String(missingCount)}`)
  console.log(`   ⚠️  LLM输出为空: ${emptyLlmCount > 0 ? yellow(String(emptyLlmCount)) : String(emptyLlmCount)}`)
  console.log()

  if (mismatchCount > 0 || missingCount > 0) {
    console.log(red(bold("🔴 发现问题！请按上方日志定位差异。")))
  } else if (emptyLlmCount > 0) {
    console.log(yellow("🟡 LLM 本身输出了空内容（writeSingleBlock 会跳过这些），可查看对应日志。"))
  } else {
    console.log(green(bold("🟢 所有 FILE 块内容与磁盘文件完全一致！")))
  }
  console.log()
}

main().catch((err) => {
  console.error(red(`未捕获错误: ${err.message}`))
  process.exit(1)
})
