# Design Playbook (canvas)

> Creative pipeline: scan brand assets → identify needs → plan creatives → execute via pi-design.

## Phases

### Phase 1: SCAN
- Read brand guidelines (colors, fonts, tone, visual identity)
- Inventory existing assets (logos, templates, photos)
- Identify gaps (missing formats, outdated assets, new channel needs)
- Output: `asset-context.json` + asset inventory + gap analysis

### Phase 2: PLAN
- Prioritize design tasks by business impact
- Define specs for each deliverable (dimensions, format, usage)
- Assign to pi-design with clear briefs
- Output: `design-plan.json` with tasks and specs

### Phase 3: EXECUTE
- pi-design creates deliverables (social graphics, banners, mockups)
- Brand consistency review (automated + human checkpoint)
- Format and export for target channels
- Output: production-ready assets in all required formats

### Phase 4: REVIEW
- Brand consistency score
- Technical compliance (file size, dimensions, color profiles)
- Human creative review (quality checkpoint)
- Output: approved assets + feedback for next iteration

## Quality Gates
- Brand consistency (colors, fonts, tone match guidelines)
- Technical compliance (dimensions, file size, format)
- Accessibility (WCAG contrast ratios, alt text)
- Multi-format export (PNG, SVG, WebP as needed)

## Tool: `canvas`
```
canvas scan <brand>     → asset inventory
canvas audit <brand>    → gap analysis
canvas plan <brand>     → design briefs
canvas execute <plan>   → create assets
canvas review <brand>   → brand compliance check
```

## End
