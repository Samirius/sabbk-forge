#!/usr/bin/env bash
# run-pipeline.sh [--dry-run|--run|--dispatch] [pipeline-name]
# Multi-gear pipeline: gear 1 (orchestrator, e.g. Pi PM) writes a handoff BATON;
# gear 2 (coding agent) consumes it and runs its spec->plan->build->validate pipeline.
#   --dry-run  : print every gear's command + the baton (NO LLM). Full in-sandbox proof.
#   --run      : execute gear 1 (PM assign), then STOP at the dispatch checkpoint. (needs a provider key)
#   --dispatch : after approval, run gear 2 (the coding pipeline). (needs a provider key)
# Honors PI_PROVIDER / PI_MODEL_ID overrides (e.g. GLM).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---dry-run}"; NAME="${2:-demo}"
DEF="$ROOT/pipeline/$NAME.json"
[ -f "$DEF" ] || { echo "no pipeline definition: $DEF"; exit 2; }
PROV="${PI_PROVIDER:-anthropic}"; MODEL="${PI_MODEL_ID:-claude-haiku-4-5}"
field() { node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(d.steps[process.argv[2]][process.argv[3]]||""))' "$DEF" "$1" "$2"; }
PM_MSG="$(field 0 message)"; BATON="$(field 0 produces)"

echo "═══ pipeline: $NAME   ($PROV/$MODEL) ═══"
echo "── 0) validate wiring"; node "$ROOT/lib/validate.mjs" pipeline || exit 1
echo "── provision gears"
bash "$ROOT/bin/provision-agent.sh" pi-pm >/dev/null && bash "$ROOT/bin/provision-agent.sh" pi-coding-spike >/dev/null && echo "  ✓ pi-pm + pi-coding-spike provisioned"

case "$MODE" in
  --dry-run)
    echo "── GEAR 1  pi-pm[assign]  (cwd=repo root; tools read,write,ls):"
    echo "   cd $ROOT && npx pi --print --provider $PROV --model $MODEL --thinking low \\"
    echo "     --session-id pi-pm-pipeline --tools read,write,ls \\"
    echo "     --append-system-prompt \"\$(cat spike/workdir/pi-pm/AGENTS.md)\" \"<assign message from pipeline/$NAME.json>\""
    echo "   ⇒ baton produced: $BATON   (pi-pm → pi-coding-spike)"
    echo "── ⏸ CHECKPOINT (pi-pm: AlwaysConfirm) — approve assignment + dispatch"
    echo "── GEAR 2  pi-coding-spike  consumes the baton, runs its pipeline:"
    bash "$ROOT/bin/run-spike.sh" --dry-run pi-coding-spike | sed 's/^/     /'
    echo "✅ dry run complete — 2-gear handoff is wired (jig-validated) and ready. Live run needs a provider key."
    ;;
  --run)
    command -v npx >/dev/null 2>&1 || { echo "✗ npx missing — run npm install first"; exit 127; }
    ( cd "$ROOT" && npx pi --print --mode text --provider "$PROV" --model "$MODEL" --thinking low \
        --session-id pi-pm-pipeline --tools read,write,ls \
        --append-system-prompt "$(cat "$ROOT/spike/workdir/pi-pm/AGENTS.md")" "$PM_MSG" )
    echo "✓ GEAR 1 done — baton: $BATON"
    bash "$ROOT/bin/checkpoint.sh" request pi-coding-spike "Approve PM assignment + dispatch to the coding gear?"
    echo "   approve it, then:  bash bin/run-pipeline.sh --dispatch $NAME"
    ;;
  --dispatch)
    PI_PROVIDER="$PROV" PI_MODEL_ID="$MODEL" bash "$ROOT/bin/run-spike.sh" --run pi-coding-spike
    ;;
  *) echo "usage: bash bin/run-pipeline.sh --dry-run|--run|--dispatch [pipeline-name]"; exit 2 ;;
esac
