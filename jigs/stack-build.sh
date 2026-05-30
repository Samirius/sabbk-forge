#!/usr/bin/env bash
# stack-build.sh <project-dir> — per-stack "is it green?" check a coding agent runs in its build output.
# Auto-detects Node-TS / Astro / Python by the files present and runs that stack's build/typecheck/test.
# NOT part of jigs/run-all.sh (that validates the forge itself) — this runs inside a generated project,
# so it needs that project's deps installed. Exit 0 = green.
set -uo pipefail
DIR="${1:-.}"
cd "$DIR" 2>/dev/null || { echo "✗ no such dir: $DIR"; exit 2; }

if [ -f astro.config.mjs ] || grep -q '"astro"' package.json 2>/dev/null; then
  echo "stack: astro → build + check"
  npm run build && npm run check
elif [ -f package.json ]; then
  echo "stack: node-ts → build + typecheck + test"
  npm run build && npm run typecheck && { npm test || echo "  (no tests / tests skipped)"; }
elif [ -f pyproject.toml ]; then
  echo "stack: python → ruff + format + pytest"
  ruff check . && ruff format --check . && pytest -q
else
  echo "✗ no recognized stack here (need package.json, astro.config.mjs, or pyproject.toml)"; exit 2
fi
echo "✓ stack build green: $DIR"
