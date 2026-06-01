#!/usr/bin/env bash
# funnel — Sales pipeline
# Thin wrapper around forge.sh with Sales-specific defaults
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CMD="${1:-help}"
shift || true

case "$CMD" in
  scan|audit|plan|execute|measure|qualify|propose|close|review|define|document|enforce|evolve)
    exec bash "$ROOT/bin/forge.sh" "$CMD" "$@" --playbook sales
    ;;
  help|*)
    echo "funnel — Sabbk Sales Pipeline"
    echo ""
    echo "Usage: funnel <command> [args]"
    echo "See: playbooks/sales.md for full phase documentation"
    ;;
esac
