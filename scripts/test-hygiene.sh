#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

OUT_FILE="${PROJECT_DIR}/.tmp-test-hygiene.log"
rm -f "$OUT_FILE"

echo "============================================"
echo "  LLM Wiki — Test Hygiene"
echo "============================================"
echo ""

echo "[1/2] Running critical suites and capturing output..."
npx vitest run \
  src/components/sources/__tests__/sources-view-status-sync.test.tsx \
  src/components/sources/__tests__/sources-view-server-truth.test.tsx \
  src/commands/__tests__/ingest-sse-full.test.ts \
  >"$OUT_FILE" 2>&1

echo "[2/2] Scanning output for warning signatures..."
node -e "
  const fs = require('node:fs');
  const content = fs.readFileSync(process.argv[1], 'utf8');
  const patterns = [
    /not wrapped in act/i,
    /Encountered two children with the same key/i,
    /Invalid prop/i,
    /Warning:/i,
  ];
  const lines = content.split(/\\r?\\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    for (const p of patterns) {
      if (p.test(lines[i])) {
        hits.push({ line: i + 1, text: lines[i] });
        break;
      }
    }
  }
  if (hits.length > 0) {
    console.log('Found warning signatures in test output:');
    for (const h of hits.slice(0, 100)) {
      console.log(h.line + ':' + h.text);
    }
    process.exit(1);
  }
" "$OUT_FILE"

rm -f "$OUT_FILE"
echo ""
echo "Test hygiene check completed successfully."
