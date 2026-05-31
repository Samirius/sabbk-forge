# Forge Ops Guide — One Page

> How to run the Sabbk Forge. Print this and keep it next to your terminal.

## Quick Start

```bash
git clone https://github.com/Samirius/sabbk-forge.git && cd sabbk-forge
npm ci                              # installs pi 0.78.0
bash jigs/run-all.sh                # validate everything (should be 7/7 ✅)
```

## The Agents

| ID | Role | Model |
|---|---|---|
| pi-pm | Orchestrator — assigns work, runs checkpoints | Smart (sonnet) |
| pi-sales | Proposals & contracts | Smart |
| pi-brand | Brand voice & visual system | Smart |
| pi-marketing | Strategy, content, media, reporting (Ogilvy) | Smart |
| pi-cro | Conversion audits & A/B tests | Smart |
| pi-design | UI/UX & ad creatives | Smart |
| pi-software | Code — spec→plan→build→validate | Smart plan / Cheap build |
| pi-coding-spike | Demo coding agent | Cheap (haiku) |

## Running a Pipeline

### One-shot spike (internal task)
```bash
bash bin/run-spike.sh                    # runs all 6 stages on pi-coding-spike
```

### 2-gear pipeline (PM → coding)
```bash
bash bin/provision-agent.sh pi-pm        # boot PM
# PM writes INBOX-handoff.md to the target gear
bash bin/run-pipeline.sh <request.md>    # PM assigns → gear executes
```

### With GLM (cheap)
```bash
export GLM_API_KEY=your_key
export PI_PROVIDER=glm PI_MODEL_ID=glm-4.6
bash bin/run-spike.sh
```

## Key Files

| What | Where |
|---|---|
| Agent roster | `manifest/agents.json` |
| Sub-agent definitions | `manifest/sub-agents.md` |
| Agent boot (AGENTS.md) | `spike/workdir/<agent>/AGENTS.md` |
| Ogilvy's brain | `spike/workdir/pi-marketing/DOMAIN.md` |
| Stack templates | `templates/stacks/{node-ts,python,astro}/` |
| Project templates | `templates/projects/{node-ts,python,astro}/` |
| SOP templates | `templates/sop/{SPEC,PLAN,VALIDATION}.template.md` |
| Run logs | `runs/` (JSONL per stage) |
| Jigs | `jigs/` (7 validators) |

## Before Every Push

```bash
bash jigs/run-all.sh    # MUST pass before merging
```

## Cost Reference

| Model | Per-run (4 stages) | Notes |
|---|---|---|
| GLM-4.6 | ~$0.0017 | ~0.17¢, near-free grunt |
| Claude Haiku | ~$0.003 | Good build/validate tier |
| Claude Sonnet | ~$0.02 | Planning & orchestration |

## Troubleshooting

| Problem | Fix |
|---|---|
| `pi: command not found` | `npm ci` (installs pi to node_modules/.bin) |
| OOM on bash tool | Use `--lite` mode (read,edit,write only, no bash) |
| `--resume` opens picker | Use `--session-id` instead (PR #2 fix) |
| 401 from provider | Check API key in env (GLM) or `~/.pi/agent/models.json` |
| Jig fails | Read the FAIL line — it tells you exactly what's wrong |

## Repository Layout

```
sabbk-forge/
├── manifest/          # Agent roster + sub-agents + schema
├── templates/         # Stack, project, and SOP templates
├── protocols/         # Sharing, checkpoint, budget, concurrency
├── lib/               # pi-adapter, validate, run-log
├── bin/               # provision-agent, run-spike, run-pipeline, measure-cost
├── jigs/              # 7 validators (run-all.sh)
├── spike/             # Demo task + workdir
├── pipeline/          # Request templates for PM
├── runs/              # Generated run logs (gitignored)
└── installer/         # Forge setup step for workshop
```

## Four Repos (the Sabbk ecosystem)

| Repo | Purpose |
|---|---|
| `agent-brain` | Shared memory, handoffs, agent identities |
| `sabbk-workshop` | Methodology, playbooks, installer |
| `sabbk-clients` | Client deliverables (Banafah portal, etc.) |
| `sabbk-co` | Company content (sabbk.com) |
| `sabbk-forge` | Pi agent provisioning & pipeline runner |
