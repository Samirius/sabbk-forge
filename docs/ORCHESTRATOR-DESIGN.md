# Forge Orchestrator — Architecture Design

> The external layer that makes the forge handle **any** software request.
> **Context is the new programming.** Every step has a contract, every output is validated.

## The Golden Rule

> **Each step ONLY reads the structured output of the previous step.**
> The scanner reads the repo. The planner reads the scanner's files. The executor reads the planner's files.
> No step re-reads the raw codebase. Context flows forward, never backward.
>
> **Exception:** The executor may write files (build artifacts, patches) to the repo as directed by the plan.
> It does NOT re-read the codebase — it only writes what the plan specifies.

## The Pipeline

```
    REPO (raw codebase)
         │
         ▼
┌─────────────────────┐
│  STEP 1: SCAN       │  No LLM. Reads files. Builds structured context.
│                     │
│  Input:  repo path  │
│  Output: context/   │  ← strict contract (index.md + modules + stack.md)
│  Eval:   structural │  ← checks output completeness
└────────┬────────────┘
         │  context/<repo>/
         │    ✓ index.md      (module map, stack, git state, hotspots)
         │    ✓ stack.md      (dependencies, versions)
         │    ✓ module-*.md   (actual code, token-bounded)
         │    ✓ scan.json     (machine-readable manifest)
         ▼
┌─────────────────────┐
│  STEP 2: PLAN       │  LLM call. Reads context files ONLY (not repo).
│                     │
│  Input:  context/   │  ← auto-runs scan if missing/expired
│  Output: plan.json  │  ← strict contract (batches with ACs)
│  Eval:   LLM judge  │  ← scores plan quality
└────────┬────────────┘
         │  plans/<repo>/<id>.json
         │    ✓ id, mode, repo, created
         │    ✓ batches[] with id, title, files, ACs, deps
         │    ✓ plan.json validated before executor runs
         ▼
┌─────────────────────┐
│  STEP 3: EXECUTE    │  No new LLM. Runs batches through core pipeline.
│                     │
│  Input:  plan.json  │  ← auto-runs plan if missing
│  Output: results/   │  ← per-batch SPEC/PLAN/BUILD/VALIDATION
│  Eval:   per-batch  │  ← reuses existing eval framework
└─────────────────────┘
```

## Contract Enforcement

### Step 1 → Step 2 (Scanner → Planner)

The planner checks for `context/<repo>/scan.json`. If missing or expired:
```
⚠️ No scanner context for myhr. Running scan first...
🔍 Scanning: myhr
✅ Context built. Proceeding to plan.
```

**scan.json** (the machine-readable contract):
```json
{
  "repo": "myhr",
  "path": "/home/stark/myhr",
  "scanned_at": "2026-06-01T05:00:00Z",
  "expires_after_hours": 24,
  "modules": ["Controllers", "Models", "Services", ...],
  "file_count": 1115,
  "stack": {
    "languages": ["PHP", "JavaScript", "Vue SFC"],
    "frameworks": ["Laravel 11.31", "Vue 3.5.32"],
    "databases": ["MySQL", "PostgreSQL"],
    "tools": ["Sanctum", "Tailwind", "PrimeVue", "Vite"]
  },
  "outputs": {
    "index": "index.md",
    "stack": "stack.md",
    "modules": ["module-001.md", "module-002.md", ...]
  },
  "eval": {
    "passed": true,
    "checks": {
      "has_index": true,
      "has_stack": true,
      "has_modules": true,
      "min_modules": true,
      "modules_have_code": true,
      "no_empty_modules": true
    }
  }
}
```

**Eval gate (structural, free):**
- `has_index` — index.md exists and is non-empty
- `has_stack` — stack.md exists and has ≥1 framework
- `has_modules` — ≥2 module-*.md files exist
- `min_modules` — covers core directories (for Laravel: Controllers, Models, Routes at minimum)
- `modules_have_code` — each module file contains actual source code (``` blocks), not just file listings
- `no_empty_modules` — no module file < 200 bytes

If eval fails → scanner re-runs with a warning. **Maximum 3 retry attempts** before aborting with an error.
This prevents infinite loops when the scanner has a systematic issue.

### Step 2 → Step 3 (Planner → Executor)

The executor checks for a valid `plan.json`. If missing:
```
⚠️ No plan found. Run: forge audit <repo> or forge plan <repo> <mode> <source>
```

**plan.json contract:**
```json
{
  "id": "myhr-audit-2026-06-01",
  "repo": "myhr",
  "repo_path": "/home/stark/myhr",
  "mode": "apply",
  "created": "2026-06-01T07:00:00Z",
  "expires_at": "2026-06-02T07:00:00Z",
  "ttl_hours": 24,
  "source": "audit",
  "scanner_ref": "scan.json:2026-06-01T05:00:00Z",
  "total_batches": 8,
  "batches": [
    {
      "id": "B001",
      "title": "...",
      "severity": "P0",
      "files": ["path/to/file"],
      "acceptance_criteria": ["..."],
      "depends_on": [],
      "risk": "high",
      "branch": "fix/forge-B001-ai"
    }
  ]
}
```

**Eval gate (LLM judge, ~$0.01):**
- `has_batches` — ≥1 batch defined
- `batches_have_ids` — every batch has a unique B-style ID
- `batches_have_files` — every batch lists ≥1 file
- `batches_have_acs` — every batch has ≥1 acceptance criteria
- `deps_are_valid` — all depends_on reference existing batch IDs
- `no_circular_deps` — dependency graph is a DAG
- `files_exist` — referenced files exist in the repo (if repo_path is accessible)
- `title_quality` — titles are specific (not generic like "fix bugs")

If eval fails → plan is rejected with specific issues listed.

### Step 3 Eval (per-batch, existing framework)

Already implemented. Each batch runs through core pipeline which includes:
- Stage 7 auto-eval (tier 1+2 structural, tier 3 LLM judge)
- VALIDATION.md with pass/fail per acceptance criterion

## Planner: Context-Only Operation

The planner NEVER reads the raw codebase. Its context diet:

```
index.md       → full repo map (which modules exist, file counts, hotspots)
                 This tells the planner WHERE to look.

module-N.md    → actual source code for specific modules
                 The planner loads only modules relevant to the request.
                 Each module ≤ 4000 tokens (~16KB).

stack.md       → dependency list
                 This tells the planner what versions/constraints exist.
```

**How the planner selects modules:**
1. Reads `index.md` first (cheap, ~2K tokens)
2. Identifies which modules are relevant to the request
3. Loads only those module files
4. If a specific file is referenced but not in any module, it can request ONE supplemental read — but this is logged as a "context miss" for scanner improvement

**This means:**
- Scanner output IS the planner's entire world
- If the scanner missed something, the planner can't see it
- This creates a natural feedback loop: planner logs context misses → scanner gets improved

## Context Freshness

Scans expire. A scan from 2 days ago may be stale.

```
scan.json.scanned_at + scan.json.expires_after_hours < now
→ STALE → auto-re-scan
```

Default: 24 hours. Configurable per repo via `FORGE_SCAN_TTL_HOURS`.

The planner checks this before running. If stale:
```
⚠️ Scanner context expired (scanned 26h ago, TTL 24h). Re-scanning...
```

## Eval Gates Summary

| Gate | Where | Cost | What it checks |
|------|-------|------|----------------|
| Scan eval | After scanner | Free | Output completeness (6 structural checks) |
| Plan eval | After planner | ~$0.01 | Plan validity (8 checks, optional LLM judge) |
| Batch eval | After each batch | ~$0.01 | Existing Stage 7 eval (reused unchanged) |
| Summary eval | After all batches | Free | Aggregate pass rate, failure analysis |

## Updated File Structure

```
sabbk-forge/
  lib/
    scanner.mjs        ← reads repo → context/ (with scan.json + eval)
    planner.mjs        ← reads context/ → plan.json (with eval)
    executor.mjs       ← reads plan.json → results/ (with per-batch eval)
    forge-eval.mjs     ← NEW: shared eval primitives for all 3 gates
  lifecycle/
    context/<repo>/    ← scanner output
      scan.json        ← machine-readable manifest (the contract)
      index.md         ← human-readable repo map
      stack.md         ← dependencies
      module-*.md      ← actual code (token-bounded)
      eval.json        ← scan eval results
    plans/<repo>/      ← planner output
      audit-*.json     ← the plan (the contract)
      eval.json        ← plan eval results
      AUDIT-REPORT.md  ← human-readable audit report
      B001/            ← executor results (per batch)
        VALIDATION.md
        score.json
      progress.json    ← execution state
      SUMMARY.md       ← aggregate results
```

## Design Principles

1. **Context flows forward only.** Scanner → Planner → Executor. Never backward.
2. **Each step has a contract.** Defined by scan.json / plan.json schema. Eval gates enforce it.
3. **Auto-chain.** Missing prerequisite? Auto-run it. Stale context? Auto-refresh.
4. **Eval at every gate.** No step runs without its input being validated.
5. **Core pipeline is sacred.** Executor feeds INTO run-spike.sh. Never bypasses it.
6. **Context is the new programming.** The scanner's output quality determines everything downstream.
