#!/usr/bin/env bash
# forge — the lifecycle CLI
#
# Modes:
#   forge scan     <repo-path>                     — Scan repo, build module index (no LLM)
#   forge audit    <repo-path> [focus]             — Scan + audit: find issues, produce plan
#   forge plan     <repo-name> apply <report>      — Create fix plan from audit report
#   forge plan     <repo-name> build <spec>        — Create build plan from spec
#   forge plan     <repo-name> refactor <scope>    — Create refactor plan
#   forge apply    <plan.json> [batch-ids...]      — Execute batches from a plan
#   forge status   <repo-path>                     — Show forge state for a repo
#   forge history  <repo-name>                     — Show plans and results
#
# Flags (for apply):
#   --dry-run        Print commands, don't execute
#   --auto-approve   Skip human checkpoints
#
# Environment:
#   GLM_API_KEY      Required for audit/plan/apply (LLM calls)
#   FORGE_DRY_RUN    Set to "1" for global dry-run
#
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load API key: env var > config file
if [ -z "${GLM_API_KEY:-}" ]; then
  if [ -f ~/.config/forge/zai-key ]; then
    export GLM_API_KEY="$(cat ~/.config/forge/zai-key)"
  fi
fi

export FORGE_ROOT="$ROOT"

MODE="${1:-}"; shift || true
[ -z "$MODE" ] && { echo "usage: forge <scan|audit|plan|apply|status|history> ..."; exit 2; }

case "$MODE" in
  scan)
    # forge scan <repo-path>
    REPO="${1:-}"; [ -z "$REPO" ] && { echo "usage: forge scan <repo-path>"; exit 2; }
    node "$ROOT/lib/scanner.mjs" "$REPO"
    ;;

  audit)
    # forge audit <repo-path> [focus]
    REPO="${1:-}"; [ -z "$REPO" ] && { echo "usage: forge audit <repo-path> [focus]"; exit 2; }
    FOCUS="${2:-}"
    REPO_NAME="$(basename "$(cd "$REPO" && pwd)")"

    # Step 1: Scan (no LLM, fast)
    echo "═══ Step 1: Scan ═══"
    node "$ROOT/lib/scanner.mjs" "$REPO"

    # Step 2: Plan (LLM call with real code)
    echo ""
    echo "═══ Step 2: Audit ═══"
    node "$ROOT/lib/planner.mjs" audit "$REPO_NAME" $([ -n "$FOCUS" ] && echo "$FOCUS")

    echo ""
    echo "✅ Audit complete. Check:"
    echo "   lifecycle/context/$REPO_NAME/index.md     (repo map)"
    echo "   lifecycle/plans/$REPO_NAME/AUDIT-REPORT.md (findings)"
    echo "   lifecycle/plans/$REPO_NAME/audit-*.json    (batched plan)"
    ;;

  plan)
    # forge plan <repo-name> <apply|build|refactor> <source>
    REPO_NAME="${1:-}"; SUBMODE="${2:-}"; SOURCE="${3:-}"
    [ -z "$REPO_NAME" ] || [ -z "$SUBMODE" ] || [ -z "$SOURCE" ] && {
      echo "usage: forge plan <repo-name> apply|build|refactor <source-file>";
      exit 2;
    }
    node "$ROOT/lib/planner.mjs" "$SUBMODE" "$REPO_NAME" "$SOURCE"
    ;;

  apply)
    # forge apply <plan.json> [batch-ids...] [--dry-run] [--auto-approve]
    PLAN="${1:-}"; [ -z "$PLAN" ] && { echo "usage: forge apply <plan.json> [batch-ids...] [--dry-run] [--auto-approve]"; exit 2; }
    shift || true
    node "$ROOT/lib/executor.mjs" "$PLAN" "$@"
    ;;

  status)
    # forge status <repo-path>
    REPO="${1:-}"; [ -z "$REPO" ] && { echo "usage: forge status <repo-path>"; exit 2; }
    REPO_NAME="$(basename "$(cd "$REPO" && pwd)")"
    CTX="$ROOT/lifecycle/context/$REPO_NAME"

    if [ -d "$CTX" ]; then
      echo ""
      echo "📋 Forge Status: $REPO_NAME"
      echo "─────────────────────────"
      cat "$CTX/index.md" 2>/dev/null || echo "(index missing)"
    else
      echo "📋 No forge context for $REPO_NAME. Run: forge scan $REPO"
    fi

    # Show plans
    PLANS_DIR="$ROOT/lifecycle/plans/$REPO_NAME"
    if [ -d "$PLANS_DIR" ]; then
      echo ""
      echo "## Plans"
      for f in "$PLANS_DIR"/*.json; do
        [ -f "$f" ] || continue
        PLAN_ID="$(basename "$f" .json)"
        BATCHES="$(node -e "const p=require('$f'); console.log(p.batches?.length||0+' batches')" 2>/dev/null || echo "?")"
        PROGRESS="$PLANS_DIR/progress.json"
        if [ -f "$PROGRESS" ]; then
          PASSED="$(node -e "const p=require('$PROGRESS'); console.log(Object.values(p.batches).filter(b=>b.status==='passed').length)" 2>/dev/null || echo "?")"
          FAILED="$(node -e "const p=require('$PROGRESS'); console.log(Object.values(p.batches).filter(b=>b.status==='failed').length)" 2>/dev/null || echo "?")"
          echo "  - $PLAN_ID: $BATCHES ($PASSED passed, $FAILED failed)"
        else
          echo "  - $PLAN_ID: $BATCHES (not started)"
        fi
      done
    fi
    ;;

  history)
    # forge history <repo-name>
    REPO_NAME="${1:-}"; [ -z "$REPO_NAME" ] && { echo "usage: forge history <repo-name>"; exit 2; }
    PLANS_DIR="$ROOT/lifecycle/plans/$REPO_NAME"
    if [ -d "$PLANS_DIR" ]; then
      echo ""
      echo "📜 Forge History: $REPO_NAME"
      for f in "$PLANS_DIR"/*.json; do
        [ -f "$f" ] || continue
        echo ""
        echo "── $(basename "$f") ──"
        node -e "const p=require('$f'); console.log('Mode:', p.mode); console.log('Batches:', p.batches?.length||0); console.log('Created:', p.created||'?')" 2>/dev/null
      done
      if [ -f "$PLANS_DIR/progress.json" ]; then
        echo ""
        echo "── Progress ──"
        node -e "
          const p=require('$PLANS_DIR/progress.json');
          for (const [id, b] of Object.entries(p.batches)) {
            const icon = b.status === 'passed' ? '✅' : b.status === 'failed' ? '❌' : b.status === 'skipped' ? '⊘' : '⏳';
            console.log(icon, id, b.status);
          }
        " 2>/dev/null
      fi
      if [ -f "$PLANS_DIR/SUMMARY.md" ]; then
        echo ""
        cat "$PLANS_DIR/SUMMARY.md"
      fi
    else
      echo "No history for $REPO_NAME"
    fi
    ;;

  *)
    echo "forge — the sabbk-forge lifecycle CLI"
    echo ""
    echo "Modes:"
    echo "  scan      <repo-path>                   Scan repo, build module index"
    echo "  audit     <repo-path> [focus]           Scan + audit (find issues → plan)"
    echo "  plan      <repo> apply|build|refactor   Create plan from source"
    echo "  apply     <plan.json> [batch-ids]       Execute batches from plan"
    echo "  status    <repo-path>                   Show repo state"
    echo "  history   <repo-name>                   Show plans and results"
    echo ""
    echo "Flags (apply):"
    echo "  --dry-run        Print commands only"
    echo "  --auto-approve   Skip checkpoints"
    echo ""
    echo "Examples:"
    echo "  forge audit ~/myhr"
    echo "  forge audit ~/myhr security"
    echo "  forge apply plan.json"
    echo "  forge apply plan.json B001 B002 --auto-approve"
    exit 2
    ;;
esac
