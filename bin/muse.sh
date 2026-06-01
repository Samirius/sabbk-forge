#!/usr/bin/env bash
# muse — Marketing pipeline (scan → audit → plan → execute → measure)
# Thin wrapper around forge.sh with marketing-specific defaults
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Map muse commands to forge internals
CMD="${1:-help}"
shift || true

case "$CMD" in
  scan)
    exec bash "$ROOT/bin/forge.sh" scan "$@" --playbook marketing --context-type brand
    ;;
  audit)
    exec bash "$ROOT/bin/forge.sh" audit "$@" --playbook marketing --mode content-gaps
    ;;
  plan)
    exec bash "$ROOT/bin/forge.sh" plan "$@" --playbook marketing --mode campaign
    ;;
  execute)
    exec bash "$ROOT/bin/forge.sh" apply "$@" --playbook marketing
    ;;
  measure)
    echo "measure: not yet implemented (requires analytics integration)"
    exit 1
    ;;
  help|*)
    echo "muse — Sabbk Marketing Pipeline"
    echo ""
    echo "Usage: muse <command> [args]"
    echo ""
    echo "Commands:"
    echo "  scan <brand>       Scan brand assets and audience data"
    echo "  audit <brand>      Find content gaps and opportunities"
    echo "  plan <brand>       Generate content calendar and campaigns"
    echo "  execute <plan>     Generate content via pi-marketing"
    echo "  measure <brand>    Pull metrics and generate reports"
    ;;
esac
