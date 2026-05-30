# Budget Enforcement

> Run-cost is the real cost of the fleet (build is cheap). pi 0.78.0 exposes **no** `--max-turns`
> flag, so caps are enforced at the layer we own — the runner — borrowing Paperclip's budget
> hard-stops + AutoGen's max-turns.

Every agent declares a `budget` in the manifest (jig-required: `max_turns`, `max_usd`, `timeout_sec`):

| Cap | Meaning | Enforced by | Status |
|---|---|---|---|
| `timeout_sec` | per-stage wall-clock kill | `lib/pi-adapter.mjs` (spawn `timeout` + SIGTERM) | ✅ real, every spawned stage |
| `max_turns` | max gear/stage invocations per run | `lib/budget.mjs guard` (counter in `budget-state.json`); runner calls it before each stage and aborts (exit 3) | ✅ real |
| `max_usd` | cumulative cost ceiling | `lib/budget.mjs` (`record` cost after each measured stage; `guard` halts when exceeded) | ✅ when run measured (`--mode json`); text-mode runs don't track cost |

## How the runner uses it
`bin/run-spike.sh` resets budget state at the start of a run, then calls
`bash bin/budget.sh guard <agent> <workdir>` **before every stage** — if the next stage would exceed
`max_turns` (or recorded spend ≥ `max_usd`), it exits 3 and stops. The per-stage `timeout_sec` is applied
automatically by the adapter when it spawns pi.

## Recording cost (for the `max_usd` ceiling)
A measured run (e.g. the GLM measure flow, or any stage run with `--mode json`) parses usage and calls
`bash bin/budget.sh record <agent> <workdir> <usd>` to accumulate spend. The next `guard` halts the run
if the cumulative total has reached `max_usd`.

## Honesty note
`timeout_sec` and `max_turns` are enforced unconditionally. `max_usd` is only enforced on runs where cost
is recorded (measured/JSON mode) — a plain text-mode run still gets the turn + timeout caps but won't
track dollars. Wiring automatic cost capture into every run is a follow-up (P2). The single biggest
real-money lever remains **terminate-save-resume checkpoints** (waiting on a human costs nothing).
