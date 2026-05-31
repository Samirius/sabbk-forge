# PLAN — `no-trailing-whitespace.sh` jig

**Spec:** `./SPEC.md`
**Agent:** pi-coding-spike
**Date:** 2026-06-01
**Phase:** PLAN (pre-build, requires human approval)

---

## Files to create

| # | Path | Purpose |
|---|---|---|
| F-1 | `./build/no-trailing-whitespace.sh` | The jig — single deliverable |
| F-2 | `./VALIDATION.md` | Evidence that every AC passes |

No other files will be created or modified.

---

## Build steps

### Step 1 — Create `./build/` and write the jig

Write `./build/no-trailing-whitespace.sh` with this structure:

```bash
#!/usr/bin/env bash
# jig: no tracked .md or .sh file has trailing whitespace (spaces/tabs before newline).
set -euo pipefail
```

**Logic (in order):**

1. **Resolve target directory.** Accept optional `$1`; default to `$(git rev-parse --show-toplevel)`.
   If not inside a git repo, `git rev-parse` fails and `set -e` aborts with a clear error.
2. **Validate it's a git repo.** Run `git -C "$DIR" rev-parse --is-inside-work-tree` — if false,
   print `❌ not a git repository: $DIR` to stderr and exit 1.
3. **Enumerate tracked files.**
   ```
   git -C "$DIR" ls-files -- '*.md' '*.sh'
   ```
   Lists only tracked `.md` and `.sh` files. No `find`, no glob.
4. **Scan each file.** Loop over the file list with `while IFS= read -r file` (handles spaces in
   filenames). For each file, run:
   ```
   grep -nE '[[:space:]]+$' "$DIR/$file"
   ```
   Parse the `lineno:content` output; print `<relpath>:<lineno>` per hit. Increment a
   `VIOLATIONS` counter.
5. **Report.**
   - Violations > 0 → print `❌ <N> trailing-whitespace violation(s) found`, exit 1.
   - Violations = 0 → print `✅ no-trailing-whitespace OK`, exit 0.

**Key detail:** Use `git -C "$DIR"` throughout so the script works regardless of cwd. Use
`|| true` after grep so a clean file doesn't trip `set -e`.

### Step 2 — Make executable

`chmod +x ./build/no-trailing-whitespace.sh`

### Step 3 — Validate AC-1 through AC-6 → produce `./VALIDATION.md`

Run each AC test against the built script using a throwaway temp git repo. Capture actual command
output as evidence. Full procedure per AC below.

---

## Validation plan — per AC

### AC-1 — File exists

```bash
test -f ./build/no-trailing-whitespace.sh && echo "PASS" || echo "FAIL"
ls -la ./build/no-trailing-whitespace.sh
```

Evidence: `test` result + `ls` output.

### AC-2 — Violation detected (nonzero exit + `file:line` output)

1. `mktemp -d` → TMP, `cd` into it, `git init`.
2. Create `dirty.md` with `printf 'hello   \nworld\ngoodbye   \n'` (trailing spaces on lines 1, 3).
3. Create `dirty.sh` with `printf '#!/usr/bin/env bash\necho hi\t\n'` (trailing tab on line 2).
4. Create `clean.md` with `printf 'all clean\nhere\n'` (no trailing whitespace — negative control).
5. `git add -A && git commit -m "dirty test"`.
6. Run: `bash $JIG "$TMP"`; capture exit code + output.
7. Assert: exit ≠ 0, output contains `dirty.md:1`, `dirty.md:3`, `dirty.sh:2`, does NOT contain `clean.md`.

Evidence: pasted output and exit code.

### AC-3 — Clean directory (exit 0 + success line)

1. Same TMP repo. Overwrite files with clean content:
   - `printf 'hello\nworld\ngoodbye\n' > dirty.md`
   - `printf '#!/usr/bin/env bash\necho hi\n' > dirty.sh`
2. `git add -A && git commit -m "clean test"`.
3. Run jig; capture exit code + output.
4. Assert: exit = 0, output contains `✅`.

Evidence: pasted output and exit code.

### AC-4 — No external dependencies

```bash
grep -nE '\b(curl|wget|npm|pip|npx|yarn|brew|apt|dnf|gem|cargo)\b' ./build/no-trailing-whitespace.sh \
  && echo "FAIL" || echo "PASS: no external deps"
```

Word-boundary `\b` prevents false positive (e.g. `pipefail` matching `pip`).

Evidence: grep output.

### AC-5 — `git ls-files` present, `find` absent

```bash
# Positive
grep -n 'ls-files' ./build/no-trailing-whitespace.sh
# Negative
grep -nE '^\s*find\s' ./build/no-trailing-whitespace.sh && echo "FAIL" || echo "PASS"
```

Evidence: both grep outputs.

### AC-6 — VALIDATION.md exists with per-AC verdicts + evidence

Self-proving: the file itself, with six AC sections, each containing a pass/fail verdict and
pasted command output.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Editor strips trailing spaces from test files | Use `printf` to write bytes explicitly in validation |
| Relative path breaks when `cd` into temp repo | Use absolute `$JIG` path throughout |
| `pipefail` falsely matches `pip` in AC-4 grep | Use `\b` word-boundary regex |

---

## Checkpoint

Per gear contract: **after_plan_before_build** → policy `AlwaysConfirm`.

> **Human: approve this PLAN to proceed to BUILD?**

I will not write `./build/no-trailing-whitespace.sh` or `./VALIDATION.md` until explicitly authorised.
