#!/usr/bin/env bash
# prism — CRO pipeline
# Thin wrapper around forge.sh with CRO-specific defaults
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CMD="${1:-help}"
shift || true

case "$CMD" in
  scan|audit|plan|execute|measure|qualify|propose|close|review|define|document|enforce|evolve)
    exec bash "$ROOT/bin/forge.sh" "$CMD" "$@" --playbook cro
    ;;
  help|*)
    echo "prism — Sabbk CRO Pipeline"
    echo ""
    echo "Usage: prism <command> [args]"
    echo "See: playbooks/cro.md for full phase documentation"
    ;;
esac
