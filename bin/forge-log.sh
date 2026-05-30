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
FILES=($(ls -1 "$RUNS_DIR"/*.jsonl 2>/dev/null | sort -r || true))

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

# Sort by timestamp (field 1) descending
sort -r "$TEMP_FILE" | head -n "$N" | while IFS= read -r line; do
  # Parse JSON using node
  node -e "
    const record = JSON.parse('$line');
    const ts = new Date(record.ts).toISOString().replace('T', ' ').substring(0, 19);
    const pipeline = record.pipeline.padEnd(12);
    const agent = record.agent.padEnd(15);
    const stage = record.stage.padEnd(10);
    const exit = record.exit === 0 ? '✓'.padEnd(4) : '✗'.padEnd(4);
    const duration = (record.duration_ms / 1000).toFixed(2).padStart(7) + 's';
    const cost = record.cost_usd !== undefined ? '$' + record.cost_usd.toFixed(4) : '';
    console.log(\`\${ts} | \${pipeline} | \${agent} | \${stage} | \${exit} | \${duration} \${cost}\`);
  "
done