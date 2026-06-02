#!/usr/bin/env bash
set -e
# jig: "can a cheap, low-capability model actually follow this repo?"
# This is the meta-jig that enforces the prime directive (WRITE FOR A DUMB EXECUTOR).
# It checks START-HERE.md is deterministic and self-validating, with no hidden-judgment language,
# and that every script it references actually exists.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SH="$ROOT/START-HERE.md"
fails=0
note() { echo "  ✗ $1"; fails=$((fails+1)); }

[ -f "$SH" ] || { echo "✗ START-HERE.md missing"; exit 1; }

# 1. Has enough numbered steps.
steps=$(grep -c '^### Step' "$SH" || true)
[ "$steps" -ge 5 ] || note "expected >=5 '### Step' headers, found $steps"

# 2. Every step is self-validating: at least as many **Verify:** lines as steps.
verifies=$(grep -c '^\*\*Verify:\*\*' "$SH" || true)
[ "$verifies" -ge "$steps" ] || note "found $verifies '**Verify:**' lines for $steps steps — every step needs a Verify"

# 3. No hidden-judgment / ambiguous language (these signal a step a weak model cannot execute).
banned='obviously|simply put|should be straightforward|figure (it|this|that) out|as appropriate|use your judgment|you know what to do|and so on'
if grep -niE "$banned" "$SH" >/dev/null; then
  note "ambiguous language found (a cheap model cannot act on these):"
  grep -niE "$banned" "$SH" | sed 's/^/      /'
fi

# 4. Every script/jig START-HERE references must exist (no dangling instructions).
refs=$(grep -oE '(bin|jigs)/[A-Za-z0-9._/-]+\.sh' "$SH" | sort -u || true)
for r in $refs; do
  [ -f "$ROOT/$r" ] || note "START-HERE references $r which does not exist"
done

if [ "$fails" -ne 0 ]; then echo "✗ cheap-model-self-test FAILED ($fails issue(s))"; exit 1; fi
echo "✓ cheap-model-self-test passed: $steps steps, $verifies verify-checks, no ambiguous language, all refs exist."
