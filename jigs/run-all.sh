#!/usr/bin/env bash
# Run every jig. Exit nonzero if any fail. This is the gate before any agent is considered bootable.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JIGS=(agent-manifest-valid gear-contract-valid pipeline-wiring-valid cheap-model-self-test)
fail=0
echo "═══ running ${#JIGS[@]} jigs ═══"
for j in "${JIGS[@]}"; do
  echo "── $j"
  if bash "$ROOT/jigs/$j.sh"; then :; else fail=$((fail+1)); fi
done
echo "═══════════════════════"
if [ "$fail" -ne 0 ]; then echo "✗ $fail jig(s) FAILED"; exit 1; fi
echo "✅ all jigs passed"
