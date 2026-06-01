# Marketing Playbook (muse)

> Content engine: scan brand → find content gaps → plan campaigns → execute via pi-marketing.

## Phases

### Phase 1: SCAN
- Read brand assets (brand guide, past campaigns, competitor analysis)
- Analyze channels (social, email, blog, ads)
- Map audience segments and content performance
- Output: `brand-context.json` + audience profiles + content inventory

### Phase 2: PLAN
- Identify content gaps and opportunities
- Create content calendar (30/60/90 day)
- Define campaign structures with budgets
- Output: `content-plan.json` with campaigns, posts, budgets

### Phase 3: EXECUTE
- pi-marketing generates copy (social posts, blog drafts, ad copy)
- pi-design creates visuals (social graphics, banners)
- pi-cro optimizes landing pages for campaigns
- Output: content assets ready for publishing

### Phase 4: MEASURE
- Pull metrics from channels
- Score against KPIs (engagement, CTR, conversions)
- Update heuristics for future campaigns
- Output: performance report + recommendations

## Quality Gates
- Brand consistency check (tone, visual identity)
- Content quality eval (LLM judge)
- Channel compliance (character limits, image specs)
- Budget adherence

## Tool: `muse`
```
muse scan <brand>       → brand context
muse audit <brand>      → content gaps + performance
muse plan <brand>       → content calendar + campaigns
muse execute <plan>     → generate content
muse measure <brand>    → pull metrics + report
```
