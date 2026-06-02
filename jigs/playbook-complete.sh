#!/usr/bin/env bash
# jig: playbook-complete — verify no playbook or protocol is truncated
# Checks that all .md files under playbooks/ and protocols/ end with "## End"
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0 FAIL=0

for dir in playbooks protocols; do
  for f in "$ROOT/$dir"/*.md; do
    [ -f "$f" ] || continue
    name=$(basename "$f")
    last_line=$(tail -1 "$f" | tr -d '[:space:]')
    if [ "$last_line" = "##End" ]; then
      PASS=$((PASS+1))
    else
      FAIL=$((FAIL+1))
      echo "  FAIL: $dir/$name does not end with '## End' (possible truncation)"
    fi
  done
done

echo "  $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "✅ playbook-complete OK" || { echo "❌ playbook-complete FAILED"; exit 1; }
