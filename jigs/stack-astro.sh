#!/usr/bin/env bash
# jigs/stack-astro.sh — Validate Astro project structure template
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0 FAIL=0

_assert() { if eval "$2"; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi }

echo "── stack-astro validation ──"

if [ ! -f "$ROOT/templates/stacks/astro/README.md" ]; then
  echo "SKIP: no astro stack template"
  exit 0
fi

_assert "astro README exists and is non-empty" "[ -s '$ROOT/templates/stacks/astro/README.md' ]"
_assert "mentions astro check" "grep -q 'astro check' '$ROOT/templates/stacks/astro/README.md'"
_assert "mentions build" "grep -q 'npm run build' '$ROOT/templates/stacks/astro/README.md'"
_assert "mentions static output" "grep -q 'dist' '$ROOT/templates/stacks/astro/README.md'"
_assert "mentions validation jig template" "grep -q 'jig' '$ROOT/templates/stacks/astro/README.md'"
_assert "mentions deploy" "grep -qi 'deploy' '$ROOT/templates/stacks/astro/README.md'"

echo "  $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "✅ stack-astro OK" || { echo "❌ stack-astro FAILED"; exit 1; }
