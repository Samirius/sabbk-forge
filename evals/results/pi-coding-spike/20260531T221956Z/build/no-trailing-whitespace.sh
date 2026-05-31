#!/usr/bin/env bash
# jig: no tracked .md or .sh file has trailing whitespace (spaces/tabs before newline).
set -euo pipefail

# Resolve target directory
DIR="${1:-$(git rev-parse --show-toplevel)}"

# Verify it's a git repo
if ! git -C "$DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ not a git repository: $DIR" >&2
  exit 1
fi

VIOLATIONS=0

# Enumerate tracked .md and .sh files, then scan each for trailing whitespace
while IFS= read -r file; do
  [ -z "$file" ] && continue
  while IFS= read -r match; do
    lineno="${match%%:*}"
    echo "$file:$lineno"
    VIOLATIONS=$((VIOLATIONS + 1))
  done < <(grep -nE '[[:space:]]+$' "$DIR/$file" 2>/dev/null || true)
done < <(git -C "$DIR" ls-files -- '*.md' '*.sh')

# Report
if [ "$VIOLATIONS" -gt 0 ]; then
  echo "❌ $VIOLATIONS trailing-whitespace violation(s) found"
  exit 1
else
  echo "✅ no-trailing-whitespace OK"
  exit 0
fi
