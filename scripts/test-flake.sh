#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

ROUNDS="${1:-10}"

if ! [[ "$ROUNDS" =~ ^[0-9]+$ ]] || [ "$ROUNDS" -lt 1 ]; then
  echo "Usage: $0 [rounds>=1]"
  exit 1
fi

echo "============================================"
echo "  LLM Wiki — Flake Detector"
echo "============================================"
echo "Rounds: $ROUNDS"
echo ""

for i in $(seq 1 "$ROUNDS"); do
  echo "[Round $i/$ROUNDS] Running critical deterministic suites..."
  npx vitest run \
    src/components/sources/__tests__/sources-view-status-sync.test.tsx \
    src/components/sources/__tests__/sources-view-server-truth.test.tsx \
    src/commands/__tests__/ingest-sse-full.test.ts \
    src/stores/__tests__/activity-store.test.ts \
    src/stores/__tests__/activity-store-reload.test.ts \
    >/dev/null
done

echo ""
echo "Flake detector completed successfully."
