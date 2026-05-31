#!/usr/bin/env bash
# jigs/stack-python.sh — Validate Python project structure template
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0 FAIL=0

_assert() { if eval "$2"; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi }

echo "── stack-python validation ──"

if [ ! -f "$ROOT/templates/stacks/python/README.md" ]; then
  echo "SKIP: no python stack template"
  exit 0
fi

_assert "python README exists and is non-empty" "[ -s '$ROOT/templates/stacks/python/README.md' ]"
_assert "mentions ruff lint" "grep -q 'ruff check' '$ROOT/templates/stacks/python/README.md'"
_assert "mentions pytest" "grep -q 'pytest' '$ROOT/templates/stacks/python/README.md'"
_assert "mentions format check" "grep -q 'format' '$ROOT/templates/stacks/python/README.md'"
_assert "mentions validation jig template" "grep -q 'jig' '$ROOT/templates/stacks/python/README.md'"

echo "  $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "✅ stack-python OK" || { echo "❌ stack-python FAILED"; exit 1; }
