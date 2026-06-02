#!/usr/bin/env bash
# jigs/master-plan-unique.sh — Verify SABBK-MASTER-PLAN.md is single-source (no duplicates)
# Checks that the master plan exists in exactly ONE repo with copies in others being symlinks
# or pointers, OR that all copies are byte-identical (temporary until dedup is done).
set -euo pipefail

# Expected repos that have the master plan (relative to a common parent)
# In CI this runs from sabbk-forge; locally we check sibling dirs
PARENT="${SABBK_ROOT:-$HOME}"
# Validate parent directory exists
if [ ! -d "$PARENT" ]; then
  echo "WARN: SABBK_ROOT ($PARENT) does not exist, falling back to $HOME"
  PARENT="$HOME"
fi
PLAN_FILE="docs/SABBK-MASTER-PLAN.md"
REPOS=("sabbk-workshop" "sabbk-clients" "sabbk-co" "sabbk-forge")

PASS=0 FAIL=0
_assert() { local label="$1"; shift; if "$@"; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  FAIL: $label"; fi; }

echo "── master-plan-unique validation ──"

# Count copies that exist
COUNT=0
FOUND_IN=""
for repo in "${REPOS[@]}"; do
  if [ -f "$PARENT/$repo/$PLAN_FILE" ]; then
    COUNT=$((COUNT+1))
    FOUND_IN="$FOUND_IN $repo"
  fi
done

_assert "master plan exists in at least one repo" [  $COUNT -ge 1  ]

if [ "$COUNT" -eq 0 ]; then
  echo "  No copies found — skipping further checks"
  echo "  $PASS passed, $FAIL failed"
  [ "$FAIL" -eq 0 ] && echo "✅ master-plan-unique OK" || { echo "❌ master-plan-unique FAILED"; exit 1; }
  exit 0
fi

echo "  Found in: $FOUND_IN ($COUNT copies)"

# If multiple copies exist, verify they're identical
if [ "$COUNT" -gt 1 ]; then
  FIRST=""
  ALL_MATCH=true
  FIRST_HASH=""
  for repo in "${REPOS[@]}"; do
    FILE="$PARENT/$repo/$PLAN_FILE"
    if [ -f "$FILE" ]; then
      HASH=$(md5sum "$FILE" | cut -d' ' -f1)
      if [ -z "$FIRST" ]; then
        FIRST="$FILE"
        FIRST_HASH="$HASH"
      else
        if [ "$HASH" != "$FIRST_HASH" ]; then
          ALL_MATCH=false
          echo "  DIFF: $FIRST vs $FILE"
        fi
      fi
    fi
  done
  _assert "all copies are byte-identical (or dedup needed)" [ "$ALL_MATCH" = true ]

  if [ "$ALL_MATCH" = false ]; then
    echo "  ⚠️  Master plan copies differ — dedup needed"
    echo "  Fix: pick one source (recommend sabbk-workshop), make others symlink or pointer"
  fi
else
  _assert "single copy (ideal)" [  $COUNT -eq 1  ]
fi

echo "  $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "✅ master-plan-unique OK" || { echo "❌ master-plan-unique FAILED"; exit 1; }
