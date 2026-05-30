#!/usr/bin/env bash
# jig: every manifest entry has all required fields, valid tools, exact pinned version, and the
# mandatory git + secrets boundary rules. Delegates to the zero-dep node validator.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT/lib/validate.mjs" manifest
