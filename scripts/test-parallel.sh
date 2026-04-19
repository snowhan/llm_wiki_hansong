#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

ROUNDS="${1:-2}"

if ! [[ "$ROUNDS" =~ ^[0-9]+$ ]] || [ "$ROUNDS" -lt 1 ]; then
  echo "Usage: $0 [rounds>=1]"
  exit 1
fi

echo "============================================"
echo "  LLM Wiki — Parallel Stress Test"
echo "============================================"
echo "Rounds: $ROUNDS"
echo ""

for i in $(seq 1 "$ROUNDS"); do
  echo "[Round $i/$ROUNDS] Running suites in parallel..."
  npm run test:status-sync >/dev/null &
  p1=$!
  npm run test:ingest-regression >/dev/null &
  p2=$!

  wait "$p1"
  wait "$p2"
done

echo ""
echo "Parallel stress test completed successfully."
