# RUNBOOK — running the spike LIVE (on a VM with a real provider key)

The scaffold is **install-proven and dry-proven**. The one thing that cannot be done inside the build
sandbox is a live LLM run: the sandbox's `ANTHROPIC_API_KEY` returns `401 invalid x-api-key` (it is a
platform key, not valid for direct calls to `api.anthropic.com`). On a normal VM with a real key, the
live run is two commands.

## Prerequisites
- Steps 0–5 of `START-HERE.md` pass (Node ≥22.19, `npm install`, jigs green, dry-run clean).
- A **valid** provider key exported: `export ANTHROPIC_API_KEY=sk-ant-...`
  - Sanity check: `npx pi --print --no-tools --provider anthropic --model claude-haiku-4-5 --thinking off "Reply OK"` → prints `OK`. A `401` here means the key is wrong/placeholder.

## Run it
```bash
bash bin/run-spike.sh --run pi-coding-spike     # SPEC + PLAN, then stops at the ⏸ checkpoint
# review spike/workdir/pi-coding-spike/PLAN.md, then:
bash bin/checkpoint.sh answer spike/workdir/pi-coding-spike/CHECKPOINT-*.md "approve"
bash bin/checkpoint.sh resume pi-coding-spike   # BUILD + VALIDATE + jigs
```
Success = `build/no-trailing-whitespace.sh` exists and `VALIDATION.md` shows all acceptance criteria passing.

## Capturing the measured cost-per-run
For the first live run, add `--mode json` (the adapter default is `text`) to capture per-call token usage,
or read the provider dashboard for the run window. Record the total in `VALIDATION.md`. That measured
number is what feeds the go/no-go for provisioning agent #2.

## Cost estimate (until measured — order of magnitude, not a quote)
One spike run = 4 model calls (spec, plan, build, validate) on **claude-haiku-4-5**, sharing one session.
Assumptions: AGENTS.md+task+playbook context ≈ 3–6K input tokens, growing as the session accumulates;
~0.5–2K output per stage. Rough cumulative ≈ **30–80K input + 3–8K output** across the 4 calls.
On a cheap (Haiku-class) model that lands in the **low single-digit US-cents** range per spike run.
The fleet cost scales with: # agents × loop iterations × model tier — which is why the budget hard-stops,
`max_turns`, cheap-by-default, and terminate-save-resume controls (see the Phase-1 doc §5) matter more
than this one number.
