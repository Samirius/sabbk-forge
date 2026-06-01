# CRO Playbook (prism)

> Conversion optimization: scan site → find friction → plan tests → execute A/B experiments.

## Phases

### Phase 1: SCAN
- Crawl site pages (HTML, CSS, JS)
- Pull analytics (Core Web Vitals, conversion rates, bounce rates)
- Capture heatmaps if available
- Output: `site-context.json` + page inventory + performance metrics

### Phase 2: PLAN
- Identify UX friction points
- Generate test hypotheses ranked by expected impact
- Design A/B test variants with clear success metrics
- Output: `test-plan.json` with hypotheses, variants, expected lift

### Phase 3: EXECUTE
- pi-cro designs test variants
- pi-software implements A/B variants in code
- Deploy to staging for QA
- Output: test variants ready for traffic splitting

### Phase 4: MEASURE
- Run tests to statistical significance
- Analyze results (winner, lift, confidence)
- Document learnings for future tests
- Output: test results + learning database entry

## Quality Gates
- Hypothesis quality (clear, measurable, falsifiable)
- Variant implementation matches design spec
- No negative impact on page performance
- Statistical significance before declaring winner

## Tool: `prism`
```
prism scan <site>       → current performance
prism audit <site>      → UX friction + opportunities
prism plan <site>       → test plan with hypotheses
prism execute <plan>    → build + deploy variants
prism measure <site>    → analyze test results
```
