# Forge Orchestrator — Architecture Design

> The external layer that makes the forge handle **any** software request — not just single tasks.

## Problem

The forge core pipeline (`run-spike.sh`) does one thing well:

```
TASK.md → SPEC → PLAN → [checkpoint] → BUILD → VALIDATE → eval
```

But real requests are bigger:
- "Audit myHR and fix everything" (80 bugs)
- "Refactor the PayrollEngine" (cross-cutting)
- "Build an ERP from scratch" (greenfield, multi-module)
- "Make the attendance module mobile-responsive" (scoped improvement)

Yesterday's `lifecycle.mjs` tried to handle this but:
1. **Audit sends metadata, not code** — builds repo context from file listings, not actual source
2. **Fix is one giant prompt** — no batching, no progress tracking, no resume
3. **Build/refactor are stubs** — literally `console.log("not yet implemented")`
4. **Bypasses the core pipeline** — calls GLM via curl or spawns pi directly, skipping spec→plan→checkpoint→build→validate

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FORGE CLI (forge.sh)                      │
│  forge audit <repo> [focus]                                   │
│  forge apply <plan.json>                                      │
│  forge build <repo> <spec>                                    │
│  forge refactor <repo> <scope>                                │
│  forge status <repo>                                          │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│                 ORCHESTRATOR (lifecycle.mjs)                  │
│                                                               │
│  ┌─────────┐    ┌──────────┐    ┌──────────┐                │
│  │ SCANNER │───▶│ PLANNER  │───▶│ EXECUTOR │                │
│  │         │    │          │    │          │                │
│  │ read    │    │ batch    │    │ runs     │                │
│  │ code    │    │ issues   │    │ batches  │                │
│  │ index   │    │ into     │    │ through  │                │
│  │ modules │    │ batches  │    │ pipeline │                │
│  └─────────┘    └──────────┘    └──────────┘                │
│       │              │              │                         │
│       ▼              ▼              ▼                         │
│  context/        plan.json     progress.json                 │
│  <repo>/         batches/      results/                      │
│    index.md        B001.md       B001/                       │
│                    B002.md         VALIDATION.md              │
│                    ...             score.json                 │
└─────────────────────────────────────────────────────────────┘
           │                              │
           │  per batch                    │  resume from
           ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│              CORE PIPELINE (run-spike.sh)                     │
│                                                               │
│  TASK.md → SPEC → PLAN → [checkpoint] → BUILD → VALIDATE    │
│                                                               │
│  Each batch gets its own TASK.md, its own workdir,            │
│  its own pi session. The core pipeline is UNCHANGED.          │
└─────────────────────────────────────────────────────────────┘
```

## The Three Layers

### Layer 1: Scanner (repo → context)

**What it does:** Reads actual source code, not just file listings.

**How:**
1. Detects stack (Laravel/Vue, Astro, Node, Python, etc.)
2. Maps the module structure (Controllers, Models, Services, routes, views)
3. Reads key files per module (top N files by size/relevance)
4. Builds a **module index** — a structured map of the codebase

**Output:** `lifecycle/context/<repo>/`
```
index.md          — full repo map (modules, files, deps, hotspots)
stack.md          — detected stack, versions, key dependencies
module-<N>.md     — per-module: files, exports, known issues
```

**Context window management:**
- Each module file ≤ 4000 tokens (roughly 16KB)
- The index itself ≤ 2000 tokens
- Agent reads the index first, then loads specific modules as needed
- This is the key difference from yesterday: **the model reads actual code, not metadata**

### Layer 2: Planner (request → batches)

**What it does:** Takes a request + scanner output, produces a batched execution plan.

**How:**
1. Receives the request type:
   - **audit:** "Find all issues" → issues ranked P0→P3
   - **apply:** Given an existing audit report → batch the fixes
   - **build:** Given a spec → decompose into buildable modules
   - **refactor:** Given a scope → plan safe change sequence
2. Groups work into **batches** — independent units that can run through the core pipeline
3. Orders batches by dependency (can't fix controller before fixing the service it calls)
4. Each batch gets: affected files, acceptance criteria, risk level

**Output:** `lifecycle/plans/<repo>/<plan-id>.json`
```json
{
  "id": "myhr-audit-2026-06-01",
  "repo": "/home/stark/myhr",
  "mode": "apply",
  "created": "2026-06-01T07:00:00Z",
  "source": "lifecycle/workdir/myhr/audit/AUDIT-REPORT.md",
  "total_batches": 8,
  "batches": [
    {
      "id": "B001",
      "title": "Fix attendance cross-company data leak (ATT-010)",
      "severity": "P0",
      "files": ["app/Http/Controllers/AttendanceController.php"],
      "acceptance_criteria": [
        "Users can only see attendance records from their own company",
        "No N+1 queries on the attendance listing endpoint",
        "Existing tests pass"
      ],
      "depends_on": [],
      "risk": "high",
      "branch": "fix/forge-B001-ai"
    },
    {
      "id": "B002",
      "title": "Fix shift query non-determinism (ATT-011, ATT-012)",
      "severity": "P1",
      "files": ["app/Services/ShiftService.php", "app/Models/Shift.php"],
      "acceptance_criteria": [
        "Shift queries return deterministic results",
        "N+1 queries eliminated on shift listing"
      ],
      "depends_on": ["B001"],
      "risk": "medium",
      "branch": "fix/forge-B002-ai"
    }
  ]
}
```

### Layer 3: Executor (batches → results)

**What it does:** Runs each batch through the **existing** core pipeline. No new LLM harness.

**How:**
1. For each batch in the plan (respecting dependency order):
   - Creates a `TASK.md` from the batch definition
   - Runs `run-spike.sh --run pi-software` (or the repo-build delegate)
   - Captures `VALIDATION.md` + eval score
   - Updates `progress.json`
2. If a batch fails:
   - Logs the failure
   - Skips dependent batches
   - Continues with independent batches
3. At the end, produces a summary

**Output:** `lifecycle/plans/<repo>/<plan-id>/`
```
progress.json       — which batches passed/failed/skipped
B001/
  TASK.md           — auto-generated from batch
  SPEC.md           — from core pipeline
  PLAN.md           — from core pipeline (with checkpoint)
  build/            — the actual fixes
  VALIDATION.md     — evidence
  score.json        — eval score
B002/
  ...
SUMMARY.md          — aggregated results
```

**Key insight:** The executor does NOT call GLM directly. It generates TASK.md files and feeds them to the existing `run-spike.sh` pipeline. This means all the good stuff (checkpointing, eval, budget guard) works automatically.

## Modes

### `forge audit <repo> [focus]`
```
Scanner → reads code → module index
         │
         ▼
  LLM call with actual code context
         │
         ▼
  AUDIT-REPORT.md (ranked issues)
  + plan.json (one batch per issue group)
```

Two sub-steps:
1. `forge audit <repo>` — scan + produce report
2. Report includes a plan.json — can be reviewed/edited before applying

### `forge apply <plan.json> [batch-ids]`
```
Planner (already done) → plan.json
         │
         ▼
  Executor → for each batch:
    generate TASK.md → run-spike.sh → capture results
         │
         ▼
  progress.json + SUMMARY.md
```

Optional `[batch-ids]` to run specific batches only:
- `forge apply plan.json B001 B002` — run only these
- `forge apply plan.json` — run all in dependency order

### `forge build <repo> <spec-file>`
```
Scanner → module index
         │
         ▼
  Planner → decompose spec into buildable batches
         │
         ▼
  Same executor as apply
```

For greenfield or additive features. The spec file describes what to build; the planner breaks it into batches.

### `forge refactor <repo> <scope>`
```
Scanner → module index (with dependency graph)
         │
         ▼
  Planner → identify safe refactor sequence
         │
         ▼
  Same executor as apply
```

The scope can be:
- A file path: `app/Services/PayrollEngine.php`
- A module: `attendance`
- A description: "extract shared validation into traits"

### `forge status <repo>`
Shows: last scan date, known plans, batch progress, issues found vs fixed.

## How This Differs From Yesterday's `lifecycle.mjs`

| Aspect | Yesterday | This Design |
|--------|-----------|-------------|
| **Context** | File type counts, key path listings | Actual source code, per-module, token-bounded |
| **Audit** | One GLM curl call with ~4K chars of metadata | Scanner reads real code, sends per-module context |
| **Fix** | One giant pi spawn, 10-min timeout, no batching | Batched through core pipeline, per-batch checkpoint |
| **Build/Refactor** | Not implemented | Full implementation via same planner+executor |
| **Core pipeline** | Bypassed (direct curl/pi) | Reused (generates TASK.md → run-spike.sh) |
| **Progress** | None | progress.json, per-batch results, summary |
| **Resume** | None — restart from scratch | Resume from last completed batch |
| **Cost control** | None | Per-batch budget guard (existing) + total plan budget |

## Implementation Plan

### Phase 1: Scanner (the missing piece)
- `lib/scanner.mjs` — stack detection, module mapping, file reading, context building
- Output: `lifecycle/context/<repo>/` with token-bounded module files
- Test: `forge status ~/myhr` shows real module structure

### Phase 2: Planner (batch decomposition)
- `lib/planner.mjs` — takes scanner output + request, produces plan.json
- Uses LLM with real code context to produce accurate batches
- Test: `forge audit ~/myhr` produces ranked report + batched plan

### Phase 3: Executor (pipeline wiring)
- `lib/executor.mjs` — iterates plan.json batches, generates TASK.md, calls run-spike.sh
- Progress tracking, resume, failure handling
- Test: `forge apply plan.json B001` runs through core pipeline

### Phase 4: CLI integration
- Rewrite `bin/forge.sh` to route modes to the new modules
- Replace old `lifecycle.mjs` with the three-layer architecture

## File Structure After Implementation

```
sabbk-forge/
  bin/
    forge.sh              ← CLI entry point (rewritten)
    run-spike.sh          ← UNCHANGED (core pipeline)
    run-pipeline.sh       ← UNCHANGED (multi-gear)
    checkpoint.sh         ← UNCHANGED
    ...
  lib/
    scanner.mjs           ← NEW: repo → module index
    planner.mjs           ← NEW: request + context → batches
    executor.mjs          ← NEW: batches → core pipeline calls
    pi-adapter.mjs        ← UNCHANGED
    validate.mjs          ← UNCHANGED
    budget.mjs            ← UNCHANGED
    run-log.mjs           ← UNCHANGED
  lifecycle/
    context/              ← scanner output (gitignored)
    plans/                ← planner output (committed)
    workdir/              ← executor working dirs (gitignored)
    lifecycle.mjs         ← DELETED (replaced by lib/*.mjs)
  pipeline/               ← UNCHANGED
  evals/                  ← UNCHANGED
  protocols/              ← UNCHANGED
```

## Design Principles

1. **The core pipeline is sacred.** Scanner → Planner → Executor all feed INTO run-spike.sh. They never bypass it.
2. **Batch size matters.** Each batch should be completable in one pipeline run (~5 min, ~$0.01). Big refactorings get split into safe sequential steps.
3. **Human checkpoints preserved.** Each batch still stops at the plan→build gate. But the orchestrator auto-approves when `--auto-approve` is set (for trusted plans).
4. **Resume always works.** progress.json tracks state. Kill and restart picks up where you left off.
5. **Scanner is cheap.** No LLM calls. Just file reading and indexing. The LLM only gets involved at audit/plan time.
6. **Context windows are managed.** Module files are token-bounded. The planner never sees the whole repo at once — it sees the index + relevant modules.
