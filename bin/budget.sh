#!/usr/bin/env bash
# budget.sh — thin wrapper over lib/budget.mjs (orchestration-level budget enforcement).
# guard  <agentId> <stateDir>        exit 3 if a cap would be exceeded, else count a turn
# record <agentId> <stateDir> <usd>  add cost to the cumulative total
# reset  <agentId> <stateDir>        zero the run state
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT/lib/budget.mjs" "$@"
