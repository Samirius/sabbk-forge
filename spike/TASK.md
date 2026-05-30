# Spike Task — author a new jig (internal forge work, no client involvement)

**objective:** Produce a new Sabbk jig, `no-trailing-whitespace.sh`, that a human can later drop into
`sabbk-workshop/jigs/`. It must fail (exit nonzero) if any tracked `.md` or `.sh` file under a given
directory has trailing whitespace, and pass (exit 0) otherwise — following the conventions of the
existing jigs (clear violation message naming the file+line, runnable standalone, no external deps).

**Why this task:** it is small, purely internal, verifiable, and it dogfoods the jig system itself —
the ideal proof that one Pi Coding Agent can go spec → plan → build → validate end to end.

**acceptance_criteria:**
1. Deliverable is a single file at `./build/no-trailing-whitespace.sh`.
2. Running it against a directory with a trailing-whitespace violation exits nonzero and prints the
   offending `file:line`.
3. Running it against a clean directory exits 0 and prints a success line.
4. It uses only POSIX/bash + standard tools (grep/sed/git) — no npm, no external installs.
5. It MUST enumerate candidate files with `git ls-files` (tracked files only) — NOT `find`. The Validate stage greps the script to confirm `git ls-files` is used.
6. `./VALIDATION.md` shows each criterion with pass/fail and the evidence (the actual command output).

**boundaries:** write only inside `spike/workdir/pi-coding-spike/`. Do not modify `sabbk-workshop` or any
other repo — a human will PR the jig there later.
