#!/usr/bin/env bash
# jig: every agent has a well-formed gear contract — non-empty consumes[]/produces[], typed
# artifacts with paths, handoffs that declare must_cite[], and at least one checkpoint with a valid policy.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT/lib/validate.mjs" gear
