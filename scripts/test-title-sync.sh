#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "============================================"
echo "  LLM Wiki — Title/Content Sync Regression"
echo "============================================"
echo ""

echo "[1/2] Frontend ingest title/path alignment tests"
npx vitest run src/lib/__tests__/ingest-full.test.ts --reporter=verbose

echo ""
echo "[2/2] Server ingest title/path alignment tests"
npm --prefix server test -- src/services/__tests__/ingest-service-title-sync.test.ts

echo ""
echo "Title/content sync regression passed."
