#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "============================================"
echo "  LLM Wiki — Ingest Count Gate Regression"
echo "============================================"
echo ""

echo "[1/3] Count gate unit + consistency invariants"
npm --prefix server test -- src/services/__tests__/ingest-consistency.test.ts

echo ""
echo "[2/3] Timing/concurrency snapshot consistency"
npm --prefix server test -- src/services/__tests__/ingest-timing.test.ts

echo ""
echo "[3/3] Real replay concurrency + post-rebuild gate"
npm --prefix server test -- src/services/__tests__/ingest-test6-real-replay.test.ts

echo ""
echo "Ingest count gate regression passed."
