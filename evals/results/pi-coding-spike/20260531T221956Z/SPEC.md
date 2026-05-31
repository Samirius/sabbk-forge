# SPEC — `no-trailing-whitespace.sh` jig

**Source:** `spike/TASK.md`
**Agent:** pi-coding-spike
**Date:** 2026-06-01
**Phase:** SPEC (pre-plan)

---

## 1. Problem

The Sabbk forge has no automated check that tracked `.md` and `.sh` files are free of trailing
whitespace. This causes noisy diffs and editor churn. Writing this jig also dogfoods the jig
system — proving one Pi Coding Agent can go spec → plan → build → validate end to end.

## 2. Deliverable

A single, self-contained shell script at:

```
./build/no-trailing-whitespace.sh
```

…ready for a human to later PR into `jigs/`.

## 3. Behavioural specification

### Invocation

```bash
bash no-trailing-whitespace.sh [DIRECTORY]
```

- `DIRECTORY` defaults to the git repo root (`git rev-parse --show-toplevel`).
- Must fail fast with a clear message if the directory is not inside a git repo.

### File enumeration

- **MUST** use `git ls-files` to list tracked files — never `find` or glob expansion.
- Filter to `*.md` and `*.sh` only (case-sensitive).
- Submodules, ignored files, and untracked files are excluded automatically by `git ls-files`.

### Detection

- Detect lines ending with one or more whitespace characters (spaces or tabs) before the newline.
- Pattern: `[[:space:]]+$` applied per-line.

### Output on failure

- Print one line per violation: `<relative-path>:<line-number>`.
- Print a summary: `❌ <N> trailing-whitespace violation(s) found`.
- Exit with code **1**.

### Output on success

- Print: `✅ no-trailing-whitespace OK`.
- Exit with code **0**.

## 4. Style & conventions (derived from existing jigs)

Observed in `jigs/stack-node-ts.sh`, `jigs/master-plan-unique.sh`, `jigs/gear-contract-valid.sh`:

| Convention | Requirement |
|---|---|
| Shebang | `#!/usr/bin/env bash` |
| Safety flags | `set -euo pipefail` |
| Header comment | `# jig: <one-line description>` |
| ROOT resolution | `git rev-parse --show-toplevel` or `$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)` |
| Dependencies | Only bash, grep, git, sed, awk — no npm/pip/curl/etc. |
| Pass/fail output | `✅ <name> OK` on pass, `❌ <name> FAILED` on fail |
| Portability | Runs on any system with bash + git (Linux/macOS) |

## 5. Acceptance criteria (checkable)

| # | Criterion | Verification method |
|---|---|---|
| AC-1 | Deliverable is a single file at `./build/no-trailing-whitespace.sh` | `test -f ./build/no-trailing-whitespace.sh` exits 0 |
| AC-2 | Running against a directory with a trailing-whitespace violation exits nonzero and prints the offending `file:line` | Create a temp git repo with a `.md` file containing trailing spaces; run the jig; assert exit ≠ 0 and output contains `<filename>:<lineno>` |
| AC-3 | Running against a clean directory exits 0 and prints a success line | Strip trailing whitespace from the test files; run; assert exit = 0 and output contains `✅` |
| AC-4 | Uses only POSIX/bash + standard tools — no npm, no external installs | Grep script for `\b(curl\|wget\|npm\|pip\|npx\|yarn\|brew)\b` — no matches |
| AC-5 | Enumerates candidate files with `git ls-files` — NOT `find` | `grep 'ls-files'` finds ≥ 1 hit; `grep -E '^\s*find\s'` finds 0 hits |
| AC-6 | `./VALIDATION.md` documents each criterion with pass/fail and the actual command output | File exists; contains six AC sections, each with a verdict and pasted evidence |

## 6. Out of scope

- Modifying `sabbk-workshop/`, `jigs/run-all.sh`, or any repo outside `spike/workdir/pi-coding-spike/`.
- Auto-fixing trailing whitespace (detection only).
- Checking files other than `.md` and `.sh`.
- CI integration (human wires that in later).

## 7. Dependencies & assumptions

- The forge repo (`sabbk-forge`) is available and is a git repository.
- Bash ≥ 4.0 and `git` are available in the execution environment.
- No network access required.
