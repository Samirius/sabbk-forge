#!/usr/bin/env bash
# forge-health.sh — Quick status dashboard for the forge
# Usage: ./bin/forge-health.sh

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Guard: package.json must exist (AC-6)
PKG="$ROOT/package.json"
if [ ! -f "$PKG" ]; then
  echo "ERROR: package.json not found at $PKG" >&2
  exit 1
fi

# Forge version (AC-3)
VERSION=$(node -e "const p=require('$PKG'); process.stdout.write(p.version)")
echo "Forge version:  $VERSION"

# Jig count (AC-4)
JIGS_FILE="$ROOT/jigs/run-all.sh"
if [ -f "$JIGS_FILE" ]; then
  JIG_COUNT=$(grep -oP '(?<=JIGS=\().*(?=\))' "$JIGS_FILE" | tr ' ' '\n' | grep -c '.' || echo 0)
else
  JIG_COUNT=0
fi
echo "Jigs defined:   $JIG_COUNT"

# Per-repo scan timestamps (AC-5)
CTX_DIR="$ROOT/lifecycle/context"
echo ""
echo "Repo scans:"

shopt -s nullglob
SCAN_FILES=("$CTX_DIR"/*/scan.json)
shopt -u nullglob

if [ ${#SCAN_FILES[@]} -eq 0 ]; then
  echo "  (no repos scanned yet)"
else
  for sf in "${SCAN_FILES[@]}"; do
    REPO_NAME="$(basename "$(dirname "$sf")")"
    TIMESTAMP=$(node -e "const d=require('$sf'); process.stdout.write(d.scanned_at || 'unknown')")
    printf "  %-20s %s\n" "$REPO_NAME" "$TIMESTAMP"
  done
fi
