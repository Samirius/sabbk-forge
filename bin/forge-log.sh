#!/usr/bin/env bash
# forge-log.sh — Display recent forge runs as a readable table
# Usage: ./bin/forge-log.sh [N]  (default N=20)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNS_DIR="$ROOT/runs"
N="${1:-20}"

# Check if runs directory exists
if [ ! -d "$RUNS_DIR" ]; then
  exit 0
fi

# Find all JSONL files, sort by filename descending (newest first)
# Safe: use nullglob + array instead of unquoted ls
shopt -s nullglob
FILES=("$RUNS_DIR"/*.jsonl)
shopt -u nullglob

if [ ${#FILES[@]} -eq 0 ]; then
  exit 0
fi

# Collect and sort records by timestamp descending
TEMP_FILE=$(mktemp)
trap 'rm -f "$TEMP_FILE"' EXIT

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    cat "$file" >> "$TEMP_FILE"
  fi
done

# Sort by timestamp (field 1) descending, pipe to node for safe parsing
# FIX: SEC-001 — pass JSON via stdin, not shell interpolation
# FIX: BUG-005 — skip malformed lines instead of crashing
sort -r "$TEMP_FILE" | head -n "$N" | node -e "
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    try {
      const record = JSON.parse(line);
      const ts = new Date(record.ts).toISOString().replace('T', ' ').substring(0, 19);
      const pipeline = (record.pipeline || '').padEnd(12);
      const agent = (record.agent || '').padEnd(15);
      const stage = (record.stage || '').padEnd(10);
      const exit = record.exit === 0 ? '✓'.padEnd(4) : '✗'.padEnd(4);
      const duration = ((record.duration_ms || 0) / 1000).toFixed(2).padStart(7) + 's';
      const cost = record.cost_usd !== undefined ? '$' + record.cost_usd.toFixed(4) : '';
      console.log(ts + ' | ' + pipeline + ' | ' + agent + ' | ' + stage + ' | ' + exit + ' | ' + duration + ' ' + cost);
    } catch (e) {
      // FIX: BUG-005 — skip malformed JSONL lines with a warning
      process.stderr.write('⚠ malformed JSONL line: ' + line.substring(0, 80) + '\\n');
    }
  });
"
