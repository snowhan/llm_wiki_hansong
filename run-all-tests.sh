#!/usr/bin/env bash
# ── run-all-tests.sh ─────────────────────────────────────────────────────
# 一键运行前端 + 服务端全量测试，支持 --ci / --coverage / --watch 选项。
#
# 用法：
#   ./run-all-tests.sh              # 普通运行
#   ./run-all-tests.sh --ci         # CI 模式（详细报告 + 覆盖率）
#   ./run-all-tests.sh --coverage   # 仅生成覆盖率报告
#   ./run-all-tests.sh --watch      # 观察模式（前端 + 服务端并行）
# ─────────────────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR"
SERVER_DIR="$ROOT_DIR/server"

GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RESET="\033[0m"

MODE="${1:-run}"

print_header() {
  echo -e "\n${CYAN}══════════════════════════════════════════${RESET}"
  echo -e "${CYAN}  $1${RESET}"
  echo -e "${CYAN}══════════════════════════════════════════${RESET}\n"
}

# ── watch mode: run both in parallel ─────────────────────────────────────
if [[ "$MODE" == "--watch" ]]; then
  print_header "Watch mode — frontend + server"
  echo -e "${YELLOW}Press Ctrl+C to stop both watchers.${RESET}\n"
  # Run frontend watcher in background
  (cd "$FRONTEND_DIR" && npm run test:watch) &
  FE_PID=$!
  # Run server watcher in background
  (cd "$SERVER_DIR" && npm run test:watch) &
  SRV_PID=$!
  # Wait for either to exit
  trap "kill $FE_PID $SRV_PID 2>/dev/null" EXIT
  wait
  exit 0
fi

# ── CI mode ──────────────────────────────────────────────────────────────
if [[ "$MODE" == "--ci" ]]; then
  FRONTEND_CMD="npm run test:ci"
  SERVER_CMD="npx vitest run --reporter=verbose"
elif [[ "$MODE" == "--coverage" ]]; then
  FRONTEND_CMD="npm run test:coverage"
  SERVER_CMD="npx vitest run --coverage"
else
  FRONTEND_CMD="npm run test"
  SERVER_CMD="npm run test"
fi

# ── Frontend tests ────────────────────────────────────────────────────────
print_header "Frontend tests (vitest + jsdom)"
cd "$FRONTEND_DIR"
FRONTEND_EXIT=0
eval "$FRONTEND_CMD" || FRONTEND_EXIT=$?

# ── Server tests ──────────────────────────────────────────────────────────
print_header "Server tests (vitest + node)"
cd "$SERVER_DIR"
SERVER_EXIT=0
eval "$SERVER_CMD" || SERVER_EXIT=$?

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}══════════════════════════════════════════${RESET}"
echo -e "${CYAN}  Summary${RESET}"
echo -e "${CYAN}══════════════════════════════════════════${RESET}"

if [[ $FRONTEND_EXIT -eq 0 ]]; then
  echo -e "  Frontend  ${GREEN}✓ PASSED${RESET}"
else
  echo -e "  Frontend  ${RED}✗ FAILED (exit $FRONTEND_EXIT)${RESET}"
fi

if [[ $SERVER_EXIT -eq 0 ]]; then
  echo -e "  Server    ${GREEN}✓ PASSED${RESET}"
else
  echo -e "  Server    ${RED}✗ FAILED (exit $SERVER_EXIT)${RESET}"
fi

echo ""

# Exit with non-zero if any suite failed
TOTAL_EXIT=$((FRONTEND_EXIT + SERVER_EXIT))
if [[ $TOTAL_EXIT -ne 0 ]]; then
  exit 1
fi

exit 0
