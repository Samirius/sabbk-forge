# Audit Report: sabbk-forge
Date: 2026-06-02T10:10:36.215Z
Scanner: 2026-06-02T10:06:51.408Z

## Findings by Module

### module-001
[ISSUE-ID] [P2] [security] bin/checkpoint.sh:21-23 — Unquoted variables in `echo` statements allow injection of malicious characters into the checkpoint file metadata.
[ISSUE-ID] [P2] [reliability] bin/forge-health.sh:28 — Unsafe grep pattern `(JIGS=\()` fails if run on non-GNU systems (like macOS), causing status report to fail.
[ISSUE-ID] [P2] [reliability] bin/forge-health.sh:33 — Script cuts off abruptly before iterating over `SCAN_FILES`, causing incomplete execution.
[ISSUE-ID] [P2] [bug] bin/checkpoint.sh:50 — Resume command relies on `tail -1` and `grep -l` without sorting, potentially selecting the wrong checkpoint if filesystem timestamps are non-sequential.

### module-003
[ISSUE-ID] P3 configuration evals/bin/run-eval.sh:12 — `AGENT_ID` is hardcoded with a default fallback (`pi-coding-spike`), requiring script modification to test other agent configurations.
[ISSUE-ID] P2 bug evals/bin/run-eval.sh:27 — Pipeline does not verify the successful creation of `SPEC.md` or `PLAN.md` before proceeding, risking cascading failures from earlier stages.
[ISSUE-ID] P3 code-quality evals/bin/run-eval.sh:34 — `ls -t` combined with `head -1` is fragile for checkpoint selection and may behave unexpectedly if multiple checkpoints exist simultaneously.
[ISSUE-ID] P3 bug evals/bin/run-eval.sh:43 — File copy operations use `|| true` to suppress errors, silently ignoring missing artifacts and potentially resulting in incomplete result directories.

### module-004
[ISSUE-001] P1 [security] steps/45-setup-forge.sh:16 — Idempotency check bypassed if `git clone` fails due to hardcoded HTTPS URL for a private repo, forcing insecure manual intervention or incomplete setup
[ISSUE-002] P2 [bug] steps/45-setup-forge.sh:38 — State file (`$STEP.done`) is marked done even if `npm ci` or validation jigs fail, assuming success on subsequent runs
[ISSUE-003] P2 [performance] steps/45-setup-forge.sh:27 — `git pull` executed without checking network connectivity or merge conflicts, risking hanging or inconsistent repository state
[ISSUE-004] P3 [usability] steps/45-setup-forge.sh:33 — `npm ci` redirects stderr to /dev/null, hiding critical dependency resolution errors from the user during failure
[ISSUE-005] P3 [code-quality] steps/45-setup-forge.sh:36 — Validation `jigs/run-all.sh` runs unconditionally even if `npm ci` failed, likely causing false negative warnings

### module-005
[ISSUE-1] P1 [security] jigs/cheap-model-self-test.sh:2 — Missing `set -e` in `#!/usr/bin/env bash` prevents script exit on command failure, weakening validation integrity
[ISSUE-2] P2 [performance] jigs/master-plan-unique.sh:33 — Repeated `diff -q` commands inside loop instead of comparing checksums for performance
[ISSUE-3] P2 [code-quality] jigs/master-plan-unique.sh:11 — Variable `PARENT` defaults to `$HOME` which may be incorrect in non-standard local dev environments
[ISSUE-4] P2 [architecture] jigs/no-trailing-whitespace.sh:8 — Script relies on side-effect of passing positional argument `$1` without validation, breaking standard invocation patterns

### module-006
[BUD-005] P2 bug budget.mjs:46 — `Atomics.wait` throws in non-SharedArrayBuffer environments/threads and crashes the CLI
[BUD-006] P3 performance budget.mjs:46 — `Atomics.wait` blocks the main thread preventing handling of signals (e.g., SIGINT) during lock wait
[BUD-007] P1 security budget.mjs:56 — Stale lock detection relies on `statSync(ownerFile)` mtime instead of the timestamp written inside the file, causing validation failure
[BUD-008] P2 code-quality budget.mjs:86 — `renameSync` fallback on cross-device error performs non-atomic direct write, corrupting state if process crashes mid-write

### module-007
[ISSUE-001] P0 [code-quality] lifecycle/context/myhr/index.md:1 — Dirty repository state (1 file) undermines analysis integrity
[ISSUE-002] P2 [ux] lifecycle/context/test-repo/module-001.md:12 — Missing Content-Type or charset declaration in PHP snippet
[ISSUE-003] P3 [code-quality] lifecycle/context/test-repo/index.md:6 — Git telemetry (Branch/Last/Commits) is empty but scan reported success

### module-009
[ISSUE-1] P2 architecture pipeline/build-run-pipeline.json:4 — "DOGFOOD" workflow uses `repo-build` mode to self-modify the runner logic, creating a circular dependency risk if the upgrade fails or breaks the JSON parser.
[ISSUE-2] P3 code-quality pipeline/demo.json:14 — JSON message value ends abruptly with "Yo" without closing quotes or complete instruction, indicating an incomplete or truncated definition.
[ISSUE-3] P3 bug pipeline/build-run-pipeline.json:9 — Handoff target `spike/workdir/pi-software/INBOX-handoff.md` path seems mismatched for `repo-build` mode (which expects repo-root context), potentially causing file-not-found errors during dispatch.

### module-010
[ISSUE-001] P2 bug playbooks/software.md:46 — File content is truncated mid-sentence ("Identify issues per"), resulting in incomplete workflow definition and missing tool documentation
[ISSUE-002] P3 bug playbooks/marketing.md:46 — File ends abruptly after the "Quality Gates" section header, missing the "Tool: `muse`" definition block present in other playbooks
[ISSUE-003] P3 bug playbooks/marketing.md:1 — Marketing Phase 1 outputs `brand-context.json`, conflicting with brand.md which outputs `brand-context.json` + reports, risking data collision
[ISSUE-004] P3 code-quality playbooks/brand.md:5 — Inconsistent workflow naming convention: uses "DEFINE, DOCUMENT, ENFORCE, EVOLVE" instead of the standard "SCAN, PLAN, EXECUTE, MEASURE" used elsewhere

### module-011
[ISSUE-1] P2 security protocols/CHECKPOINT.md:48 — Authentication relies solely on filesystem access, lacking verification of user identity (e.g., git user/Telegram ID).
[ISSUE-2] P2 bug protocols/BUDGET.md:13 — `max_usd` financial cap is unenforced in text-mode runs, bypassing the budget ceiling.
[ISSUE-3] P3 bug protocols/CONCURRENCY.md:1 — Concurrency documentation is truncated mid-sentence, leaving the design incomplete.

### module-012
[LOG-001] P2 stability runs/2026-06-01.jsonl:3 — Pipeline aborted due to GLM API rate limiting (`rate_limited`).
[LOG-002] P2 performance runs/2026-06-01.jsonl:4-24 — High frequency of `spawnSync /bin/sh ETIMEDOUT` errors requiring multiple retries to succeed.
[LOG-003] P3 code-quality runs/2026-05-30.jsonl:1 — Presence of `_note` "mock/test data" in a production-like log file risks polluting analytics.
[LOG-004] P3 code-quality runs/2026-06-01.jsonl — Inconsistent schema usage (`batch`, `timeout_used`) vs earlier files indicates lack of strict data typing.
[LOG-005] P3 bug runs/2026-06-01.jsonl:25 — Incomplete final log entry (truncated JSON) indicates a logging write failure or crash.

### module-013
[ISSUE-1] P1 bug spike/production-api-test.sh:92 — Short-circuit logic in `grep` check causes script to report PASS regardless of match due to missing control operators.
[ISSUE-2] P0 security spike/production-api-test.sh:16 — Password stored in `LOGIN_PASSWORD` variable is passed via command line argument `-d`, exposing it in process list (e.g., `ps`).
[ISSUE-3] P2 bug spike/production-api-test.sh:27 — `set -euo pipefail` combined with python3 stderr redirection allows parsing failures to silently set `TOKEN` to empty string instead of failing fast.
[ISSUE-4] P2 bug spike/production-api-test.sh:138 — Script is truncated mid-function/flow, resulting in incomplete test coverage and potential execution errors.

### module-014
[ISSUE-001] P2 [code-quality] templates/AGENTS.md.tmpl:19 — Documentation for schema enforcement refers to `jigs/gear-contract-valid.sh`, implying external dependency validation that might fail silently if the jig is missing or executable permissions are incorrect.
[ISSUE-002] P3 [ux] templates/AGENTS.md.tmpl:29 — Error handling for missing `{{PLAYBOOK}}` is documented as a manual instruction rather than a fail-safe in the provisioning script, risking agents running without domain playbooks if manifests are malformed.
[ISSUE-003] P3 [security] templates/projects/astro/AGENTS.md:3 — Recommends `npm install` which can mutate lockfiles (`package-lock.json`); enforce `npm ci` exclusively in production-grade builds to ensure reproducibility.

### module-015
[ROOT-001] P1 [security] AI-EXECUTOR-BRIEF.md:10 — Instructions contain example API key (`sk-ant-...`) which risks accidental commit or exposure if not handled carefully


## Execution Plan
```json
{
  "id": "sabbk-forge-audit-2026-06-02",
  "mode": "apply",
  "total_batches": 18,
  "batches": [
    {
      "id": "B001",
      "title": "Fix Clean Lifecycle State",
      "severity": "P0",
      "files": ["lifecycle/context/myhr/index.md"],
      "acceptance_criteria": [
        "Repository is in a clean state with no uncommitted changes"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B002",
      "title": "Secure Production API Test Script",
      "severity": "P0",
      "files": ["spike/production-api-test.sh"],
      "acceptance_criteria": [
        "Password is no longer passed via CLI arguments",
        "Sensitive data is read from environment variables or secure stdin",
        "Script execution is verified against process list exposure"
      ],
      "depends_on": [],
      "risk": "high"
    },
    {
      "id": "B003",
      "title": "Fix API Test Logic and Truncation",
      "severity": "P1",
      "files": ["spike/production-api-test.sh"],
      "acceptance_criteria": [
        "Short-circuit logic in grep check is fixed to report actual status",
        "Truncated function/flow is completed or removed",
        "Set -euo pipefail works correctly with python3 redirection"
      ],
      "depends_on": ["B002"],
      "risk": "medium"
    },
    {
      "id": "B004",
      "title": "Secure Forge Setup URL",
      "severity": "P1",
      "files": ["steps/45-setup-forge.sh"],
      "acceptance_criteria": [
        "Git clone uses secure, variable-based URL",
        "Idempotency check handles clone failures gracefully"
      ],
      "depends_on": [],
      "risk": "medium"
    },
    {
      "id": "B005",
      "title": "Fix Lock Validation Logic",
      "severity": "P1",
      "files": ["budget.mjs"],
      "acceptance_criteria": [
        "Stale lock detection uses timestamp inside the file",
        "Logic does not rely on filesystem mtime"
      ],
      "depends_on": [],
      "risk": "medium"
    },
    {
      "id": "B006",
      "title": "Add Error Handling to Self-Test",
      "severity": "P1",
      "files": ["jigs/cheap-model-self-test.sh"],
      "acceptance_criteria": [
        "Shebang includes `set -e`",
        "Script exits immediately on command failure"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B007",
      "title": "Sanitize Brief Documentation",
      "severity": "P1",
      "files": ["AI-EXECUTOR-BRIEF.md"],
      "acceptance_criteria": [
        "Example API key is removed or replaced with a placeholder",
        "No sensitive strings remain in the file"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B008",
      "title": "Fix Forge Setup State Management",
      "severity": "P2",
      "files": ["steps/45-setup-forge.sh"],
      "acceptance_criteria": [
        "Step file is not marked done if npm ci or validation fails",
        "Validation runs only if npm ci succeeds",
        "npm ci stderr is visible for debugging"
      ],
      "depends_on": ["B004"],
      "risk": "medium"
    },
    {
      "id": "B009",
      "title": "Fix Forge Git Network Handling",
      "severity": "P2",
      "files": ["steps/45-setup-forge.sh"],
      "acceptance_criteria": [
        "Git pull checks for connectivity",
        "Merge conflicts are detected before proceeding"
      ],
      "depends_on": ["B004"],
      "risk": "medium"
    },
    {
      "id": "B010",
      "title": "Refactor Budget Lock Operations",
      "severity": "P2",
      "files": ["budget.mjs"],
      "acceptance_criteria": [
        "Atomics.wait replaced with non-blocking alternative or handled in worker",
        "SIGINT signals are handled during wait",
        "RenameSync fallback ensures atomicity"
      ],
      "depends_on": ["B005"],
      "risk": "high"
    },
    {
      "id": "B011",
      "title": "Secure Checkpoint Metadata",
      "severity": "P2",
      "files": ["bin/checkpoint.sh"],
      "acceptance_criteria": [
        "Variables in echo statements are quoted",
        "Injection of malicious characters is prevented"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B012",
      "title": "Fix Checkpoint Selection Reliability",
      "severity": "P2",
      "files": ["bin/checkpoint.sh"],
      "acceptance_criteria": [
        "Resume command sorts checkpoints deterministically",
        "Logic does not rely on non-sequential filesystem timestamps"
      ],
      "depends_on": ["B011"],
      "risk": "low"
    },
    {
      "id": "B013",
      "title": "Fix Health Check Script",
      "severity": "P2",
      "files": ["bin/forge-health.sh"],
      "acceptance_criteria": [
        "Grep pattern is compatible with macOS (BSD) and GNU",
        "Script iterates completely over SCAN_FILES"
      ],
      "depends_on": [],
      "risk": "medium"
    },
    {
      "id": "B014",
      "title": "Hardening Jigs Scripts",
      "severity": "P2",
      "files": [
        "jigs/master-plan-unique.sh",
        "jigs/no-trailing-whitespace.sh"
      ],
      "acceptance_criteria": [
        "Checksums used instead of repeated diff in master-plan-unique.sh",
        "PARENT variable validation added",
        "Positional argument validation added in no-trailing-whitespace.sh"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B015",
      "title": "Fix Evaluation Pipeline Robustness",
      "severity": "P2",
      "files": ["evals/bin/run-eval.sh"],
      "acceptance_criteria": [
        "Pipeline verifies existence of SPEC.md and PLAN.md",
        "File copy operations do not suppress errors"
      ],
      "depends_on": [],
      "risk": "medium"
    },
    {
      "id": "B016",
      "title": "Refactor Pipeline Configurations",
      "severity": "P2",
      "files": [
        "pipeline/build-run-pipeline.json",
        "pipeline/demo.json"
      ],
      "acceptance_criteria": [
        "Circular dependency risk in DOGFOOD workflow addressed",
        "Truncated JSON message in demo.json fixed",
        "Handoff path matches repo-root context"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B017",
      "title": "Complete Playbooks and Protocols",
      "severity": "P2",
      "files": [
        "playbooks/software.md",
        "playbooks/marketing.md",
        "protocols/BUDGET.md",
        "protocols/CONCURRENCY.md"
      ],
      "acceptance_criteria": [
        "Truncated sentences in playbooks completed",
        "max_usd cap enforcement logic added to text-mode runs",
        "Concurrency documentation completed"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B018",
      "title": "Cleanup Code Quality and Docs",
      "severity": "P3",
      "files": [
        "evals/bin/run-eval.sh",
        "lifecycle/context/test-repo/module-001.md",
        "lifecycle/context/test-repo/index.md",
        "runs/2026-06-01.jsonl",
        "templates/AGENTS.md.tmpl",
        "templates/projects/astro/AGENTS.md",
        "playbooks/brand.md",
        "protocols/CHECKPOINT.md"
      ],
      "acceptance_criteria": [
        "Hardcoded AGENT_ID removed or parameterized",
        "Fragile ls -t | head -1 replaced",
        "Content-Type charset added to PHP snippet",
        "Mock data removed from logs, schema consistent",
        "Documentation aligned with standard conventions"
      ],
      "depends_on": [],
      "risk": "low"
    }
  ]
}
```