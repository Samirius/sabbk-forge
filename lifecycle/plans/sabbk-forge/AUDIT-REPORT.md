# Audit Report: sabbk-forge
Date: 2026-06-01T08:51:33.042Z
Scanner: 2026-06-01T08:38:32.154Z

## Findings by Module

### module-002
- [DOCS-003] P2 [architecture] docs/ORCHESTRATOR-DESIGN.md:7 — Golden Rule states "No step re-reads the raw codebase," but Step 3 executor must read and modify raw repo files to apply batch changes through the core pipeline, contradicting the stated invariant.

- [DOCS-004] P2 [bug] docs/ORCHESTRATOR-DESIGN.md:~105 — `plan.json` has no expiry/TTL field despite referencing `scanner_ref` to a `scan.json` that expires after 24h. A plan can be executed long after its underlying scan is stale, with no re-plan trigger.

- [DOCS-005] P3 [completeness] docs/ORCHESTRATOR-DESIGN.md:~85 — Scanner eval failure triggers an automatic re-run ("scanner re-runs with a warning") but no maximum retry limit is specified, risking an infinite loop if structural validation consistently fails.

- [DOCS-006] P3 [completeness] docs/ORCHESTRATOR-DESIGN.md:~140 — Document is truncated mid-section ("stack.md → dependency list" cuts off); the Planner Context-Only Operation section, token-budget enforcement details, and any subsequent sections are incomplete.

- [DOCS-007] P3 [cons

### module-003
- [EVAL-001] [P1] [bug] evals/bin/run-eval.sh:8,16 — `AGENT_ID="${3:-pi-coding-spike}"` is assigned identically on both line 8 and line 16; the first assignment is dead code (likely a merge artifact) and the comment `FIX: CODE-001` suggests this was only partially resolved
- [EVAL-002] [P1] [bug] evals/bin/run-suite.sh:23 — `for TASK in $TASKS` performs word-splitting on an unquoted variable; task IDs containing spaces, hyphens adjacent to spaces, or glob characters will be split incorrectly or expanded, causing wrong task IDs to be passed to `run-eval.sh`
- [EVAL-003] [P2] [bug] evals/bin/run-suite.sh:38-46 — Summary JSON is built via unquoted heredoc interpolation (`"$SUITE"`, `"$JUDGE"`); if suite name or judge flag contains double quotes, backslashes, or special characters, the output will be malformed JSON
- [EVAL-004] [P2] [code-quality] evals/bin/run-eval.sh:40-41 — `bash ... checkpoint.sh ... 2>/dev/null || true` suppresses both stderr and the exit code; a missing or corrupt checkpoint file, or a provisioned agent in a bad state, is silently ignored and proceeds to BUILD without approval
- [EVAL-005] [P3] [robustness] evals/bin/run-suite.sh:20-23 — If the YAML suite file contains no matching `^\s*- ` lines, `$TASKS` is empty and the loop body never executes, producing a summary of `total:0, pass:0, fail:0` with no warning or error to the user

### module-004
- [FORGE-001] P2 bug installer/steps/45-setup-forge.sh:43 — `.done`

### module-006
- [BUD-001] P1 [reliability] lib/budget.mjs:44-52 — Stale lock with no age/staleness detection; process crash between `mkdirSync` (lock acquire) and `rmdirSync` (unlock) permanently blocks all subsequent operations with no recovery path.
- [BUD-002] P2 [security] lib/budget.mjs:54-58 — `unlock` swallows all errors with empty `catch {}`, masking filesystem permission failures and silently leaving the lock directory in place.
- [BUD-003] P2 [performance] lib/budget.mjs:49 — `while (Date.now() - s < 50) {}` is a CPU-burning busy-wait spin loop; should use `setTimeout`-based polling or `Atomics.wait` instead.
- [BUD-004] P2 [reliability] lib/budget.mjs:62 — `save` does non-atomic direct `writeFileSync`; a crash mid-write corrupts the state JSON, and the `load` function will then `process.exit(2)` with no self-healing option.
- [BUD-005] P2 [bug] lib/budget.mjs:48,60,61 — Exit code 3 is overloaded for both "lock timeout" (line 48) and "budget exceeded" (lines 60-61), making it impossible for callers to distinguish the two failure modes.

### module-007
- [SCAN-001] [P1] [bug] lifecycle/context/myhr/index.md:10-12 — Duplicate database entries: `MySQL/PostgreSQL` listed as combined entry AND as separate `MySQL` and `PostgreSQL` lines — stack detection lacks deduplication, producing misleading output.

- [SCAN-002] [P2] [bug] lifecycle/context/test-repo/scan.json:13-18 — `stack.languages` is empty `[]` despite repo containing `index.php`; stack detection completely failed to identify PHP, rendering the scan artifact unreliable.

- [SCAN-003] [P2] [bug] lifecycle/context/test-repo/scan.json:23 — `has_llm_analysis: true` contradicts entirely empty stack detection (`languages`, `frameworks`, `databases`, `tools` all `[]`); flag doesn't accurately reflect analysis state.

- [SCAN-004] [P2] [bug] lifecycle/context/test-repo/index.md:8-10 — Git metadata fields (`Branch`, `Last`, `Commits`) are all blank/empty, indicating silent failure in git metadata extraction with no error surfaced to the scan output.

- [SCAN-005] [P3] [ux] lifecycle/context/myhr/index.md:87 — File count category `(none): 13` is ambiguous — extensionless files need a descriptive label (e.g., `no-extension` or `Makefile/config`) for actionable reporting.

### module-008
- [MANIFEST-003] P2 [bug] SCHEMA.md:49 — `budget.max_usd` is documented as "Soft budget ceiling" with no enforcement mechanism, yet the module brief claims "triple-layer cost guardrails"; two of the three layers are hard caps (`max_turns`, `timeout_sec`) while this one is advisory-only, making actual spend unbounded if turns/time remain within limits.
- [MANIFEST-004] P2 [security] SCHEMA.md — No `additionalProperties: false` equivalent is documented anywhere; a typo like `"tols"` instead of `"tools"` would silently pass validation, provisioning an agent with zero allowed tools (or extra ghost fields) and no error.
- [MANIFEST-005] P3 [risk] SCHEMA.md:38 — `model.stages` fallback is silent: if a critical stage is omitted from the overrides, the adapter falls back to `model.id` which may be an expensive planner-tier model, causing unplanned cost spikes on builder phases with no warning.
- [MANIFEST-006] P3 [completeness] SCHEMA.md:33 — `kind` accepts only `coding` or `domain` and `runtime.harness` accepts only `pi-coding-agent` or `pi-agent-core`, but no coupling rule is documented (e.g., `kind: coding` must pair with `runtime.harness: pi-coding-agent`); a mismatch would provision the wrong harness silently.
- [MANIFEST-007] P3 [completeness] SCHEMA.md:48 — `budget.max_turns` type is `number` with no minimum bound documented; a value of `0` or `-1` would be schema-valid but render the agent unable to execute any turns.

### module-009
- [PIPE-001] P1 [bug] pipeline/myhr-attendance-p2.json:21 — File is truncated mid-value (`"consumes": "s`), producing invalid JSON that will fail to load at runtime.
- [PIPE-002] P2 [bug] pipeline/myhr-attendance-p2.json:5 — `message` references `pipeline/REQUEST.md` (trailing-whitespace jig) instead of an myHR-attendance-specific request file — wrong work request paired with this pipeline.
- [PIPE-003] P2 [schema] pipeline/build-run-pipeline.json:3 — JSON file is truncated at `"desc`, making it invalid and unloadable; same class of truncation corruption as PIPE-001.
- [PIPE-004] P3 [code-quality] pipeline/*.json — No `version` or `$schema` field in any pipeline JSON; a data-driven runner cannot validate file structure or detect schema drift at runtime.
- [PIPE-005] P3 [code-quality] pipeline/demo.json,pipeline/forge-observability.json — Inconsistent top-level metadata: some pipelines have `name`/`description`, others don't; no enforced schema contract across pipeline files.

### module-010
- [PROT-001] P1 [bug] CONCURRENCY.md:29 — File is truncated mid-definition (`budget: { max_usd: number # per-lane cap`); missing closing braces, remaining Lane fields, state machine, and isolation rules — the protocol is incomplete and cannot be implemented as-is

- [PROT-002] P1 [security] CHECKPOINT.md:23-24 — No authentication or identity verification on `checkpoint.sh answer`; any process/user who can execute the script can approve/reject checkpoints, allowing unauthorized pipeline progression

- [PROT-003] P1 [security] BUDGET.md:18 — `max_usd` ceiling is completely unenforced in text-mode runs; an agent in text mode can spend unbounded dollars with only `max_turns` and `timeout_sec` as indirect (and weak) proxies for cost

- [PROT-004] P2 [architecture] CONCURRENCY.md:24-29 — Per-lane `max_usd` caps are isolated with no documented aggregate pipeline-level budget limit; N concurrent lanes × per-lane cap can exceed the intended total fleet budget by Nx

- [PROT-005] P2 [bug] CHECKPOINT.md:22-26 — No locking or atomicity described for checkpoint file write→answer→resume flow; concurrent reads/writes to the same checkpoint file (e.g., duplicate resume calls) can cause race conditions yielding undefined pipeline state

### module-011
- [RUN-001] P2 [data-quality] runs/2026-05-30.jsonl:1-2 — Pipeline jumps from `spec` directly to `validate`, missing `plan` and `build` stages entirely (unlike the full 4-stage runs on 05-31)
- [RUN-002] P2 [data-quality] runs/2026-05-31.jsonl:1-8 — All 8 entries have identical `cost_usd: 0.0123` despite duration_ms ranging from 39,633 to 96,649, strongly suggesting a hardcoded placeholder rather than actual metered cost
- [RUN-003] P2 [completeness] runs/2026-06-01.jsonl:1-2 — Pipeline run recorded only `spec` and `plan` with `exit:0`, but no `build` or `validate` entries exist — run appears silently abandoned with no error signal
- [RUN-004] P3 [data-quality] runs/2026-05-30.jsonl:1 — First entry omits `cost_usd` field entirely while the second entry includes it, violating schema consistency within the same file
- [RUN-005] P2 [data-quality] runs/2026-05-30.jsonl:1 — `duration_ms: 173` for spec stage is ~500x faster than the same stage on subsequent days (55,791–126,595 ms), indicating either a mock/test run or a fundamentally different operation being logged under the same schema

### module-012
- [SPIKE-001] P1 [bug] spike/workdir/pi-brand/AGENTS.md:42 — File is truncated mid-sentence ending with `` `handoff` from pi-pm (requires ``; agent won't receive complete gear contract or safety constraints.
- [SPIKE-002] P2 [scope] spike/workdir/pi-brand/AGENTS.md:1 — Brand agent workspace exists inside the `spike/` module with no reference from `TASK.md` or the coding agent's boundaries (`spike/workdir/pi-coding-spike/` only); likely residual noise that could confuse the coding agent.
- [SPIKE-003] P2 [testability] spike/workdir/pi-coding-spike/test/fixtures/untracked/test.md:1 — No git repository initialization (`.git/`, `.gitignore`, or setup script) is visible anywhere in the module. The "untracked" fixture cannot validate criterion 5 (`git ls-files`) without a git repo establishing tracked vs. untracked status.
- [SPIKE-004] P2 [completeness] spike/workdir/pi-coding-spike/build/ — Expected deliverable directory per TASK.md criterion 1 does not exist; no `SPEC.md`, `PLAN.md`, `build/no-trailing-whitespace.sh`, or `VALIDATION.md` present — task is entirely unstarted.
- [SPIKE-005] P3 [code-quality] spike/workdir/pi-coding-spike/test/fixtures/dirty/test.sh:7,9 — Intentional trailing whitespace is invisible in diffs and can be silently stripped by editors or pre-commit hooks, breaking the dirty fixture with no visible indication.

### module-013
- [TPL-001] P1 [bug] gear-contract.schema.yaml:1-18 — `//` comments are invalid YAML syntax (YAML requires `#`); any YAML parser will reject this file, and the `.yaml` extension is misleading since no actual schema content exists—only documentation comments.
- [TPL-002] P1 [bug] projects/README.md:17 — File is truncated mid-sentence at `"so the agent's Va"`; documentation is incomplete and users cannot follow partial instructions.
- [TPL-003] P2 [code-quality] gear-contract.schema.yaml:1 — File contains only documentation but has a `.yaml` extension implying parseable schema content; if `jigs/gear-contract-valid.sh` or any tooling ever loads this for validation, it will fail outright.
- [TPL-004] P2 [maintenance] AGENTS.md.tmpl:15 — `{{PLAYBOOK}}` placeholder has no fallback or guard; if the corresponding `manifest/agents.json` entry lacks a playbook value, the rendered file will contain an empty string pointing to a nonexistent file path, breaking onboarding for every new session.


## Execution Plan
```json
{
  "id": "sabbk-forge-audit-2026-06-01",
  "mode": "apply",
  "total_batches": 11,
  "batches": [
    {
      "id": "B001",
      "title": "Fix lib/budget.mjs lock staleness, atomic writes, busy-wait, and exit-code collision",
      "severity": "P1",
      "files": ["lib/budget.mjs"],
      "acceptance_criteria": [
        "Lock acquisition includes age/staleness detection with automatic recovery for orphaned locks (BUD-001)",
        "unlock() logs or surfaces filesystem errors instead of empty catch{} (BUD-002)",
        "Busy-wait spin loop replaced with setTimeout-based polling or Atomics.wait (BUD-003)",
        "save() uses atomic write pattern (write-to-temp + rename) to prevent mid-write corruption (BUD-004)",
        "Exit codes 3 (lock timeout) and 3 (budget exceeded) use distinct codes so callers can differentiate (BUD-005)"
      ],
      "depends_on": [],
      "risk": "high"
    },
    {
      "id": "B002",
      "title": "Fix eval shell scripts: dead code, word-splitting, JSON injection, silent failures",
      "severity": "P1",
      "files": ["evals/bin/run-eval.sh", "evals/bin/run-suite.sh"],
      "acceptance_criteria": [
        "Duplicate AGENT_ID assignment on line 8 of run-eval.sh removed (EVAL-001)",
        "$TASKS in run-suite.sh is properly quoted or uses array to avoid word-splitting/glob bugs (EVAL-002)",
        "Summary JSON heredoc in run-suite.sh uses escaped or properly quoted interpolation to prevent malformed JSON (EVAL-003)",
        "checkpoint.sh invocation in run-eval.sh does not silently swallow errors; stderr or exit code is surfaced (EVAL-004)",
        "Empty TASKS result produces a clear warning/error to the user instead of silent zero-summary (EVAL-005)"
      ],
      "depends_on": [],
      "risk": "medium"
    },
    {
      "id": "B003",
      "title": "Complete and correct docs/ORCHESTRATOR-DESIGN.md: truncation, Golden Rule contradiction, plan TTL, retry limit",
      "severity": "P2",
      "files": ["docs/ORCHESTRATOR-DESIGN.md"],
      "acceptance_criteria": [
        "Golden Rule rewritten to allow executor file modifications while preserving no-re-read-of-raw-codebase intent (DOCS-003)",
        "plan.json schema includes expiry/TTL field with re-plan trigger when scan.json is stale (DOCS-004)",
        "Scanner eval failure specifies a maximum retry limit to prevent infinite loops (DOCS-005)",
        "Truncated sections completed: Planner Context-Only Operation, token-budget enforcement, and all subsequent sections (DOCS-006)",
        "Incomplete issue reference resolved or removed (DOCS-007)"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B004",
      "title": "Fix SCHEMA.md: budget enforcement, strict validation, stage fallback warning, kind-harness coupling, min bounds",
      "severity": "P2",
      "files": ["SCHEMA.md"],
      "acceptance_criteria": [
        "budget.max_usd documents enforcement mechanism or is explicitly marked as advisory with rationale (MANIFEST-003)",
        "Schema includes additionalProperties:false equivalent to reject unknown/typo fields at validation time (MANIFEST-004)",
        "model.stages fallback logs a warning when falling back to model.id for cost visibility (MANIFEST-005)",
        "Coupling rule between kind and runtime.harness is documented (MANIFEST-006)",
        "budget.max_turns documents minimum bound (>=1) and rejects zero/negative values (MANIFEST-007)"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B005",
      "title": "Repair truncated pipeline JSON files and add version/schema metadata",
      "severity": "P1",
      "files": ["pipeline/myhr-attendance-p2.json", "pipeline/build-run-pipeline.json", "pipeline/demo.json", "pipeline/forge-observability.json"],
      "acceptance_criteria": [
        "myhr-attendance-p2.json is valid JSON with complete consumes field (PIPE-001)",
        "myhr-attendance-p2.json references correct myHR-attendance request file, not pipeline/REQUEST.md (PIPE-002)",
        "build-run-pipeline.json is valid JSON with complete desc(ription) field (PIPE-003)",
        "All pipeline JSON files include version and/or $schema field for runtime validation (PIPE-004)",
        "All pipeline JSON files have consistent top-level name/description metadata (PIPE-005)"
      ],
      "depends_on": [],
      "risk": "high"
    },
    {
      "id": "B006",
      "title": "Fix protocol docs: complete CONCURRENCY.md, add CHECKPOINT.md auth, enforce BUDGET.md max_usd",
      "severity": "P1",
      "files": ["CONCURRENCY.md", "CHECKPOINT.md", "BUDGET.md"],
      "acceptance_criteria": [
        "CONCURRENCY.md completed with full Lane definition, closing braces, state machine, and isolation rules (PROT-001)",
        "CONCURRENCY.md documents aggregate pipeline-level budget cap to prevent N×lane budget overflow (PROT-004)",
        "CHECKPOINT.md specifies authentication/identity verification requirement for checkpoint.sh answer (PROT-002)",
        "CHECKPOINT.md documents locking/atomicity for checkpoint write→answer→resume flow (PROT-005)",
        "BUDGET.md specifies enforcement mechanism for max_usd in text-mode runs, not just advisory text (PROT-003)"
      ],
      "depends_on": ["B001"],
      "risk": "medium"
    },
    {
      "id": "B007",
      "title": "Fix lifecycle scan artifacts: deduplication, empty-stack detection, metadata extraction, labeling",
      "severity": "P1",
      "files": ["lifecycle/context/myhr/index.md", "lifecycle/context/test-repo/scan.json", "lifecycle/context/test-repo/index.md"],
      "acceptance_criteria": [
        "myhr/index.md database entries are deduplicated — MySQL and PostgreSQL appear once each, not as combined+separate (SCAN-001)",
        "test-repo/scan.json stack.languages includes PHP when repo contains index.php (SCAN-002)",
        "has_llm_analysis flag is false when all stack fields are empty (SCAN-003)",
        "test-repo/index.md git metadata fields populated or error surfaced when extraction fails (SCAN-004)",
        "Extensionless file category labeled descriptively (e.g., no-extension or config) instead of (none) (SCAN-005)"
      ],
      "depends_on": [],
      "risk": "medium"
    },
    {
      "id": "B008",
      "title": "Correct run log data quality: missing stages, hardcoded costs, schema inconsistency",
      "severity": "P2",
      "files": ["runs/2026-05-30.jsonl", "runs/2026-05-31.jsonl", "runs/2026-06-01.jsonl"],
      "acceptance_criteria": [
        "2026-05-30.jsonl includes plan and build stages or documents their absence as intentional skip (RUN-001)",
        "2026-05-31.jsonl cost_usd values reflect actual metered duration rather than identical hardcoded placeholder (RUN-002)",
        "2026-06-01.jsonl includes build/validate entries or records an error/abort signal (RUN-003)",
        "2026-05-30.jsonl entries have consistent schema — all entries include cost_usd field (RUN-004)",
        "2026-05-30.jsonl spec entry duration_ms is realistic or annotated as mock/test data (RUN-005)"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B009",
      "title": "Fix spike workspace: complete AGENTS.md truncation, add git repo fixture, create build deliverables, fix dirty fixture",
      "severity": "P1",
      "files": ["spike/workdir/pi-brand/AGENTS.md", "spike/workdir/pi-coding-spike/test/fixtures/untracked/test.md", "spike/workdir/pi-coding-spike/test/fixtures/dirty/test.sh", "spike/workdir/pi-coding-spike/build/"],
      "acceptance_criteria": [
        "pi-brand/AGENTS.md completed — truncation resolved, full handoff/gear contract text present (SPIKE-001)",
        "pi-brand workspace either properly referenced from TASK.md or removed if residual noise (SPIKE-002)",
        "Git repository initialized in spike module so untracked fixture can validate git ls-files criterion (SPIKE-003)",
        "build/ directory created with SPEC.md, PLAN.md, no-trailing-whitespace.sh, and VALIDATION.md per TASK.md (SPIKE-004)",
        "Dirty test fixture trailing whitespace documented with visible marker or alternative approach resistant to editor stripping (SPIKE-005)"
      ],
      "depends_on": [],
      "risk": "medium"
    },
    {
      "id": "B010",
      "title": "Fix template files: convert gear-contract.schema.yaml syntax, complete projects/README.md, guard AGENTS.md.tmpl placeholder",
      "severity": "P1",
      "files": ["gear-contract.schema.yaml", "projects/README.md", "AGENTS.md.tmpl"],
      "acceptance_criteria": [
        "gear-contract.schema.yaml uses valid YAML (# comments) or is renamed to .md if documentation-only (TPL-001, TPL-003)",
        "projects/README.md completed — truncation at line 17 resolved with full sentence and any remaining content (TPL-002)",
        "AGENTS.md.tmpl {{PLAYBOOK}} placeholder has fallback default or guard that fails gracefully when manifest entry is missing (TPL-004)"
      ],
      "depends_on": [],
      "risk": "medium"
    },
    {
      "id": "B011",
      "title": "Fix installer 45-setup-forge.sh .done marker issue",
      "severity": "P2",
      "files": ["installer/steps/45-setup-forge.sh"],
      "acceptance_criteria": [
        "Step completes and creates/validates .done marker file correctly at line 43 (FORGE-001)"
      ],
      "depends_on": [],
      "risk": "low"
    }
  ]
}
```