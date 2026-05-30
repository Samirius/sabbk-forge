# Troubleshooting

Real issues seen running the forge, and the fix.

## OOM / SIGKILL during the BUILD stage (`--tools bash`)
**Symptom:** pi gets killed (SIGKILL) mid-BUILD on a small/constrained VM. The `bash` tool is the heavy one.
**Fixes (in order):**
1. **Use the write-only build profile** for file-authoring tasks (no shell needed):
   `bash bin/run-spike.sh --run pi-coding-spike --lite`  → BUILD uses `build_lite` tools (`read,edit,write`).
2. **Cap pi's heap:** `export PI_NODE_HEAP_MB=1536` (the adapter passes `--max-old-space-size`). Lower = less RAM, more GC.
3. **Free disk** — pi + `node_modules` want headroom; a near-full disk makes OOM worse.
**Minimum VM specs:** Node ≥ 22.19, **≥ 4 GB free RAM** (≥ 8 GB comfortable for `bash`-heavy builds), **≥ 2 GB free disk**.

## "`--resume` opens a picker / conflicts with `--session-id`"
**Already fixed on `main` (PR #2).** The adapter no longer passes `--resume`; a stable `--session-id`
continues the session non-interactively. If you still see it, your checkout is stale — **`git pull` latest `main`**.

## GLM: `401 token expired or incorrect`
The key is wrong/expired or the base URL is off. Use a **current** z.ai key; default base URL is
`https://api.z.ai/api/coding/paas/v4` (alt `https://open.bigmodel.cn/api/paas/v4`). Confirm models with
`curl -s "$GLM_BASE_URL/models" -H "Authorization: Bearer $GLM_API_KEY"`. Set the model to `glm-4.6` (no spaces).

## A live run dies at ~60s with no output
If you're invoking through a 60-second-capped runner (e.g. `RunWithCredentials`), keep each stage short:
run one stage at a time, cheap model, `--thinking off/low`. The per-stage `timeout_sec` in the manifest is
the hard wall-clock cap.

## Budget stopped my run (`BUDGET STOP … exit 3`)
Working as intended — the agent hit `max_turns` or `max_usd`. Raise the cap in `manifest/agents.json`
(`budget`) if the task legitimately needs more, then re-run. See `protocols/BUDGET.md`.
