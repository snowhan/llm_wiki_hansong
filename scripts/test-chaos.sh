#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

ROUNDS="${1:-3}"

if ! [[ "$ROUNDS" =~ ^[0-9]+$ ]] || [ "$ROUNDS" -lt 1 ]; then
  echo "Usage: $0 [rounds>=1]"
  exit 1
fi

echo "============================================"
echo "  LLM Wiki — Chaos Test"
echo "============================================"
echo "Rounds: $ROUNDS"
echo ""

for round in $(seq 1 "$ROUNDS"); do
  echo "[Round $round/$ROUNDS] Shuffling suite order..."

  suites=(
    "npm test >/dev/null"
    "npm --prefix server test >/dev/null"
    "npm run test:status-sync >/dev/null"
    "npm run test:ingest-regression >/dev/null"
  )

  # Fisher–Yates shuffle
  for ((i=${#suites[@]}-1; i>0; i--)); do
    j=$((RANDOM % (i + 1)))
    tmp="${suites[i]}"
    suites[i]="${suites[j]}"
    suites[j]="$tmp"
  done

  idx=1
  for cmd in "${suites[@]}"; do
    echo "  - suite $idx/${#suites[@]}: $cmd"
    eval "$cmd"
    idx=$((idx + 1))
  done

  echo ""
done

echo "Chaos test completed successfully."
