# Concurrency & Lane Design

> How multiple agents run in parallel without starving the human checkpoint or corrupting shared state.

## Problem

When Pi PM dispatches to 3 gears simultaneously (e.g., Pi Marketing + Pi Design + Pi Software), we need:
1. No two agents write to the same file
2. Human checkpoints don't block forever (agent waits = cost)
3. Failed agents don't poison the pipeline
4. Budget across all concurrent runs stays bounded

## Architecture: Lanes

A **lane** is an isolated execution context for one gear in one pipeline run.

```
Lane = {
  id: string           # e.g., "banafah-2026-06-01-marketing"
  gear: agent_id       # which agent runs in this lane
  pipeline: run_id     # parent pipeline
  workspace: path      # isolated workdir (never overlaps)
  session: session_id  # pi --session-id (forkable, resumable)
  budget: {
    max_usd: number    # per-lane cap
    max_turns: number
    timeout_sec: number
  }
  state: "pending" | "running" | "checkpoint" | "done" | "failed"
}
```

## Rules

### 1. Workspace isolation
Each lane writes to `sabbk-clients/<client>/runs/<run_id>/<gear_id>/`. Never to the client root directly.
On completion, a **merge step** (human or PM) moves deliverables from the lane workspace to the client tree.

### 2. Git branch isolation
Each lane gets its own branch: `<client>-<run_id>-<gear_id>-ai`. No shared branches during execution.
PM merges branches after all lanes complete (or after each lane if sequential).

### 3. Checkpoint coordination
- `AlwaysConfirm` checkpoints: agent terminates (saves session), PM surfaces the question to human
- Human answers → PM resumes the lane (`--session-id` + `--resume`)
- While one lane waits at checkpoint, other lanes continue
- **Max concurrent lanes: 3** (configurable, bounded by RAM + token budget)

### 4. Budget aggregation
- Pipeline-level budget cap = sum of all lane budgets + PM overhead
- **This prevents N×lane budget overflow** — if 3 lanes each have $0.80, the pipeline cap is $2.40 + $0.20 PM = $2.60 max
- Per-lane budget is independent (one lane spending all its budget doesn't starve others)
- PM monitors aggregate spend; kills all lanes if pipeline budget exceeded

### 5. Failure handling
- Lane fails → PM logs it, other lanes continue
- Critical lane fails (e.g., Pi Software in a build pipeline) → PM may pause dependent lanes
- Non-critical lane fails (e.g., Pi Design creative variation) → PM continues, notes in report
- All lane sessions are saved for post-mortem

## Concurrency profiles

| Profile | Max concurrent | When to use |
|---|---|---|
| `sequential` | 1 | First run, debugging, budget-tight |
| `parallel-2` | 2 | Normal operations (e.g., Marketing + Software) |
| `parallel-3` | 3 | Complex engagements with independent workstreams |
| `full-fleet` | 7 | Batch reporting (all managers report in parallel) |

Default: `parallel-2`.

## Implementation path

- **v1 (now):** Sequential only. run-pipeline.sh runs one gear at a time.
- **v2:** `parallel-2` mode. PM dispatches to 2 lanes using background processes + session files.
- **v3:** Full lane manager. PM tracks lane state, handles checkpoint coordination, aggregates results.

## Session file format

Each lane's state is a JSON file at `runs/<run_id>/lanes/<gear_id>.json`:

```json
{
  "id": "banafah-2026-06-01-marketing",
  "gear": "pi-marketing",
  "pipeline": "banafah-2026-06-01",
  "workspace": "sabbk-clients/banafah/runs/2026-06-01/marketing/",
  "session": "banafah-marketing-0601",
  "state": "running",
  "started_at": "2026-06-01T08:30:00+03:00",
  "budget_used_usd": 0.12,
  "turns_used": 3,
  "pid": null
}
```
