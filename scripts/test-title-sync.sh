#!/usr/bin/env bash
# test-title-sync.sh — Title/Content Sync + Editor Save Race Regression Suite
#
# 涵盖：
#   1. 前端 ingest title/path 对齐测试
#   2. 后端 ingest 标题同步测试（含 ensureCanonicalTitleType）
#   3. 后端一致性不变量测试（setFmField + ensureCanonicalTitleType 单元）
#   4. 写入回归测试（title 自动修正行为）
#   5. 真实回放时序回归（test6 + 抖动）
#   6. 编辑器保存竞态防护测试（loadedPathRef + clearTimeout + snapshot）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

PASS=0
FAIL=0

run_step() {
  local label="$1"
  shift
  echo ""
  echo "──────────────────────────────────────────"
  echo "  $label"
  echo "──────────────────────────────────────────"
  if "$@"; then
    echo "✓ $label — PASSED"
    PASS=$((PASS + 1))
  else
    echo "✗ $label — FAILED"
    FAIL=$((FAIL + 1))
  fi
}

echo "============================================================"
echo "  LLM Wiki — Title/Content Sync + Editor Save Race Suite"
echo "============================================================"

# ── [1] Frontend ingest title/path alignment ────────────────────────────
run_step "[1/6] Frontend ingest title/path alignment" \
  npx vitest run src/lib/__tests__/ingest-full.test.ts --reporter=verbose

# ── [2] Server ingest title/path alignment (incl. ensureCanonicalTitleType) ─
run_step "[2/6] Server ingest title/path alignment" \
  npm --prefix server test -- \
    src/services/__tests__/ingest-service-title-sync.test.ts

# ── [3] Server consistency invariants (setFmField + ensureCanonicalTitleType) ─
run_step "[3/6] Server consistency invariants (setFmField + ensureCanonicalTitleType unit tests)" \
  npm --prefix server test -- \
    src/services/__tests__/ingest-consistency.test.ts

# ── [4] Write regression (title auto-correction, no-rejection) ─────────
run_step "[4/6] Write regression (title auto-correction behavior)" \
  npm --prefix server test -- \
    src/services/__tests__/ingest-write-regression.test.ts

# ── [5] Real replay timing regression (test6 + jitter) ─────────────────
run_step "[5/6] Real replay timing regression (test6 fixtures)" \
  npm --prefix server test -- \
    src/services/__tests__/ingest-test6-real-replay.test.ts

# ── [6] Editor save race condition guard ────────────────────────────────
run_step "[6/6] Editor save race guard (loadedPathRef + clearTimeout + snapshot + writer)" \
  npx vitest run src/components/__tests__/editor-area-save.test.tsx --reporter=verbose

# ── Summary ─────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "============================================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
