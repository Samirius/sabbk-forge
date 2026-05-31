# Eval Task 003: Git Branch Lint Jig

**objective:** Produce a bash jig `branch-lint.sh` that checks if the current git branch name follows Sabbk conventions: must start with a known prefix (`feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, or `ai-`) and contain only lowercase letters, digits, and hyphens.

**acceptance_criteria:**
1. Deliverable is a single file at `./build/branch-lint.sh`.
2. On a valid branch like `feat/add-toc` it exits 0 and prints `✅ branch-lint OK: feat/add-toc`.
3. On an invalid branch like `MyBranch` or `unknown/something` it exits 1 and prints a clear error naming the violation.
4. It extracts the branch name from `git rev-parse --abbrev-ref HEAD` — no external deps.
5. The list of valid prefixes is defined as a variable at the top of the script for easy editing.
6. `./VALIDATION.md` shows each criterion with pass/fail and the evidence.

**boundaries:** write only inside `spike/workdir/pi-coding-spike/`.
