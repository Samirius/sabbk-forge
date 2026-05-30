#!/usr/bin/env bash
# install.sh — stand up sabbk-forge on a fresh VM. Idempotent. Safe to re-run.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "🔧 sabbk-forge installer"

# 1. Node >= 22.19
command -v node >/dev/null 2>&1 || { echo "✗ Node not found — install Node >= 22.19 first"; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || { echo "✗ Node >= 22 required (have $(node -v))"; exit 1; }
echo "  ✓ node $(node -v)"

# 2. pinned pi
echo "  → installing pinned pi (npm)…"
npm ci >/dev/null 2>&1 || npm install >/dev/null 2>&1
echo "  ✓ pi $(npx pi --version 2>/dev/null || echo '(version check failed — see npm output)')"

# 3. validate the kit
echo "  → running jigs…"
bash "$ROOT/jigs/run-all.sh"

cat <<'EOF'

✅ sabbk-forge is ready.
Next:
  1. Export a provider key:  export ANTHROPIC_API_KEY=sk-ant-...   (or set up GLM per RUNBOOK-live.md)
  2. Offline sanity:         bash bin/run-spike.sh --dry-run pi-coding-spike
  3. Live single agent:      bash bin/run-spike.sh --run pi-coding-spike   (then checkpoint approve + resume)
  4. Multi-gear pipeline:    bash bin/run-pipeline.sh --dry-run demo
See START-HERE.md (on-ramp), FORGE-OPERATIONS.md (daily ops), AI-EXECUTOR-BRIEF.md (hand to an AI assistant).
EOF
