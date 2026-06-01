#!/usr/bin/env bash
# identity — Brand pipeline
# Thin wrapper around forge.sh with Brand-specific defaults
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CMD="${1:-help}"
shift || true

case "$CMD" in
  scan|audit|plan|execute|measure|qualify|propose|close|review|define|document|enforce|evolve)
    exec bash "$ROOT/bin/forge.sh" "$CMD" "$@" --playbook brand
    ;;
  help|*)
    echo "identity — Sabbk Brand Pipeline"
    echo ""
    echo "Usage: identity <command> [args]"
    echo "See: playbooks/brand.md for full phase documentation"
    ;;
esac
