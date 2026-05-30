#!/usr/bin/env bash
# jig: every consecutive gear pair in each pipeline/*.json is wired — the upstream gear must
# `produce` a handoff TO the downstream gear, and the downstream gear must `consume` one FROM it.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT/lib/validate.mjs" pipeline
