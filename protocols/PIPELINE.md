# Multi-Gear Pipelines

> Agents are gears. A **pipeline** chains them: one gear's output handoff is the next gear's input.
> Defined in `pipeline/<name>.json`; run with `bin/run-pipeline.sh`; wiring enforced by a jig.

## Definition (`pipeline/<name>.json`)
```json
{ "name": "demo", "steps": [
  { "agent": "pi-pm",           "stage": "assign",   "produces": "<baton path>", "message": "..." },
  { "agent": "pi-coding-spike", "stage": "pipeline", "consumes": "<baton path>", "delegate": "run-spike" }
] }
```

## The wiring rule (jig-enforced: `jigs/pipeline-wiring-valid.sh`)
For every consecutive pair A → B in a pipeline:
- A's manifest `gear.produces` MUST contain a `handoff` with `to: B`, **and**
- B's manifest `gear.consumes` MUST contain a `handoff` with `from: A`.

If the baton doesn't line up, the jig fails — you cannot wire a pipeline with a mismatched handoff.

## The baton
A real Sabbk handoff file (schema: `agent-brain/handoffs/TEMPLATE.md`) that gear A writes and gear B
reads. It travels on the git/handoff bus (see `protocols/SHARING.md`) and must cite **Playbook + Phase**.

## Checkpoints in a pipeline
Each gear keeps its own `gear.checkpoints`. The orchestrator (Pi PM) typically holds an
`AlwaysConfirm` gate **after assignment, before dispatch** — so a human approves what gets sent
to which gear before any downstream work (and tokens) are spent. Uses the same terminate-save-resume
flow as `protocols/CHECKPOINT.md`.

## Run it
```
bash bin/run-pipeline.sh --dry-run demo     # prints both gears + the baton (no LLM) — the offline proof
bash bin/run-pipeline.sh --run demo         # gear 1 (PM assign) → stops at the dispatch checkpoint  (needs a key)
bash bin/run-pipeline.sh --dispatch demo    # after approval → gear 2 (coding pipeline)              (needs a key)
```
Add `PI_PROVIDER=glm PI_MODEL_ID=glm-4.6` to run the whole pipeline on GLM.
