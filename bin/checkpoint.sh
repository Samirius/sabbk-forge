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
CMD="${1:-}"

case "$CMD" in
  request)
    AGENT_ID="${2:-}"; QUESTION="${3:-Approve to proceed?}"
    [ -z "$AGENT_ID" ] && { echo "usage: checkpoint.sh request <agent-id> \"<question>\""; exit 2; }
    DIR="$ROOT/spike/workdir/$AGENT_ID"; mkdir -p "$DIR"
    TS="$(date +%Y-%m-%d-%H%M%S)"; CHECKPOINT_FILE="$DIR/CHECKPOINT-$TS.md"
    # FIX: SEC-002 — use quoted heredoc (<<'EOF') to prevent shell expansion.
    # Write the question safely via printf after the heredoc.
    cat > "$CHECKPOINT_FILE" <<'HEADER'
---
type: checkpoint
HEADER
    echo "from: $AGENT_ID" >> "$CHECKPOINT_FILE"
    echo "to: samir" >> "$CHECKPOINT_FILE"
    echo "date: $(date +%Y-%m-%d\ %H:%M)" >> "$CHECKPOINT_FILE"
    echo "status: OPEN" >> "$CHECKPOINT_FILE"
    cat >> "$CHECKPOINT_FILE" <<'FOOTER'
---

# ⏸ CHECKPOINT — decision needed

FOOTER
    # Write the question safely — printf %s does not interpret escape sequences
    printf '**Question:** %s\n\n**Options:** approve | revise | reject\n\n**Context:** see PLAN.md in this directory.\n\n## Decision\n' "$QUESTION" >> "$CHECKPOINT_FILE"
    cat >> "$CHECKPOINT_FILE" <<'TAIL'
<!-- operator: replace OPEN above with ANSWERED, then run:
     bash bin/checkpoint.sh answer "<this-file>" "approve|revise: <notes>" -->
TAIL
    echo "⏸ CHECKPOINT written: $CHECKPOINT_FILE"
    echo "   The run stops here (this costs nothing while waiting)."
    echo "   To continue:  bash bin/checkpoint.sh answer \"$CHECKPOINT_FILE\" \"approve\"  &&  bash bin/checkpoint.sh resume $AGENT_ID"
    exit 0
    ;;
  answer)
    CHECKPOINT_FILE="${2:-}"; DECISION="${3:-approve}"
    # FIX: CODE-005 — use descriptive variable names per subcommand
    [ -z "$CHECKPOINT_FILE" ] || [ ! -f "$CHECKPOINT_FILE" ] && { echo "usage: checkpoint.sh answer <checkpoint-file> \"<decision>\""; exit 2; }
    printf '\n**Decision:** %s\n**AnsweredAt:** %s\n' "$DECISION" "$(date +%Y-%m-%d\ %H:%M)" >> "$CHECKPOINT_FILE"
    sed -i.bak 's/^status: OPEN/status: ANSWERED/' "$CHECKPOINT_FILE" && rm -f "$CHECKPOINT_FILE.bak"
    echo "✓ recorded decision on $CHECKPOINT_FILE"
    ;;
  resume)
    AGENT_ID="${2:-}"
    [ -z "$AGENT_ID" ] && { echo "usage: checkpoint.sh resume <agent-id>"; exit 2; }
    DIR="$ROOT/spike/workdir/$AGENT_ID"
    CHECKPOINT_FILE="$(grep -l 'status: ANSWERED' "$DIR"/CHECKPOINT-*.md 2>/dev/null | sort -r | head -1 || true)"
    [ -z "$CHECKPOINT_FILE" ] && { echo "✗ no ANSWERED checkpoint in $DIR — answer one first."; exit 1; }
    DECISION="$(grep '^\*\*Decision:\*\*' "$CHECKPOINT_FILE" | tail -1 | sed 's/^\*\*Decision:\*\* //')"
    echo "▶ resuming $AGENT_ID with decision: $DECISION"
    case "$DECISION" in
      approve*) bash "$ROOT/bin/run-spike.sh" --resume-build "$AGENT_ID" ;;
      *) echo "   decision was not 'approve' — not building. Update PLAN.md and re-run from PLAN stage." ;;
    esac
    ;;
  *) echo "usage: checkpoint.sh request|answer|resume ..."; exit 2 ;;
esac
