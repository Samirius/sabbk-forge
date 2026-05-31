# Sub-Agent Definitions

> Specialist sub-agents for the manager pattern (D21). Each domain manager starts solo and grows specialists when overloaded.
> These are NOT separate manifest entries — they are stages/modes the manager can delegate to via the pipeline.

## How sub-agents work

A manager delegates by writing a handoff to `sabbk-clients/<client>/handoffs/` with `to: pi-<domain>-<specialist>`. The specialist runs as a separate pi invocation with a narrower system prompt + toolset. The specialist's output is a return handoff back to the manager.

Specialists are **cheap-tier** (haiku/GLM-4.6) unless marked **smart**.

---

## pi-brand (Wolff) — Specialists

| Specialist | Role | Model | Tools | Produces |
|---|---|---|---|---|
| pi-brand-copywriter | Write brand copy, taglines, voice guidelines | cheap | read, write, ls | `brand/copy/*.md` |
| pi-brand-designer | Visual system specs, color/type/spacing tokens | cheap | read, write, ls | `brand/visual-system.md` |

**Trigger:** Pi Brand delegates when it has both copy and visual work in the same assignment.

---

## pi-marketing (Ogilvy) — Specialists

| Specialist | Role | Model | Tools | Produces |
|---|---|---|---|---|
| pi-marketing-analyst | Pull analytics, compute KPIs, flag anomalies | cheap | read, write, grep, ls | `marketing/reports/*.md` |
| pi-marketing-creative | Write ad copy, captions, creative briefs | cheap | read, write, ls | `marketing/creatives/*.md` |
| pi-marketing-media-buyer | Plan media budgets, allocate spend, flag fatigue | **smart** | read, write, ls | `marketing/media-plan.md` |

**Trigger:** Pi Marketing delegates when:
- Analyst: weekly/monthly reporting, or when campaign data needs parsing
- Creative: content batch > 5 pieces, or caption calendar needs writing
- Media Buyer: budget allocation decisions, or ad fatigue detected

---

## pi-cro (Optimizer) — Specialists

| Specialist | Role | Model | Tools | Produces |
|---|---|---|---|---|
| pi-cro-analyst | Run funnel analysis, heatmaps, friction database | cheap | read, write, grep, ls | `cro/analysis/*.md` |
| pi-cro-implementer | Build A/B test variants, tracking pixels | cheap | read, bash, edit, write | `cro/implementations/*` |

**Trigger:** Pi CRO delegates when it has both analysis and implementation work.

---

## pi-design (Rams) — Specialists

| Specialist | Role | Model | Tools | Produces |
|---|---|---|---|---|
| pi-design-ui | UI components, layouts, responsive specs | cheap | read, write, ls | `design/ui/*.md` |
| pi-design-ux | User flows, wireframes, interaction specs | cheap | read, write, ls | `design/ux/*.md` |
| pi-design-visual | Ad creatives, social media visuals, brand assets | cheap | read, write, ls | `design/visuals/*` |

**Trigger:** Pi Design delegates when it receives mixed briefs (UI + visual, or UX + creative).

---

## pi-software (Builder) — Specialists

| Specialist | Role | Model | Tools | Produces |
|---|---|---|---|---|
| pi-software-backend | API routes, database, server logic | cheap | read, bash, edit, write | `build/backend/*` |
| pi-software-frontend | UI components, pages, CSS | cheap | read, bash, edit, write | `build/frontend/*` |
| pi-software-devops | CI/CD, infra, deployment, monitoring | cheap | read, bash, edit, write | `build/infra/*` |

**Trigger:** Pi Software delegates when a task spans > 1 concern (e.g., API + frontend + deploy).

---

## pi-sales (Closer) — No specialists planned

Sales is small-batch (few leads, high touch). The manager handles it all. If volume grows, add:
- pi-sales-sdr (lead qualification, cheap)
- pi-sales-ae (proposal writing, smart)

---

## Total specialist count: 14

| Domain | Count | Names |
|---|---|---|
| Brand | 2 | copywriter, designer |
| Marketing | 3 | analyst, creative, media-buyer |
| CRO | 2 | analyst, implementer |
| Design | 3 | ui, ux, visual |
| Software | 3 | backend, frontend, devops |
| Sales | 0 | — (future: sdr, ae) |

## Implementation path

1. **v1:** Manager-only (current). All work stays in the manager's pi invocation.
2. **v2:** When a manager hits > 8 turns regularly, extract the busiest specialist. Run as a separate pipeline gear.
3. **v3:** Full specialist fleet. Manager orchestrates via handoffs.
