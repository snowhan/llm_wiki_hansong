#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "============================================"
echo "  LLM Wiki — Mapping Overview Guard"
echo "============================================"
echo ""

echo "[1/3] Structural lint mapping tests"
npx vitest run src/lib/__tests__/lint.test.ts --reporter=verbose

echo ""
echo "[2/3] Frontend ingest title/path regression"
npx vitest run src/lib/__tests__/ingest-full.test.ts --reporter=verbose

echo ""
echo "[3/3] Server ingest title/path regression"
npm --prefix server test -- src/services/__tests__/ingest-service-title-sync.test.ts

echo ""
echo "Mapping overview guard passed."
