#!/usr/bin/env bash
# canvas — Design pipeline
# Thin wrapper around forge.sh with Design-specific defaults
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CMD="${1:-help}"
shift || true

case "$CMD" in
  scan|audit|plan|execute|measure|qualify|propose|close|review|define|document|enforce|evolve)
    exec bash "$ROOT/bin/forge.sh" "$CMD" "$@" --playbook design
    ;;
  help|*)
    echo "canvas — Sabbk Design Pipeline"
    echo ""
    echo "Usage: canvas <command> [args]"
    echo "See: playbooks/design.md for full phase documentation"
    ;;
esac
