#!/usr/bin/env bash
# checkpoint.sh — the stop -> ask -> resume human-in-the-loop helper (terminate-save-resume).
# A checkpoint does NOT block a running process (that would burn tokens while idle). The agent
# writes a checkpoint file, the run ENDS, and a fresh run resumes once the human has answered.
#
#   request <agent-id> "<question>"      Write a CHECKPOINT file and stop. (Agent calls this.)
#   answer  <checkpoint-file> "<text>"   Record the human's decision. (Human/operator calls this.)
#   resume  <agent-id>                   Read the latest answered checkpoint and re-launch BUILD.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CMD="${1:-}"; ID="${2:-}"; ARG="${3:-}"

case "$CMD" in
  request)
    [ -z "$ID" ] && { echo "usage: checkpoint.sh request <agent-id> \"<question>\""; exit 2; }
    DIR="$ROOT/spike/workdir/$ID"; mkdir -p "$DIR"
    TS="$(date +%Y-%m-%d-%H%M%S)"; F="$DIR/CHECKPOINT-$TS.md"
    cat > "$F" <<EOF
---
type: checkpoint
from: $ID
to: samir
date: $(date +%Y-%m-%d\ %H:%M)
status: OPEN
---

# ⏸ CHECKPOINT — decision needed

**Question:** ${ARG:-Approve to proceed?}

**Options:** approve | revise | reject

**Context:** see PLAN.md in this directory.

## Decision
<!-- operator: replace OPEN above with ANSWERED, then run:
     bash bin/checkpoint.sh answer "$F" "approve|revise: <notes>" -->
EOF
    echo "⏸ CHECKPOINT written: $F"
    echo "   The run stops here (this costs nothing while waiting)."
    echo "   To continue:  bash bin/checkpoint.sh answer \"$F\" \"approve\"  &&  bash bin/checkpoint.sh resume $ID"
    exit 0
    ;;
  answer)
    F="$ID"  # second arg is the checkpoint file for `answer`
    [ -z "$F" ] || [ ! -f "$F" ] && { echo "usage: checkpoint.sh answer <checkpoint-file> \"<decision>\""; exit 2; }
    printf '\n**Decision:** %s\n**AnsweredAt:** %s\n' "${ARG:-approve}" "$(date +%Y-%m-%d\ %H:%M)" >> "$F"
    sed -i.bak 's/^status: OPEN/status: ANSWERED/' "$F" && rm -f "$F.bak"
    echo "✓ recorded decision on $F"
    ;;
  resume)
    [ -z "$ID" ] && { echo "usage: checkpoint.sh resume <agent-id>"; exit 2; }
    DIR="$ROOT/spike/workdir/$ID"
    F="$(grep -l 'status: ANSWERED' "$DIR"/CHECKPOINT-*.md 2>/dev/null | tail -1 || true)"
    [ -z "$F" ] && { echo "✗ no ANSWERED checkpoint in $DIR — answer one first."; exit 1; }
    DECISION="$(grep '^\*\*Decision:\*\*' "$F" | tail -1 | sed 's/^\*\*Decision:\*\* //')"
    echo "▶ resuming $ID with decision: $DECISION"
    case "$DECISION" in
      approve*) bash "$ROOT/bin/run-spike.sh" --resume-build "$ID" ;;
      *) echo "   decision was not 'approve' — not building. Update PLAN.md and re-run from PLAN stage." ;;
    esac
    ;;
  *) echo "usage: checkpoint.sh request|answer|resume ..."; exit 2 ;;
esac
