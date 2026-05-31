#!/usr/bin/env bash
# jigs/stack-node-ts.sh — Validate Node/TypeScript project structure
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0 FAIL=0

_assert() { if eval "$2"; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi }

echo "── stack-node-ts validation ──"

# If no node-ts project exists, skip
if [ ! -f "$ROOT/templates/stacks/node-ts/README.md" ]; then
  echo "SKIP: no node-ts stack template"
  exit 0
fi

# Template exists and is non-empty
_assert "node-ts README exists and is non-empty" "[ -s '$ROOT/templates/stacks/node-ts/README.md' ]"

# Template mentions key checks
_assert "mentions types-pass" "grep -q 'tsc.*noEmit' '$ROOT/templates/stacks/node-ts/README.md'"
_assert "mentions lint-pass" "grep -q 'lint' '$ROOT/templates/stacks/node-ts/README.md'"
_assert "mentions build-pass" "grep -q 'build' '$ROOT/templates/stacks/node-ts/README.md'"
_assert "mentions test-pass" "grep -q 'test' '$ROOT/templates/stacks/node-ts/README.md'"
_assert "mentions validation jig template" "grep -q 'jig' '$ROOT/templates/stacks/node-ts/README.md'"

echo "  $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "✅ stack-node-ts OK" || { echo "❌ stack-node-ts FAILED"; exit 1; }
