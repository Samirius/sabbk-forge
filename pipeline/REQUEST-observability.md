# Work Request — Forge run observability (internal backlog item)

**objective:** Add run observability to sabbk-forge so we can see what every gear/stage did. Build
`lib/run-log.mjs` that appends one JSONL record per stage to `runs/<YYYY-MM-DD>.jsonl` with:
`{ ts, pipeline, agent, stage, exit, duration_ms, cost_usd? }` (cost only when a `--mode json` usage
file exists), plus `bin/forge-log.sh [N]` to print the most recent N runs as a readable table. Wire
`run-spike.sh` (and `run-pipeline.sh`) to call the logger around each stage.

**context:** internal forge improvement, straight off the backlog/gap report. No client involvement.

**acceptance_criteria:**
1. `lib/run-log.mjs` appends a valid JSONL record per stage to `runs/<date>.jsonl` with the fields above.
2. `bin/forge-log.sh [N]` prints the last N runs in a readable table (default N=20).
3. `run-spike.sh` calls the logger around each stage (start + end).
4. `bash jigs/run-all.sh` still passes; add the JSONL `runs/` dir to `.gitignore`.
5. `VALIDATION.md` shows each criterion with evidence (actual command output).

**boundaries:** write only inside `sabbk-forge` on a `-ai` branch; enumerate tracked files with
`git ls-files` (never `find`); keep the diff small and reviewable; no secrets.

Pi PM: assign this to **pi-software**, cite `software/PLAYBOOK.md` + phase BUILD, then stop at the dispatch checkpoint.
