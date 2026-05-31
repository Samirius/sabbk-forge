#!/usr/bin/env bash
# bin/measure-cost.sh — Measure cost of a full pipeline run
# Usage: bin/measure-cost.sh [run_dir]
# Reads run-log JSONL entries and computes total tokens + estimated cost.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${1:-$ROOT/runs/latest}"

if [ ! -d "$RUN_DIR" ]; then
  echo "No run directory found at $RUN_DIR"
  echo "Run a pipeline first (bin/run-spike.sh or bin/run-pipeline.sh)"
  exit 1
fi

echo "═══ Pipeline Cost Report ═══"
echo "Run: $RUN_DIR"
echo ""

# Find all JSONL log files in the run directory
LOG_FILES=$(find "$RUN_DIR" -name "*.jsonl" -type f 2>/dev/null || true)
if [ -z "$LOG_FILES" ]; then
  echo "No JSONL log files found. Checking for stage logs..."
  # Fallback: look for any VALIDATION.md with cost info
  for v in $(find "$RUN_DIR" -name "VALIDATION.md" -type f 2>/dev/null || true); do
    echo "--- $v"
    grep -i -E "cost|token|price" "$v" || echo "  (no cost data)"
  done
  exit 0
fi

TOTAL_INPUT=0
TOTAL_OUTPUT=0
TOTAL_CACHE=0
STAGE_COUNT=0

for log in $LOG_FILES; do
  STAGE_NAME=$(basename "$(dirname "$log")")
  echo "── Stage: $STAGE_NAME ($(basename "$log"))"

  # Parse JSONL entries for token usage
  STAGE_INPUT=0
  STAGE_OUTPUT=0
  STAGE_CACHE=0
  ENTRIES=0

  while IFS= read -r line; do
    # Extract token counts from JSONL entries
    INPUT=$(echo "$line" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('usage',{}).get('input_tokens',0))" 2>/dev/null || echo "0")
    OUTPUT=$(echo "$line" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('usage',{}).get('output_tokens',0))" 2>/dev/null || echo "0")
    CACHE=$(echo "$line" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('usage',{}).get('cache_read_tokens',0))" 2>/dev/null || echo "0")

    STAGE_INPUT=$((STAGE_INPUT + INPUT))
    STAGE_OUTPUT=$((STAGE_OUTPUT + OUTPUT))
    STAGE_CACHE=$((STAGE_CACHE + CACHE))
    ENTRIES=$((ENTRIES + 1))
  done < "$log"

  TOTAL_INPUT=$((TOTAL_INPUT + STAGE_INPUT))
  TOTAL_OUTPUT=$((TOTAL_OUTPUT + STAGE_OUTPUT))
  TOTAL_CACHE=$((TOTAL_CACHE + STAGE_CACHE))
  STAGE_COUNT=$((STAGE_COUNT + 1))

  echo "  Input: $STAGE_INPUT | Output: $STAGE_OUTPUT | Cache: $STAGE_CACHE | Entries: $ENTRIES"
done

echo ""
echo "═══ TOTAL ═══"
echo "Stages: $STAGE_COUNT"
echo "Input tokens: $TOTAL_INPUT"
echo "Output tokens: $TOTAL_OUTPUT"
echo "Cache-read tokens: $TOTAL_CACHE"
echo "Total tokens: $((TOTAL_INPUT + TOTAL_OUTPUT + TOTAL_CACHE))"

# Cost estimation (adjust these rates for your provider)
# GLM-4.6 approximate: input=$0.01/1M, output=$0.03/1M, cache=$0.002/1M
# Claude Haiku: input=$0.80/1M, output=$4.00/1M, cache=$0.08/1M
echo ""
echo "Estimated cost (GLM-4.6 rates):"
python3 -c "
i, o, c = $TOTAL_INPUT, $TOTAL_OUTPUT, $TOTAL_CACHE
cost = (i * 0.01 + o * 0.03 + c * 0.002) / 1_000_000
print(f'  \${cost:.6f} ({cost*100:.4f} cents)')
"
echo "Estimated cost (Claude Haiku rates):"
python3 -c "
i, o, c = $TOTAL_INPUT, $TOTAL_OUTPUT, $TOTAL_CACHE
cost = (i * 0.80 + o * 4.00 + c * 0.08) / 1_000_000
print(f'  \${cost:.6f} ({cost*100:.4f} cents)')
"
echo ""
echo "✅ cost report complete"
