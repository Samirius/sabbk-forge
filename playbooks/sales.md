# Sales Playbook (funnel)

> Lead-to-close pipeline: scan pipeline → qualify leads → propose → close.

## Phases

### Phase 1: SCAN
- Read CRM data (leads, deals, pipeline stages)
- Analyze past proposals (win/loss rates, pricing, timelines)
- Map service lines and pricing tiers
- Output: `pipeline-context.json` + lead inventory + win/loss analysis

### Phase 2: QUALIFY
- Score incoming leads (budget, authority, need, timeline)
- Match to service line (software, marketing, AI solutions)
- Prioritize by probability and revenue potential
- Output: qualified lead list with scores

### Phase 3: PROPOSE
- pi-sales generates proposal draft (scope, timeline, pricing)
- pi-pm reviews for feasibility
- Human review and approval checkpoint
- Output: proposal document ready to send

### Phase 4: CLOSE
- Contract generation
- Payment terms setup
- Handoff to pi-pm for delivery
- Output: signed contract + project kickoff

## Quality Gates
- Lead scoring accuracy (validated against historical data)
- Proposal completeness (all sections filled, pricing accurate)
- Scope boundaries (no scope creep in proposals)
- Approval checkpoint before sending

## Tool: `funnel`
```
funnel scan <pipeline>  → current state
funnel qualify <lead>   → score + match
funnel propose <lead>   → generate proposal
funnel close <deal>     → contract + handoff
```

## End
