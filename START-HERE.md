# START HERE — stand up your first Pi agent

> You are an AI assistant on a fresh VM. Follow these steps **in order**. After each step there is a
> **Verify:** line — confirm it before moving on. If a Verify fails, stop and fix that step; do not continue.
> You do not need to read any other document first. This file is the whole on-ramp.

This repo (`sabbk-forge`) is the **engine** that boots Sabbk's Pi agents on the `earendil-works/pi`
runtime. It reads one manifest, renders each agent's `AGENTS.md`, and runs a spec → plan → build →
validate pipeline with a human checkpoint. The spike below proves ONE agent end to end.

---

### Step 0 — Prerequisites
Confirm the machine has Node ≥ 22.19, git, and a provider API key exported (for the default agent that
is `ANTHROPIC_API_KEY`). Run: `node --version && git --version && [ -n "$ANTHROPIC_API_KEY" ] && echo "key present"`
**Verify:** Node prints v22.19 or higher, git prints a version, and you see `key present`.

### Step 1 — Install pi (pinned)
Install the exact pinned version from `package.json`: `npm install`
**Verify:** `npx pi --version` prints `0.78.0` (the version pinned in `package.json` and the manifest).

### Step 2 — Confirm pi's CLI and model id
The adapter (`lib/pi-adapter.mjs`) depends on specific flags and on the model id in the manifest.
Run `npx pi --help` and `npx pi --list-models haiku`.
**Verify:** the flags `--print`, `--provider`, `--model`, `--session-id`, `--resume`, `--tools` all appear in
`--help`, and the model id `claude-haiku-4-5` (in `manifest/agents.json`) appears in `npx pi --list-models`.
If the id differs, edit `manifest/agents.json` → `model.id` to the exact string pi reports, then re-run this step.

### Step 3 — Validate the kit
Run every mechanical check: `bash jigs/run-all.sh`
**Verify:** output ends with `✅ all jigs passed`. (This confirms the manifest, the gear contracts, and
this very file are well-formed before you run anything.)

### Step 4 — Provision the spike agent
Render the agent's identity and see the exact command it will run: `bash bin/provision-agent.sh pi-coding-spike`
**Verify:** `spike/workdir/pi-coding-spike/AGENTS.md` now exists and the script prints an example `pi …` command.

### Step 5 — Dry-run the pipeline (no LLM call, no cost)
Print every stage's exact command without executing: `bash bin/run-spike.sh --dry-run pi-coding-spike`
**Verify:** you see six stages — SPEC, PLAN, the ⏸ CHECKPOINT, BUILD, VALIDATE, jigs — each with a
copy-pasteable command.

### Step 6 — Live run: SPEC + PLAN, then stop at the human gate
Run the first half for real: `bash bin/run-spike.sh --run pi-coding-spike`
**Verify:** `spike/workdir/pi-coding-spike/SPEC.md` and `PLAN.md` exist, a `CHECKPOINT-*.md` file was
written, and the run stopped on its own (it did not build anything yet).

### Step 7 — Approve the checkpoint and resume
Read `PLAN.md`. If it is good, approve and resume (replace the path with the checkpoint file from Step 6):
`bash bin/checkpoint.sh answer spike/workdir/pi-coding-spike/CHECKPOINT-*.md "approve"` then
`bash bin/checkpoint.sh resume pi-coding-spike`
**Verify:** `spike/workdir/pi-coding-spike/build/` contains the deliverable and `VALIDATION.md` shows every
acceptance criterion passing.

### Step 8 — Add the next agent
To add a real Pi agent (Pi PM, Pi Marketing, Pi CRO, …), copy an entry in `manifest/agents.json`, edit its
`id`/`role`/`playbook`/`model`/`tools`/`gear`, then run `bash jigs/run-all.sh` before provisioning it.
**Verify:** `bash jigs/run-all.sh` still ends with `✅ all jigs passed` after your edit.

---

**If you get stuck:** every script prints its own usage when run with no arguments. The only file that
knows pi's command-line is `lib/pi-adapter.mjs` — if pi changes, that is the one file to edit.

---

### Eval Stage (automatic)
Every pipeline run ends with **STAGE 7: AUTO-EVAL** — a quality gate that runs automatically:
- **Tier 1+2** (free, instant): file structure, AC coverage, boundary compliance
- **Tier 3** (LLM judge, ~$0.01): quality scoring when `GLM_API_KEY` is set
- Results go to `evals/results/<agent>/<timestamp>/score.json`
- The pipeline does NOT fail on eval failures (advisory), but logs them for tracking

To run evals manually:
```bash
node evals/bin/score.mjs <taskId> <resultDir> --no-judge   # free, instant
node evals/bin/score.mjs <taskId> <resultDir> --judge       # ~$0.01 with LLM
```
