# Software Playbook (forge)

> The forge: scan code → find issues → plan fixes → execute via pi-software.

## Phases

### Phase 1: SCAN
- Read the repo codebase
- Build structured context (modules, stack, patterns, issues)
- Output: `scan.json` + `module-*.md` files

### Phase 2: PLAN
- Read scanner context (NOT raw code)
- Identify issues per module
- Group into fix batches with acceptance criteria
- Output: `plan.json` with batches

### Phase 3: EXECUTE
- For each batch: SPEC → PLAN → BUILD → VALIDATE
- pi-software agent does the actual coding
- Eval gates between each stage
- Output: VALIDATION.md with pass/fail per AC

### Phase 4: VERIFY
- Run jigs
- Run eval suite
- Verify no regressions

## Quality Gates
- Scanner eval: structural (6 checks, free)
- Plan eval: validity (8 checks, ~$0.01)
- Batch eval: per-batch (existing framework)
- Summary eval: aggregate pass rate

## Tool: `forge`
```
forge scan <repo>       → build context
forge audit <repo>      → scan + plan
forge apply <plan.json> → execute batches
forge eval <type> <path> → quality eval
forge status            → current state
```
