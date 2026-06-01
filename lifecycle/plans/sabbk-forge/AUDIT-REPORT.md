# AUDIT-REPORT.md

# Forge Audit Report — sabbk-forge

**Date:** 2026-06-01
**Repo:** sabbk-forge @ `ad57c2b` (main)
**Auditor:** Automated senior review
**Files reviewed:** 48 across 14 modules
**Issues found:** 12 (P0: 1, P1: 2, P2: 6, P3: 3)

---

## Summary

The project is a shell/JS orchestration layer for AI coding agents. The most critical finding is a **shell-level command injection** in `bin/forge-log.sh` where unsanitized JSONL data is interpolated into a `node -e` string. Two P1 issues — a second injection vector in `checkpoint.sh` and a logic bug that prevents `npm ci` from ever running in the installer — round out the high-impact items. Budget enforcement has race-condition and negative-value gaps that could allow cap bypass under concurrent use.

---

## Issues

### SEC-001 — Command injection via unsanitized `$line` in `node -e` ⚠️ P0

| | |
|---|---|
| **Category** | security |
| **File** | `bin/forge-log.sh:45-55` |
| **Risk** | high |
| **Description** | The `while` loop reads JSONL lines into `$line`, then interpolates them into a `node -e "…JSON.parse('$line')…"` string. A single quote in any JSONL record breaks out of the JS string literal, allowing arbitrary code execution. A crafted line like `x'});require('child_process').execSync('touch /tmp/pwned');//` would execute when the log viewer runs. |
| **Fix** | Replace the `node -e` inline script with a proper `.mjs` file that reads JSON from stdin or a file argument, eliminating shell interpolation entirely. Alternatively, pipe each line through `node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);…})"` reading from stdin. |

---

### SEC-002 — Command injection via unquoted heredoc with `$ARG` ⚠️ P1

| | |
|---|---|
| **Category** | security |
| **File** | `bin/checkpoint.sh:29-42` |
| **Risk** | medium |
| **Description** | The `request` command writes `$ARG` (the question text) into an **unquoted** heredoc (`<<EOF`, not `<<'EOF'`). Shell command substitutions like `$(malicious_cmd)` inside ARG are expanded and executed. Since ARG originates from agent LLM output, a prompt-injection attack on the agent could achieve code execution on the host. |
| **Fix** | Either switch to a quoted heredoc (`<<'EOF'`) and write `$ARG` via a separate `sed`/`printf` append, or sanitize ARG by escaping `$` and backticks before insertion. |

---

### BUG-001 — `package.json` existence check uses `-d` (directory) instead of `-f` (file) ⚠️ P1

| | |
|---|---|
| **Category** | bug |
| **File** | `installer/steps/45-setup-forge.sh:33` |
| **Risk** | medium |
| **Description** | `if [ -d "$FORGE_DIR/package.json" ]; then` tests whether `package.json` is a **directory**. It is always a file, so the test always fails and `npm ci` is never executed. Users get no dependency installation from the installer. |
| **Fix** | Change `-d` to `-f`. |

---

### BUG-002 — Race condition on concurrent budget-state reads/writes ⚠️ P2

| | |
|---|---|
| **Category** | bug |
| **File** | `lib/budget.mjs:18-19` (`load`/`save`) |
| **Risk** | medium |
| **Description** | `load()` reads `budget-state.json`, increments `turns`, then `save()` writes it back. Two concurrent `guard` calls can both read the same state, both increment, and the second write overwrites the first — allowing the turn count to undercount. Under load, `max_turns` can be exceeded. |
| **Fix** | Use `mkdir`-based locking (atomic on POSIX), or rewrite as a single atomic update: read → check → write in one locked section. A simple approach is `mkdir "$lockdir"` (exits non-zero if exists) as a mutex. |

---

### BUG-003 — Negative USD values subvert budget ceiling ⚠️ P2

| | |
|---|---|
| **Category** | bug |
| **File** | `lib/budget.mjs:28` |
| **Risk** | medium |
| **Description** | `parseFloat(arg)` accepts negative numbers. Recording `-$50` decreases cumulative spend, allowing an agent or caller to artificially reset the budget and bypass `max_usd`. |
| **Fix** | Validate: `const usd = parseFloat(arg); if (usd < 0) { console.error("negative cost rejected"); process.exit(2); }` |

---

### BUG-004 — Word-splitting on JSONL filenames with spaces ⚠️ P2

| | |
|---|---|
| **Category** | bug |
| **File** | `bin/forge-log.sh:22` |
| **Risk** | low |
| **Description** | `FILES=($(ls -1 "$RUNS_DIR"/*.jsonl …))` uses unquoted command substitution to build the array. Filenames containing spaces or glob characters are split incorrectly. |
| **Fix** | Use `mapfile -t FILES < <(ls -1 …)` or `shopt -s nullglob; FILES=("$RUNS_DIR"/*.jsonl)` then reverse in a loop. |

---

### BUG-005 — Malformed JSONL line crashes the log viewer ⚠️ P2

| | |
|---|---|
| **Category** | bug |
| **File** | `bin/forge-log.sh:45-55` |
| **Risk** | low |
| **Description** | If any JSONL line contains invalid JSON, `JSON.parse` throws inside `node -e`, causing that iteration to fail. With `set -euo pipefail`, this can abort the entire log display. |
| **Fix** | Wrap the parse in a try/catch and skip malformed lines, or pre-validate with a node script that handles errors gracefully. |

---

### CODE-001 — Hardcoded agent ID in eval runner ⚠️ P2

| | |
|---|---|
| **Category** | code-quality |
| **File** | `evals/bin/run-eval.sh:12` |
| **Risk** | low |
| **Description** | `AGENT_ID="pi-coding-spike"` is hardcoded. To evaluate a different agent, one must edit the script. This should be a CLI parameter. |
| **Fix** | Accept agent ID as a second positional argument with a default: `AGENT_ID="${2:-pi-coding-spike}"` (adjust arg positions accordingly). |

---

### CODE-002 — Fragile YAML parsing with grep+sed ⚠️ P2

| | |
|---|---|
| **Category** | code-quality |
| **File** | `evals/bin/run-suite.sh:17` |
| **Risk** | low |
| **Description** | `TASKS=$(grep '^\s*- ' "$SUITE_FILE" | sed 's/.*- //')` picks up any line starting with whitespace + `-`, including comments or nested structures. The subsequent `for TASK in $TASKS` also breaks on task names containing spaces. |
| **Fix** | Use a simple Node script to parse YAML (project already depends on Node), or enforce strict YAML formatting and add a comment filter (`grep -v '^\s*#'`). |

---

### CODE-003 — `load()` silently catches all errors ⚠️ P3

| | |
|---|---|
| **Category** | code-quality |
| **File** | `lib/budget.mjs:18` |
| **Risk** | low |
| **Description** | The `catch` block in `load()` returns `{turns:0, usd:0}` for any error — including permission denied, disk full, or corrupted JSON. This silently resets the budget, potentially allowing unlimited turns. |
| **Fix** | Distinguish `ENOENT` (expected — first run) from other errors, and let non-ENOENT errors propagate. |

---

### CODE-004 — Unnecessary `eval` in jig assertion helper ⚠️ P3

| | |
|---|---|
| **Category** | code-quality |
| **File** | `jigs/master-plan-unique.sh:16` |
| **Risk** | low |
| **Description** | `_assert() { if eval "$2"; then …` uses `eval` where plain `eval` is unnecessary. Current callers pass hardcoded test strings, so there's no live exploit, but `eval` is a hazardous pattern that should be avoided on principle. |
| **Fix** | Replace `eval "$2"` with direct evaluation: run the test string as a command directly or restructure to pass a function name. |

---

### CODE-005 — Misleading variable name `$ID` used for file path ⚠️ P3

| | |
|---|---|
| **Category** | code-quality |
| **File** | `bin/checkpoint.sh:10,32` |
| **Risk** | low |
| **Description** | `$ID` is set from `$2` at the top. For the `answer` subcommand, `$2` is a checkpoint **file path**, but the variable is named `ID`, suggesting an agent identifier. The alias `F="$ID"` on line 32 is the only clue. This makes the code harder to reason about and maintain. |
| **Fix** | Don't set `ID` globally. Parse arguments per-subcommand inside each case branch with descriptive names. |

---

## Batch Plan

| Batch | Priority | Files touched | Issues |
|---|---|---|---|
| B001 | P0 | `bin/forge-log.sh` | SEC-001, BUG-004, BUG-005 |
| B002 | P1 | `bin/checkpoint.sh` | SEC-002, CODE-005 |
| B003 | P1 | `installer/steps/45-setup-forge.sh` | BUG-001 |
| B004 | P2 | `lib/budget.mjs` | BUG-002, BUG-003, CODE-003 |
| B005 | P2 | `evals/bin/run-eval.sh` | CODE-001 |
| B006 | P2 | `evals/bin/run-suite.sh` | CODE-002 |
| B007 | P3 | `jigs/master-plan-unique.sh` | CODE-004 |

---

```json
{
  "id": "sabbk-forge-audit-2026-06-01",
  "mode": "apply",
  "total_batches": 7,
  "batches": [
    {
      "id": "B001",
      "title": "Fix command injection, word-splitting, and crash-on-bad-JSON in forge-log.sh",
      "severity": "P0",
      "files": ["bin/forge-log.sh"],
      "acceptance_criteria": [
        "No shell variable is interpolated into a node -e string — JSON is passed via stdin or a temp file",
        "Filenames with spaces are handled correctly (no word-splitting on ls output)",
        "Malformed JSONL lines are skipped with a warning instead of crashing the viewer",
        "jigs/run-all.sh still passes (no trailing whitespace introduced)"
      ],
      "depends_on": [],
      "risk": "high"
    },
    {
      "id": "B002",
      "title": "Fix command injection in checkpoint heredoc and rename misleading $ID variable",
      "severity": "P1",
      "files": ["bin/checkpoint.sh"],
      "acceptance_criteria": [
        "The request heredoc no longer performs shell expansion on $ARG — command substitution in ARG text must not execute",
        "Checkpoint files are still correctly generated with the question text preserved literally",
        "Variable names inside each case branch are descriptive (no $ID alias for a file path in the answer branch)",
        "request/answer/resume commands still work end-to-end"
      ],
      "depends_on": [],
      "risk": "medium"
    },
    {
      "id": "B003",
      "title": "Fix installer package.json check: -d → -f",
      "severity": "P1",
      "files": ["installer/steps/45-setup-forge.sh"],
      "acceptance_criteria": [
        "Line 33 uses [ -f \"$FORGE_DIR/package.json\" ] instead of [ -d … ]",
        "npm ci is executed when package.json exists as a file"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B004",
      "title": "Fix race condition, negative-USD, and silent error-swallow in budget.mjs",
      "severity": "P2",
      "files": ["lib/budget.mjs"],
      "acceptance_criteria": [
        "Concurrent guard calls cannot undercount turns (mkdir-based or file-locking mutex)",
        "Negative USD values are rejected with an error and non-zero exit",
        "load() only returns defaults for ENOENT; other errors (EACCES, corrupt JSON) are propagated",
        "budget guard/record/reset commands still work correctly in single-process use"
      ],
      "depends_on": [],
      "risk": "medium"
    },
    {
      "id": "B005",
      "title": "Make eval runner agent ID configurable instead of hardcoded",
      "severity": "P2",
      "files": ["evals/bin/run-eval.sh"],
      "acceptance_criteria": [
        "Agent ID is accepted as an optional CLI argument with default pi-coding-spike",
        "Usage message reflects the new argument",
        "Existing eval invocations without the argument still work"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B006",
      "title": "Harden YAML task-list parsing in eval suite runner",
      "severity": "P2",
      "files": ["evals/bin/run-suite.sh"],
      "acceptance_criteria": [
        "Comment lines in the YAML file are not picked up as task names",
        "Task names with spaces are handled correctly (no word-splitting on the for loop)",
        "Existing suite YAML files still parse correctly"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B007",
      "title": "Remove eval from jig assertion helper in master-plan-unique.sh",
      "severity": "P3",
      "files": ["jigs/master-plan-unique.sh"],
      "acceptance_criteria": [
        "_assert no longer uses eval — the test expression is executed directly",
        "All existing assertions still pass"
      ],
      "depends_on": [],
      "risk": "low"
    }
  ]
}
```