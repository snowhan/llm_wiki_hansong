#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

CYCLES="${1:-3}"
REPEATS_PER_MATRIX="${2:-1}"

if ! [[ "$CYCLES" =~ ^[0-9]+$ ]] || [ "$CYCLES" -lt 1 ]; then
  echo "Usage: $0 [cycles>=1] [repeats-per-matrix>=1]"
  exit 1
fi

if ! [[ "$REPEATS_PER_MATRIX" =~ ^[0-9]+$ ]] || [ "$REPEATS_PER_MATRIX" -lt 1 ]; then
  echo "Usage: $0 [cycles>=1] [repeats-per-matrix>=1]"
  exit 1
fi

echo "============================================"
echo "  LLM Wiki — Soak Test"
echo "============================================"
echo "Cycles: $CYCLES"
echo "Matrix repeats per cycle: $REPEATS_PER_MATRIX"
echo ""

for i in $(seq 1 "$CYCLES"); do
  echo "[Cycle $i/$CYCLES] Running matrix..."
  bash scripts/test-matrix.sh "$REPEATS_PER_MATRIX"
  echo ""
done

echo "Soak test completed successfully."
