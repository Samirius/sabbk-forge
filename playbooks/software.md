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

### Phase 5: MEASURE
- Track deployment metrics (uptime, error rate, latency)
- Collect user feedback
- Measure against acceptance criteria from Phase 2
- Update documentation with real-world results
- Output: metrics report + retrospective

## Quality Gates
- Scanner eval: structural (6 checks, free)
- Plan eval: validity (8 checks, ~$0.01)
- Batch eval: per-batch (existing framework)
- Summary eval: aggregate pass rate
- Deployment health: no regressions in jigs

## Truncation Guard
- All playbooks must end with `## End` marker
- Jig `playbook-complete.sh` validates no truncation
- If file ends mid-sentence, CI fails

## End

## Tool: `forge`
```
forge scan <repo>       → build context
forge audit <repo>      → scan + plan
forge apply <plan.json> → execute batches
forge eval <type> <path> → quality eval
forge status            → current state
```
