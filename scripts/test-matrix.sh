#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

REPEATS="${1:-2}"

if ! [[ "$REPEATS" =~ ^[0-9]+$ ]] || [ "$REPEATS" -lt 1 ]; then
  echo "Usage: $0 [repeats>=1]"
  exit 1
fi

echo "============================================"
echo "  LLM Wiki — Test Matrix"
echo "============================================"
echo "Repeat count: $REPEATS"
echo ""

echo "[1/8] Build frontend (type + bundle)"
npm run build >/dev/null

echo "[2/8] Build server (type + compile)"
npm run build:server >/dev/null

echo "[3/8] Run frontend full unit/integration suite"
npm test >/dev/null

echo "[4/8] Run server full suite"
npm --prefix server test >/dev/null

echo "[5/8] Run status-sync focused regression suite"
npm run test:status-sync >/dev/null

echo "[6/8] Run ingest focused regression suite"
npm run test:ingest-regression >/dev/null

echo "[7/8] Stability loop (repeat key suites)"
for i in $(seq 1 "$REPEATS"); do
  echo "  - pass $i/$REPEATS"
  npm run test:status-sync >/dev/null
  npm run test:ingest-regression >/dev/null
done

echo "[8/8] Coverage suite"
npm run test:coverage >/dev/null

echo ""
echo "Matrix completed successfully."
