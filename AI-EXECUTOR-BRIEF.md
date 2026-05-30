# AI Executor Brief — run the sabbk-forge spike and report back

> **For an AI assistant (e.g. Hermes) on a real machine** with internet + a provider API key.
> **Goal:** prove ONE Pi coding agent runs end-to-end on pi, and report the **measured cost**.
> You have full permission to run these commands. Everything stays inside this repo's `spike/workdir/`.
> This is internal tooling — do **NOT** touch any client/Banafah work.

## 0. Prerequisites
- Node ≥ 22.19 (`node --version`), `git`, `npm`.
- ONE provider key (pick a path):
  - **Anthropic** (default — manifest already targets `claude-haiku-4-5`): `export ANTHROPIC_API_KEY=sk-ant-...`
  - **GLM / z.ai**: see "GLM variant" at the bottom.

## 1. Get + install
```
git clone https://github.com/Samirius/sabbk-forge.git && cd sabbk-forge
npm install
npx pi --version          # expect: 0.78.0
```
**Verify:** version prints `0.78.0`.

## 2. Sanity-check the key (one tiny call)
```
npx pi --print --no-tools --provider anthropic --model claude-haiku-4-5 --thinking off "Reply with exactly: OK"
```
**Verify:** prints `OK`. A `401` means the key is invalid — fix before continuing.

## 3. Validate the kit (no LLM)
```
bash jigs/run-all.sh
```
**Verify:** ends with `✅ all jigs passed`.

## 4. Provision + dry-run (no LLM)
```
bash bin/provision-agent.sh pi-coding-spike
bash bin/run-spike.sh --dry-run pi-coding-spike
```
**Verify:** AGENTS.md rendered; six stages printed.

## 5. Live run — SPEC + PLAN, stops at the human checkpoint
```
bash bin/run-spike.sh --run pi-coding-spike
```
**Verify:** `spike/workdir/pi-coding-spike/SPEC.md` + `PLAN.md` exist; a `CHECKPOINT-*.md` was written; the run stopped on its own.

## 6. Approve + resume — BUILD + VALIDATE
```
bash bin/checkpoint.sh answer spike/workdir/pi-coding-spike/CHECKPOINT-*.md "approve"
bash bin/checkpoint.sh resume pi-coding-spike
```
**Verify:** `spike/workdir/pi-coding-spike/build/no-trailing-whitespace.sh` exists and `VALIDATION.md` shows all acceptance criteria passing.

## 7. Report back to Samir
Paste/report:
1. Output of `bash jigs/run-all.sh`.
2. `SPEC.md` and `PLAN.md` contents.
3. The deliverable `build/no-trailing-whitespace.sh` (and whether running it actually catches trailing whitespace).
4. `VALIDATION.md` (did every criterion pass?).
5. **Measured cost** — capture usage from a JSON run:
   ```
   cd spike/workdir/pi-coding-spike && npx pi --print --mode json --no-session --tools read,grep,ls \
     --provider anthropic --model claude-haiku-4-5 --thinking low \
     "Read ./TASK.md; write a 3-sentence SPEC to stdout." | tail -60
   ```
   Report `input_tokens` / `output_tokens` / `cost` from the JSON, and multiply ≈×4 for a full 4-stage run estimate.

## GLM variant (use instead of Anthropic)
```
mkdir -p ~/.pi/agent && cat > ~/.pi/agent/models.json <<'JSON'
{ "providers": { "glm": { "api": "openai-completions",
  "baseUrl": "https://api.z.ai/api/coding/paas/v4", "apiKey": "$GLM_API_KEY",
  "models": [ { "id": "glm-4.6", "name": "GLM-4.6", "contextWindow": 200000, "maxTokens": 98304,
                "input": ["text"], "cost": {"input":0.6,"output":2.2,"cacheRead":0.11,"cacheWrite":0} } ] } } }
JSON
export GLM_API_KEY=...      # your CURRENT z.ai coding-plan key (full id.secret, no spaces)
npx pi --print --no-tools --provider glm --model glm-4.6 --thinking off "Reply with exactly: OK"   # expect OK
PI_PROVIDER=glm PI_MODEL_ID=glm-4.6 bash bin/run-spike.sh --run pi-coding-spike
# then do steps 6 and 7 (the adapter honors PI_PROVIDER/PI_MODEL_ID)
```
Confirm the exact model id your plan offers with: `curl -s https://api.z.ai/api/coding/paas/v4/models -H "Authorization: Bearer $GLM_API_KEY"`.

## Guardrails
- Write only inside `spike/workdir/`. Do not modify other repos.
- AI branches end in `-ai`; never force-push.
- Never print or commit the API key.
- If a step fails twice, STOP and report the exact command + error — do not improvise around it.
