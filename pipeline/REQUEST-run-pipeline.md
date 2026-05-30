# Work Request — Generic, repo-aware run-pipeline (internal backlog item)

**objective:** Make `bin/run-pipeline.sh` fully data-driven so ANY `pipeline/<name>.json` runs as one
command, and add a **repo-build mode** for gears that modify the repo itself (not a sandbox workdir).
Today `run-pipeline.sh` hardcodes `pi-pm` + `pi-coding-spike`, and `--dispatch` only runs `run-spike` for
`pi-coding-spike`. Generalize it:
- Read each step's `{agent, stage, message, produces, consumes, delegate}` from `pipeline/<name>.json`.
- Provision each step's agent; run gear 1 (orchestrator) → checkpoint → the subsequent gear(s).
- For a coding gear support `delegate: "run-spike"` (workdir-scoped, today's behavior) AND
  `delegate: "repo-build"` (cwd = repo root, build tools, edits repo files on a `-ai` branch).

**acceptance_criteria:**
1. `bash bin/run-pipeline.sh --dry-run <name>` works for **demo**, **forge-observability**, and
   **build-run-pipeline** by reading step agents from the JSON — no hardcoded agent ids.
2. `--run <name>` runs gear 1 for the named pipeline's first agent; `--dispatch <name>` runs gear 2 per its `delegate`.
3. The `repo-build` delegate runs the coding gear from repo root (build tools) on a `-ai` branch.
4. `bash jigs/run-all.sh` stays green; the pipeline-wiring jig still validates every pipeline.
5. `VALIDATION.md` maps each acceptance criterion to evidence.

**boundaries:** sabbk-forge only; `-ai` branch + PR; `git ls-files` not `find`; keep the diff focused on
`bin/run-pipeline.sh` (+ small helpers if needed); don't break the existing demo flow.

Pi PM: assign to **pi-software**, cite `software/PLAYBOOK.md` + phase BUILD, then stop at the dispatch checkpoint.
