#!/usr/bin/env bash
# provision-agent.sh — stand up ONE Pi agent from its manifest entry.
# Usage: bash bin/provision-agent.sh <agent-id>
# Idempotent: re-running re-renders deterministically. Does NOT call an LLM.
set -euo pipefail

ID="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -z "$ID" ]; then echo "usage: bash bin/provision-agent.sh <agent-id>   (see manifest/agents.json)"; exit 2; fi

echo "🧬 Provisioning agent: $ID"

# 1. Validate the manifest + gear contract BEFORE doing anything (fail fast).
echo "  → validating manifest + gear contract"
node "$ROOT/lib/validate.mjs" manifest
node "$ROOT/lib/validate.mjs" gear

# 2. Render the pi-format AGENTS.md into the agent's working directory.
WORKDIR="$ROOT/spike/workdir/$ID"
mkdir -p "$WORKDIR"
node "$ROOT/lib/pi-adapter.mjs" render "$ID" "$WORKDIR/AGENTS.md"
echo "  ✓ rendered $WORKDIR/AGENTS.md"

# 3. Show the exact pi command that a live run WOULD use (dry — eyeball before running).
echo "  → example invocation (spec stage, dry):"
node "$ROOT/lib/pi-adapter.mjs" cmd "$ID" spec "Read ./AGENTS.md then spike/TASK.md; write SPEC.md." | sed 's/^/      /'

echo "✅ Provisioned $ID. AGENTS.md is ready; the agent boots into its role, playbook, gear contract, and boundaries."
echo "   Next: bash bin/run-spike.sh --dry-run $ID   (then --run once pi is installed)"
