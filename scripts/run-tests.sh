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
    echo "Usage: $0 [quick|full]"
    echo "  quick  — run tests without coverage"
    echo "  full   — run tests with coverage report (default)"
    exit 1
    ;;
esac

echo ""
echo "All tests passed."
