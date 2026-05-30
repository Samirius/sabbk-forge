#!/usr/bin/env bash
# run-spike.sh — one pipeline hop for ONE coding agent: spec -> plan -> [human checkpoint] -> build -> validate.
# Modes:
#   --dry-run <id>       Print the exact pi command for every stage. NO LLM call. Works with or without pi.
#   --run <id>           Live: run SPEC + PLAN, then STOP at the human checkpoint. Requires pi + provider key.
#   --resume-build <id>  Live: run BUILD + VALIDATE after the checkpoint was approved. (called by checkpoint.sh resume)
#   --lite               Memory-constrained VMs: BUILD + VALIDATE drop the bash tool (build_lite/validate_lite) to avoid OOM.
#                        The orchestrator still runs the jigs mechanically at STAGE 6, so validation coverage isn't lost.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-}"; ID="${2:-}"
[ -z "$MODE" ] || [ -z "$ID" ] && { echo "usage: bash bin/run-spike.sh --dry-run|--run|--resume-build <agent-id> [--lite]"; exit 2; }
WORKDIR="$ROOT/spike/workdir/$ID"
LITE=0; for a in "$@"; do [ "$a" = "--lite" ] && LITE=1; done
BUILD_STAGE="build"; [ "$LITE" = "1" ] && BUILD_STAGE="build_lite"               # write-only build (no bash) for small VMs
VALIDATE_STAGE="validate"; [ "$LITE" = "1" ] && VALIDATE_STAGE="validate_lite"   # inspection-only validate (no bash); jigs still run at STAGE 6

M_SPEC="Read ./AGENTS.md (your contract) and ./TASK.md. Write ./SPEC.md: restate the task as a crisp spec with explicit, checkable acceptance criteria. Do NOT write code yet."
M_PLAN="Read ./SPEC.md. Write ./PLAN.md: numbered build steps, exactly which files you will create, and how each acceptance criterion will be validated."
M_BUILD="Read ./PLAN.md. Execute it: create the deliverable under ./build/ exactly as planned. Stay strictly inside this directory."
M_VALID="Verify ./build/ against ./SPEC.md acceptance criteria. Write ./VALIDATION.md: list each criterion with pass/fail and the evidence."

pi_present() { [ -n "${PI_BIN:-}" ] || [ -x "$ROOT/node_modules/.bin/pi" ] || command -v pi >/dev/null 2>&1; }
adapter() { node "$ROOT/lib/pi-adapter.mjs" "$@"; }
logger() { node "$ROOT/lib/run-log.mjs" --pipeline spike --agent "$ID" "$1" "$2" "$3" "$4" 2>/dev/null || true; }

if [ "$MODE" = "--dry-run" ]; then
  echo "🔎 DRY RUN for $ID — these are the exact pi invocations (no LLM called):"
  bash "$ROOT/bin/provision-agent.sh" "$ID" >/dev/null
  echo; echo "STAGE 1 SPEC:";  adapter cmd "$ID" spec  "$M_SPEC"
  echo; echo "STAGE 2 PLAN:";  adapter cmd "$ID" plan  "$M_PLAN" --resume
  echo; echo "STAGE 3 ⏸ CHECKPOINT (AlwaysConfirm): bash bin/checkpoint.sh request $ID \"Approve this PLAN to proceed to BUILD?\""
  echo; echo "STAGE 4 BUILD ($BUILD_STAGE):";  adapter cmd "$ID" "$BUILD_STAGE" "$M_BUILD" --resume
  echo; echo "STAGE 5 VALIDATE ($VALIDATE_STAGE):"; adapter cmd "$ID" "$VALIDATE_STAGE" "$M_VALID" --resume
  echo; echo "STAGE 6 jigs: bash jigs/run-all.sh"
  echo; echo "✅ dry run complete — every step is deterministic and copy-pasteable."
  exit 0
fi

if ! pi_present; then
  echo "✗ pi is not installed (npm registry was blocked at build time)."
  echo "  Install per START-HERE step 1, then re-run. Showing the dry run instead:"
  exec bash "$ROOT/bin/run-spike.sh" --dry-run "$ID"
fi

mkdir -p "$WORKDIR/build"
cp -f "$ROOT/spike/TASK.md" "$WORKDIR/TASK.md"

if [ "$MODE" = "--run" ]; then
  bash "$ROOT/bin/provision-agent.sh" "$ID"
  bash "$ROOT/bin/budget.sh" reset "$ID" "$WORKDIR"
  bash "$ROOT/bin/budget.sh" guard "$ID" "$WORKDIR" || exit 3
  logger --stage spec --start
  echo "▶ STAGE 1 SPEC";  adapter spawn "$ID" spec "$M_SPEC"; logger --stage spec --end $?
  bash "$ROOT/bin/budget.sh" guard "$ID" "$WORKDIR" || exit 3
  logger --stage plan --start
  echo "▶ STAGE 2 PLAN";  adapter spawn "$ID" plan "$M_PLAN" --resume; logger --stage plan --end $?
  echo "⏸ STAGE 3 CHECKPOINT"; bash "$ROOT/bin/checkpoint.sh" request "$ID" "Approve this PLAN to proceed to BUILD?"
  echo "   (run stopped at the human gate — approve, then: bash bin/checkpoint.sh resume $ID)"
  exit 0
fi

if [ "$MODE" = "--resume-build" ]; then
  bash "$ROOT/bin/budget.sh" guard "$ID" "$WORKDIR" || exit 3
  logger --stage "${BUILD_STAGE}" --start
  echo "▶ STAGE 4 BUILD ($BUILD_STAGE)";    adapter spawn "$ID" "$BUILD_STAGE" "$M_BUILD" --resume; logger --stage "${BUILD_STAGE}" --end $?
  bash "$ROOT/bin/budget.sh" guard "$ID" "$WORKDIR" || exit 3
  logger --stage "${VALIDATE_STAGE}" --start
  echo "▶ STAGE 5 VALIDATE ($VALIDATE_STAGE)"; adapter spawn "$ID" "$VALIDATE_STAGE" "$M_VALID" --resume; logger --stage "${VALIDATE_STAGE}" --end $?
  echo "▶ STAGE 6 jigs";     bash "$ROOT/jigs/run-all.sh" || true
  echo "✅ spike pipeline complete for $ID. Review ./spike/workdir/$ID/VALIDATION.md."
  exit 0
fi

echo "unknown mode: $MODE"; exit 2
