# VALIDATION — `no-trailing-whitespace.sh` jig

**Date:** 2026-06-01
**Agent:** pi-coding-spike
**Artifact:** `./build/no-trailing-whitespace.sh`
**Spec:** `./SPEC.md` §5 (six acceptance criteria)

All tests run fresh against the built artifact. No cached results.

---

## AC-1 — Deliverable is a single file at `./build/no-trailing-whitespace.sh`

```
$ test -f ./build/no-trailing-whitespace.sh && echo "PASS"
PASS

$ ls -la ./build/no-trailing-whitespace.sh
-rwxrwxr-x 1 stark stark 913 Jun  1 01:18 ./build/no-trailing-whitespace.sh
```

**Verdict: ✅ PASS**

---

## AC-2 — Violation detected: exits nonzero and prints `file:line`

**Setup:** temp git repo with three tracked files:
- `dirty.md` — trailing spaces on lines 1 and 3
- `dirty.sh` — trailing tab on line 2
- `clean.md` — no trailing whitespace (negative control)

```
$ bash ./build/no-trailing-whitespace.sh /tmp/tmp.xxx
dirty.md:1
dirty.md:3
dirty.sh:2
❌ 3 trailing-whitespace violation(s) found
exit code: 1
```

| Assertion | Result |
|---|---|
| Exit code ≠ 0 | ✅ (got 1) |
| `dirty.md:1` in output | ✅ FOUND |
| `dirty.md:3` in output | ✅ FOUND |
| `dirty.sh:2` in output | ✅ FOUND |
| `clean.md` not reported | ✅ correctly absent |
| Summary line present | ✅ FOUND |

**Verdict: ✅ PASS**

---

## AC-3 — Clean directory: exits 0, prints success line

**Setup:** temp git repo with clean `.md` and `.sh` files (no trailing whitespace).

```
$ bash ./build/no-trailing-whitespace.sh /tmp/tmp.yyy
✅ no-trailing-whitespace OK
exit code: 0
```

| Assertion | Result |
|---|---|
| Exit code = 0 | ✅ |
| Output contains `✅` | ✅ FOUND |

**Verdict: ✅ PASS**

---

## AC-4 — Uses only POSIX/bash + standard tools, no external installs

```
$ grep -nE '\b(curl|wget|npm|pip|npx|yarn|brew|apt|dnf|gem|cargo)\b' ./build/no-trailing-whitespace.sh
(no match — exit code 1)
PASS: no external deps
```

Tools actually used:
```
bash
echo
git
grep
read
```

All are standard POSIX/bash tools. No network fetchers, no package managers.

**Verdict: ✅ PASS**

---

## AC-5 — Enumerates candidate files with `git ls-files`, NOT `find`

**Positive — `ls-files` present:**
```
$ grep -n 'ls-files' ./build/no-trailing-whitespace.sh
24:done < <(git -C "$DIR" ls-files -- '*.md' '*.sh')
```
One occurrence, filtering to `'*.md' '*.sh'` only. ✅

**Negative — no `find` command:**
```
$ grep -nE '^\s*find\s' ./build/no-trailing-whitespace.sh
(no match — exit code 1)
PASS: no find command
```

**Verdict: ✅ PASS**

---

## AC-6 — `./VALIDATION.md` documents each criterion with pass/fail and evidence

This file is self-proving. It contains:
- Six numbered AC sections (AC-1 through AC-6, this one included).
- Each section has a pass/fail verdict.
- Each section includes pasted command output as evidence.

**Verdict: ✅ PASS**

---

## Summary

| AC | Criterion | Verdict |
|----|-----------|---------|
| AC-1 | Single file at `./build/no-trailing-whitespace.sh` | ✅ PASS |
| AC-2 | Dirty repo → exit 1 + `file:line` output | ✅ PASS |
| AC-3 | Clean repo → exit 0 + `✅` output | ✅ PASS |
| AC-4 | No external dependencies | ✅ PASS |
| AC-5 | `git ls-files` used, `find` absent | ✅ PASS |
| AC-6 | This document with per-AC verdicts + evidence | ✅ PASS |

**All 6 acceptance criteria: PASS ✅**
