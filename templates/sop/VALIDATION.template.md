# VALIDATION — <task name>

> Produced by the **Validate** stage. One row per acceptance criterion, each with real evidence.

| AC | Status | Evidence (command + observed output) |
|----|--------|--------------------------------------|
| AC-1 | PASS / FAIL | ... |
| AC-2 | PASS / FAIL | ... |

## Jigs
- `bash jigs/run-all.sh` → <result>
- (per-stack build/test jig, if any) → <result>

## Measured cost (if run with --mode json)
- input / output tokens, cost → <values>

## Verdict
**PASS / FAIL** — <one line; if FAIL, what to fix and which stage to re-run>
