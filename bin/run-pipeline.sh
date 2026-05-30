#!/usr/bin/env bash
# run-pipeline.sh [--dry-run|--run|--dispatch] [pipeline-name]
# Multi-gear pipeline: gear 1 (orchestrator, e.g. Pi PM) writes a handoff BATON;
# gear 2 (coding agent) consumes it and runs its spec->plan->build->validate pipeline.
#   --dry-run  : print every gear's command + the baton (NO LLM). Full in-sandbox proof.
#   --run      : execute gear 1 (orchestrator) for the named pipeline's first agent, then STOP at the dispatch checkpoint. (needs a provider key)
#   --dispatch : after approval, run gear 2 per its delegate field from pipeline JSON. (needs a provider key)
# Honors PI_PROVIDER / PI_MODEL_ID overrides (e.g. GLM).
# Data-driven: reads agents and delegate from pipeline/<name>.json (no hardcoded agent IDs).
# Delegate modes: "run-spike" (sandbox workdir) or "repo-build" (repo root on -ai branch).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---dry-run}"; NAME="${2:-demo}"
DEF="$ROOT/pipeline/$NAME.json"
[ -f "$DEF" ] || { echo "no pipeline definition: $DEF"; exit 2; }

# Validate JSON structure has at least 2 steps
STEP_COUNT="$(node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(d.steps?.length||0))' "$DEF")"
[ "$STEP_COUNT" -ge 2 ] || { echo "pipeline must have at least 2 steps"; exit 2; }

PROV="${PI_PROVIDER:-anthropic}"; MODEL="${PI_MODEL_ID:-claude-haiku-4-5}"
field() { node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(d.steps[process.argv[2]][process.argv[3]]||""))' "$DEF" "$1" "$2"; }

# Read agents and delegate from JSON (data-driven)
AGENT_0="$(field 0 agent)"
AGENT_1="$(field 1 agent)"
DELEGATE_1="$(field 1 delegate)"
STAGE_0="$(field 0 stage)"
STAGE_1="$(field 1 stage)"

# Validate required fields exist
[ -n "$AGENT_0" ] || { echo "step 0 missing agent field"; exit 2; }
[ -n "$AGENT_1" ] || { echo "step 1 missing agent field"; exit 2; }
[ -n "$DELEGATE_1" ] || { echo "step 1 missing delegate field"; exit 2; }

GEAR_0_MSG="$(field 0 message)"
GEAR_1_MSG="$(field 1 message)"
BATON="$(field 0 produces)"
CONSUMES_1="$(field 1 consumes)"

echo "═══ pipeline: $NAME   ($PROV/$MODEL) ═══"
echo "── 0) validate wiring"; node "$ROOT/lib/validate.mjs" pipeline || exit 1
echo "── provision gears"
bash "$ROOT/bin/provision-agent.sh" "$AGENT_0" >/dev/null && bash "$ROOT/bin/provision-agent.sh" "$AGENT_1" >/dev/null && echo "  ✓ $AGENT_0 + $AGENT_1 provisioned"

case "$MODE" in
  --dry-run)
    echo "── GEAR 1  ${AGENT_0}[${STAGE_0}]  (cwd=repo root; tools read,write,ls):"
    echo "   cd $ROOT && npx pi --print --provider $PROV --model $MODEL --thinking low \\"
    echo "     --session-id ${AGENT_0}-pipeline --tools read,write,ls \\"
    echo "     --append-system-prompt \"\$(cat spike/workdir/${AGENT_0}/AGENTS.md)\" \"<message from pipeline/${NAME}.json>\""
    echo "   ⇒ baton produced: $BATON   ($AGENT_0 → $AGENT_1)"
    echo "── ⏸ CHECKPOINT (${AGENT_0}: AlwaysConfirm) — approve assignment + dispatch"
    case "$DELEGATE_1" in
      run-spike)
        echo "── GEAR 2  ${AGENT_1}  consumes the baton, runs its pipeline via run-spike:"
        bash "$ROOT/bin/run-spike.sh" --dry-run "$AGENT_1" | sed 's/^/     /'
        ;;
      repo-build)
        echo "── GEAR 2  ${AGENT_1}  consumes the baton, runs from repo root on -ai branch:"
        echo "   cd $ROOT && git checkout -b ${NAME}-${AGENT_1}-ai"
        echo "   npx pi --print --mode text --provider $PROV --model $MODEL --thinking low \\"
        echo "     --session-id ${AGENT_1}-pipeline --tools write,bash,read,ls,git \\"
        echo "     --append-system-prompt \"\$(cat spike/workdir/${AGENT_1}/AGENTS.md)\" \"<message from pipeline/${NAME}.json>\""
        ;;
      *)
        echo "   unknown delegate: $DELEGATE_1"
        exit 1
        ;;
    esac
    echo "✅ dry run complete — 2-gear handoff is wired (jig-validated) and ready. Live run needs a provider key."
    ;;
  --run)
    command -v npx >/dev/null 2>&1 || { echo "✗ npx missing — run npm install first"; exit 127; }
    ( cd "$ROOT" && npx pi --print --mode text --provider "$PROV" --model "$MODEL" --thinking low \
        --session-id "${AGENT_0}-pipeline" --tools read,write,ls \
        --append-system-prompt "$(cat "$ROOT/spike/workdir/$AGENT_0/AGENTS.md")" "$GEAR_0_MSG" )
    echo "✓ GEAR 1 done — baton: $BATON"
    bash "$ROOT/bin/checkpoint.sh" request "$AGENT_1" "Approve assignment + dispatch to the coding gear?"
    echo "   approve it, then:  bash bin/run-pipeline.sh --dispatch $NAME"
    ;;
  --dispatch)
    case "$DELEGATE_1" in
      run-spike)
        PI_PROVIDER="$PROV" PI_MODEL_ID="$MODEL" bash "$ROOT/bin/run-spike.sh" --run "$AGENT_1"
        ;;
      repo-build)
        BRANCH_NAME="${NAME}-${AGENT_1}-ai"
        # Try to checkout or create the -ai branch
        if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME" 2>/dev/null; then
          git checkout "$BRANCH_NAME"
        else
          git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout main || git checkout master || { echo "✗ cannot create/checkout branch"; exit 1; }
        fi
        PI_PROVIDER="$PROV" PI_MODEL_ID="$MODEL" \
          npx pi --print --mode text --provider "$PROV" --model "$MODEL" --thinking low \
          --session-id "${AGENT_1}-pipeline" --tools write,bash,read,ls,git \
          --append-system-prompt "$(cat "$ROOT/spike/workdir/$AGENT_1/AGENTS.md")" "$GEAR_1_MSG"
        ;;
      *)
        echo "unknown delegate: $DELEGATE_1"
        exit 1
        ;;
    esac
    ;;
  *) echo "usage: bash bin/run-pipeline.sh --dry-run|--run|--dispatch [pipeline-name]"; exit 2 ;;
esac