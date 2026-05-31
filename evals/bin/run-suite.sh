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

# Parse yaml task list (simple: lines that start with "  - ")
TASKS=$(grep '^\s*- ' "$SUITE_FILE" | sed 's/.*- //')

TOTAL=0 PASS=0 FAIL=0
SUITE_TS=$(date -u +%Y%m%dT%H%M%SZ)
SUMMARY="$ROOT/evals/results/$SUITE-$SUITE_TS-summary.json"

for TASK in $TASKS; do
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

# Write summary
cat > "$SUMMARY" <<END
{
  "suite": "$SUITE",
  "timestamp": "$SUITE_TS",
  "total": $TOTAL,
  "pass": $PASS,
  "fail": $FAIL,
  "judge": "$JUDGE"
}
END

echo "Summary: $SUMMARY"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
