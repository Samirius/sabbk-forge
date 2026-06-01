#!/usr/bin/env bash
# run-suite.sh — run all tasks in a suite and aggregate results
# Usage: bash evals/bin/run-suite.sh <suite-name> [--judge|--no-judge]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUITE="${1:-smoke}"
JUDGE="${2:---judge}"
SUITE_FILE="$ROOT/evals/suites/$SUITE.yaml"

[ -f "$SUITE_FILE" ] || { echo "✗ suite not found: $SUITE_FILE"; exit 1; }

echo "╔════════════════════════════════════════╗"
echo "║  EVAL SUITE: $SUITE"
echo "╚════════════════════════════════════════╝"

# FIX: EVAL-002 — use array to avoid word-splitting/glob bugs
mapfile -t TASKS < <(grep -v '^\s*#' "$SUITE_FILE" | grep '^\s*- ' | sed 's/^\s*- \s*//')

# FIX: EVAL-005 — warn on empty task list
if [ ${#TASKS[@]} -eq 0 ] || [ -z "${TASKS[0]:-}" ]; then
  echo "✗ No tasks found in $SUITE_FILE. Check your YAML format."
  exit 1
fi

TOTAL=0 PASS=0 FAIL=0
SUITE_TS=$(date -u +%Y%m%dT%H%M%SZ)
SUMMARY="$ROOT/evals/results/$SUITE-$SUITE_TS-summary.json"
mkdir -p "$(dirname "$SUMMARY")"

for TASK in "${TASKS[@]}"; do
  [ -z "$TASK" ] && continue
  echo ""
  echo "──────────────────────────────────────────"
  if bash "$ROOT/evals/bin/run-eval.sh" "$TASK" "$JUDGE"; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
  fi
  TOTAL=$((TOTAL+1))
done

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  SUITE RESULTS: $SUITE"
echo "║  Total: $TOTAL  Pass: $PASS  Fail: $FAIL"
echo "╚════════════════════════════════════════╝"

# FIX: EVAL-003 — use printf for safe JSON (no heredoc interpolation issues)
printf '{
  "suite": "%s",
  "timestamp": "%s",
  "total": %d,
  "pass": %d,
  "fail": %d,
  "judge": "%s"
}\n' "$SUITE" "$SUITE_TS" "$TOTAL" "$PASS" "$FAIL" "$JUDGE" > "$SUMMARY"

echo "Summary: $SUMMARY"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
