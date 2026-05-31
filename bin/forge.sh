#!/usr/bin/env bash
# forge — the lifecycle CLI
# Usage: forge <mode> <repo-path> [options]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load API key: env var > config file
if [ -z "${GLM_API_KEY:-}" ]; then
  if [ -f ~/.config/forge/zai-key ]; then
    export GLM_API_KEY="$(cat ~/.config/forge/zai-key)"
  fi
fi

node "$ROOT/lifecycle/lifecycle.mjs" "$@"
