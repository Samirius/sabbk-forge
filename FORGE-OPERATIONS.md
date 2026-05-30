# Forge Operations — one page

How to run the Sabbk forge day-to-day. (For the on-ramp, see `START-HERE.md`; to hand the test to an AI
assistant, see `AI-EXECUTOR-BRIEF.md`.)

## What this is
`sabbk-forge` is the **execution engine** that boots Sabbk's Tier-2 Pi agents on the `earendil-works/pi`
runtime from one manifest, with git+handoff shared memory and stop→ask→resume human checkpoints. It
consumes the other repos as inputs (playbooks/jigs from `sabbk-workshop`, identities/handoffs from
`agent-brain`).

## Stand it up (fresh VM)
```
git clone https://github.com/Samirius/sabbk-forge.git && cd sabbk-forge
bash install.sh                      # Node check → npm ci → jigs
export ANTHROPIC_API_KEY=sk-ant-...  # or set up GLM (RUNBOOK-live.md)
```

## The daily operations
| Do this | Command |
|---|---|
| See the roster | `node -e 'console.log(require("./manifest/agents.json").agents.map(a=>a.id).join("\n"))'` |
| Validate everything | `bash jigs/run-all.sh` |
| Provision an agent | `bash bin/provision-agent.sh <agent-id>` |
| Run one coding agent | `bash bin/run-spike.sh --run pi-coding-spike` → approve checkpoint → `bash bin/checkpoint.sh resume pi-coding-spike` |
| Run a multi-gear pipeline | `bash bin/run-pipeline.sh --run demo` → approve → `bash bin/run-pipeline.sh --dispatch demo` |
| Run cheaper (GLM) | prefix with `PI_PROVIDER=glm PI_MODEL_ID=glm-4.6` (set up `~/.pi/agent/models.json`) |

## The roster (8 agents)
Orchestrator **pi-pm**; domains **pi-sales, pi-brand, pi-marketing (Ogilvy), pi-cro, pi-design,
pi-software**; demo coding gear **pi-coding-spike**. Manager-only today; specialist sub-agents added under
load. Full map + backlog: the "Sabbk Forge — Agent Roster, Flow Map, Backlog & Gap Report" doc.

## Guardrails that are always on
- **Checkpoints**: agents stop at `AlwaysConfirm`/`ConfirmRisky` gates and wait (terminate-save-resume — waiting costs nothing). `protocols/CHECKPOINT.md`.
- **Budget**: per-stage wall-clock timeout + `max_turns`/`max_usd` hard-stops. `protocols/BUDGET.md`.
- **Wiring**: a pipeline can't be wired with a mismatched baton (`jigs/pipeline-wiring-valid.sh`).
- **Lanes**: memory→agent-brain, methodology→sabbk-workshop, deliverables→sabbk-clients, company→sabbk-co, engine→here. No client/Banafah work runs through the spike/demo agents.

## Run-cost reality
Building is cheap; running the fleet is the spend. Measured: one coding run on GLM-4.6 ≈ **$0.0017**.
Levers: cheap-by-default models, `max_turns`, terminate-save-resume checkpoints (no idle spend). Always
measure cost-per-run on a new agent before scaling it.

## Hand it to an AI assistant
Point any capable assistant (e.g. Hermes) at `AI-EXECUTOR-BRIEF.md` — it's a deterministic, self-verifying
runbook to clone, install, run the spike, and report results + cost.
