# Eval Task 001: Trailing Whitespace Jig

**objective:** Produce a bash jig `no-trailing-whitespace.sh` that detects trailing whitespace in tracked `.md` and `.sh` files.

**acceptance_criteria:**
1. Deliverable is a single file at `./build/no-trailing-whitespace.sh`.
2. Running it against a directory with a trailing-whitespace violation exits nonzero and prints the offending `file:line`.
3. Running it against a clean directory exits 0 and prints a success line.
4. It uses only POSIX/bash + standard tools (grep/sed/git) — no npm, no external installs.
5. It MUST enumerate candidate files with `git ls-files` (tracked files only) — NOT `find`.
6. `./VALIDATION.md` shows each criterion with pass/fail and the evidence (the actual command output).

**boundaries:** write only inside `spike/workdir/pi-coding-spike/`.
