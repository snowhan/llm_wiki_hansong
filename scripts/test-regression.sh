#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

MODE="${1:-full}"

echo "============================================"
echo "  LLM Wiki — Regression Runner"
echo "============================================"
echo "Mode: $MODE"
echo ""

case "$MODE" in
  baseline)
    echo "[1/3] Status-sync regression"
    npm run test:status-sync
    echo ""
    echo "[2/3] Ingest regression"
    npm run test:ingest-regression
    echo ""
    echo "[3/3] Test hygiene check"
    npm run test:hygiene
    ;;
  full)
    echo "[1/2] Full matrix (build + full tests + focused suites + coverage)"
    npm run test:matrix -- 1
    echo ""
    echo "[2/2] Test hygiene check"
    npm run test:hygiene
    ;;
  stress)
    echo "[1/5] Baseline full matrix"
    npm run test:matrix -- 1
    echo ""
    echo "[2/5] Chaos order-dependency test"
    npm run test:chaos -- 8
    echo ""
    echo "[3/5] Parallel stress test"
    npm run test:parallel -- 3
    echo ""
    echo "[4/5] Flake detector"
    npm run test:flake -- 20
    echo ""
    echo "[5/5] Test hygiene check"
    npm run test:hygiene
    ;;
  *)
    echo "Usage: $0 [baseline|full|stress]"
    exit 1
    ;;
esac

echo ""
echo "Regression run completed successfully."
