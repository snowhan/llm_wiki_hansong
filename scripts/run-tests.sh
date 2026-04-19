#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "============================================"
echo "  LLM Wiki — Full Test Suite"
echo "============================================"
echo ""

MODE="${1:-full}"

case "$MODE" in
  quick)
    echo "[1/1] Running tests (no coverage)..."
    npx vitest run --reporter=verbose
    ;;
  status-sync)
    echo "[1/1] Running status-sync regression tests..."
    npx vitest run \
      src/components/sources/__tests__/sources-view-status-sync.test.tsx \
      src/components/sources/__tests__/sources-view-server-truth.test.tsx \
      src/components/sources/__tests__/sources-view-ui-replay.test.tsx \
      src/components/__tests__/activity-panel.test.tsx \
      src/stores/__tests__/activity-store.test.ts \
      src/commands/__tests__/ingest-sse-full.test.ts \
      --reporter=verbose
    ;;
  source-alignment)
    echo "[1/1] Running source alignment regression tests..."
    npx vitest run \
      src/components/__tests__/knowledge-tree.test.tsx \
      src/components/__tests__/file-tree.test.tsx \
      src/components/sources/__tests__/sources-view-status-sync.test.tsx \
      src/components/sources/__tests__/sources-view-server-truth.test.tsx \
      src/components/sources/__tests__/sources-view-ui-replay.test.tsx \
      src/lib/__tests__/lint.test.ts \
      --reporter=verbose
    ;;
  mapping-overview)
    echo "[1/1] Running mapping/overview focused regression tests..."
    npm run test:mapping-overview
    ;;
  ingest-regression)
    echo "[1/2] Running frontend ingest regression tests..."
    npx vitest run \
      src/lib/__tests__/ingest-full.test.ts \
      src/commands/__tests__/ingest-sse-full.test.ts \
      src/components/sources/__tests__/ingest-guards-full.test.ts \
      src/components/sources/__tests__/sources-view-status-sync.test.tsx \
      src/components/sources/__tests__/sources-view-server-truth.test.tsx \
      src/stores/__tests__/activity-store-reload.test.ts \
      --reporter=verbose

    echo ""
    echo "[2/2] Running server ingest regression tests..."
    npm --prefix server test -- \
      src/services/__tests__/ingest-service.test.ts \
      src/services/__tests__/ingest-service-dedup.test.ts
    ;;
  matrix)
    echo "[1/1] Running test matrix..."
    bash scripts/test-matrix.sh "${2:-2}"
    ;;
  soak)
    echo "[1/1] Running soak test..."
    bash scripts/test-soak.sh "${2:-3}" "${3:-1}"
    ;;
  chaos)
    echo "[1/1] Running chaos test..."
    bash scripts/test-chaos.sh "${2:-3}"
    ;;
  parallel)
    echo "[1/1] Running parallel stress test..."
    bash scripts/test-parallel.sh "${2:-2}"
    ;;
  flake)
    echo "[1/1] Running flake detector..."
    bash scripts/test-flake.sh "${2:-10}"
    ;;
  title-sync)
    echo "[1/1] Running title/content sync regression..."
    bash scripts/test-title-sync.sh
    ;;
  regression)
    echo "[1/1] Running organized regression flow..."
    bash scripts/test-regression.sh "${2:-full}"
    ;;
  hygiene)
    echo "[1/1] Running test hygiene check..."
    bash scripts/test-hygiene.sh
    ;;
  full)
    echo "[1/2] Running tests with coverage..."
    npx vitest run --coverage --reporter=verbose

    echo ""
    echo "[2/2] Coverage summary:"
    echo "--------------------------------------------"
    if [ -f coverage/coverage-summary.json ]; then
      node -e "
        const s = require('./coverage/coverage-summary.json').total;
        const fmt = (o) => o.pct + '%';
        console.log('  Statements : ' + fmt(s.statements));
        console.log('  Branches   : ' + fmt(s.branches));
        console.log('  Functions  : ' + fmt(s.functions));
        console.log('  Lines      : ' + fmt(s.lines));
      "
    else
      echo "  (coverage-summary.json not found)"
    fi
    echo "--------------------------------------------"
    echo "  HTML report: coverage/index.html"
    ;;
  *)
    echo "Usage: $0 [quick|status-sync|source-alignment|mapping-overview|ingest-regression|matrix [repeats]|soak [cycles] [matrix-repeats]|chaos [rounds]|parallel [rounds]|flake [rounds]|title-sync|regression [baseline|full|stress]|hygiene|full]"
    echo "  quick  — run tests without coverage"
    echo "  status-sync — run focused status consistency regression suite"
    echo "  source-alignment — run source title/filename/content alignment suite"
    echo "  mapping-overview — run focused mapping and overview resilience suite"
    echo "  ingest-regression — run ingest regression suite (frontend + server)"
    echo "  matrix [repeats] — run broad test matrix (build + suites + stability loop)"
    echo "  soak [cycles] [matrix-repeats] — run long stability soak loops"
    echo "  chaos [rounds] — run suites in random order for order-dependency detection"
    echo "  parallel [rounds] — run key suites concurrently for race-condition detection"
    echo "  flake [rounds] — repeat critical suites to detect intermittent failures"
    echo "  title-sync — run title/content-path consistency regression suite"
    echo "  regression [baseline|full|stress] — organized end-to-end regression flow"
    echo "  hygiene — fail if critical suites emit warning signatures"
    echo "  full   — run tests with coverage report (default)"
    exit 1
    ;;
esac

echo ""
echo "All tests passed."
