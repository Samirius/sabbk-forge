#!/usr/bin/env bash
# run-eval.sh — run one eval task through the forge pipeline and score it
# Usage: bash evals/bin/run-eval.sh <task-id> [--judge|--no-judge]
# Outputs: evals/results/<task-id>/<timestamp>/score.json
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TASK_ID="${1:-}"
JUDGE="${2:---judge}"
AGENT_ID="${3:-pi-coding-spike}"   # FIX: CODE-001 — configurable via CLI arg
[ -z "$TASK_ID" ] && { echo "usage: run-eval.sh <task-id> [--judge|--no-judge] [agent-id]"; exit 2; }

TASK_FILE="$ROOT/evals/tasks/$TASK_ID.md"
[ -f "$TASK_FILE" ] || { echo "✗ task not found: $TASK_FILE"; exit 1; }

WORKDIR="$ROOT/spike/workdir/$AGENT_ID"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
RESULT_DIR="$ROOT/evals/results/$TASK_ID/$TIMESTAMP"
mkdir -p "$RESULT_DIR"

echo "══════════════════════════════════════════"
echo "  EVAL: $TASK_ID"
echo "  Time: $TIMESTAMP"
echo "══════════════════════════════════════════"

# 1. Copy task into workdir
cp -f "$TASK_FILE" "$WORKDIR/TASK.md"

# 2. Clean previous artifacts
rm -f "$WORKDIR"/{SPEC.md,PLAN.md,VALIDATION.md,budget-state.json,CHECKPOINT-*.md}
rm -rf "$WORKDIR/build"
mkdir -p "$WORKDIR/build"

# 3. Verify prerequisites before running
if [ ! -f "$WORKDIR/SPEC.md" ]; then echo "⚠ SPEC.md not created — spec stage may have failed"; fi
if [ ! -f "$WORKDIR/PLAN.md" ]; then echo "⚠ PLAN.md not created — plan stage may have failed"; fi

# Provision + run full pipeline (auto-approve checkpoint)
export GLM_API_KEY="${GLM_API_KEY:?GLM_API_KEY must be set}"
echo ""
echo "▶ Provisioning $AGENT_ID..."
bash "$ROOT/bin/provision-agent.sh" "$AGENT_ID" 2>&1

echo ""
echo "▶ Running SPEC..."
node "$ROOT/lib/pi-adapter.mjs" spawn "$AGENT_ID" spec "Read ./AGENTS.md (your contract) and ./TASK.md. Write ./SPEC.md: restate the task as a crisp spec with explicit, checkable acceptance criteria. Do NOT write code yet."

echo ""
echo "▶ Running PLAN..."
node "$ROOT/lib/pi-adapter.mjs" spawn "$AGENT_ID" plan "Read ./SPEC.md. Write ./PLAN.md: numbered build steps, exactly which files you will create, and how each acceptance criterion will be validated."

echo ""
echo "▶ Auto-approving checkpoint..."
CHECKPOINT=$(ls -t "$WORKDIR"/CHECKPOINT-*.md 2>/dev/null | sort -r | head -1)
if [ -n "$CHECKPOINT" ]; then
  if ! bash "$ROOT/bin/checkpoint.sh" answer "$CHECKPOINT" "approve" 2>&1; then
    echo "⚠ checkpoint approval failed (non-fatal, continuing)"
  fi
fi

echo ""
echo "▶ Running BUILD..."
node "$ROOT/lib/pi-adapter.mjs" spawn "$AGENT_ID" build "Read ./PLAN.md. Execute it: create the deliverable under ./build/ exactly as planned. Stay strictly inside this directory."

echo ""
echo "▶ Running VALIDATE..."
node "$ROOT/lib/pi-adapter.mjs" spawn "$AGENT_ID" validate "Verify ./build/ against ./SPEC.md acceptance criteria. Write ./VALIDATION.md: list each criterion with pass/fail and the evidence."

# 4. Capture outputs (fail on missing critical artifacts)
cp -f "$WORKDIR"/SPEC.md "$RESULT_DIR/" 2>/dev/null || { echo "⚠ SPEC.md missing — pipeline may have failed"; }
cp -f "$WORKDIR"/PLAN.md "$RESULT_DIR/" 2>/dev/null || { echo "⚠ PLAN.md missing — pipeline may have failed"; }
cp -f "$WORKDIR"/VALIDATION.md "$RESULT_DIR/" 2>/dev/null || { echo "⚠ VALIDATION.md missing — pipeline may have failed"; }
[ -d "$WORKDIR/build" ] && cp -r "$WORKDIR/build" "$RESULT_DIR/"
cp -f "$TASK_FILE" "$RESULT_DIR/TASK.md"

# 5. Run eval scoring
echo ""
echo "▶ Scoring..."
node "$ROOT/evals/bin/score.mjs" "$TASK_ID" "$RESULT_DIR" "$JUDGE"

echo ""
echo "✅ Eval complete: $RESULT_DIR/score.json"
