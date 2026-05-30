# Inter-Agent Sharing Protocol

> Agents are gears in a pipeline. They share work through **git + handoffs** — not a live message bus,
> not a database. This reuses what Sabbk already has and adds a typed contract on top.

## The substrate: git + the existing handoff schema
- Every agent's output lands as **commits on a `-ai` branch**; the next agent branches from that known
  state; the PR is the review gate. (Aider's "git commit per change" pattern; matches Sabbk git discipline.)
- Agents pass the baton with a **handoff** using the existing schema in
  `agent-brain/handoffs/TEMPLATE.md` (YAML frontmatter `from/to/date/tier/playbook/phase/priority` +
  Facts + Actions Needed). A handoff missing **Playbook + Phase** is invalid — an existing jig enforces it.
- Per-run working memory uses **pi's own session** (`--session-id`, forkable, auto-compacted). We do not
  rebuild state storage.

## The contract on top: the gear (`manifest` → `gear`)
Each agent declares `consumes` / `produces` / `checkpoints` / `boundaries` (see
`templates/gear-contract.schema.yaml`). The rule that makes the pipeline composable:

> **A downstream gear's `consumes` must be satisfiable by some upstream gear's `produces`.**

`jigs/gear-contract-valid.sh` checks each contract's shape; a future `pipeline-wiring` jig will check the
chain (gear B consumes what gear A produces) once more than one agent exists.

## Why not an event-stream service (OpenHands) or a shared DB (GoClaw)?
We studied both. For a solo operator they add infrastructure to run, secure, and pay for. Git gives the
same guarantees we actually need — append-only history, diff, rollback, branching, audit — for free, and
every agent already speaks it. We borrow the *ideas* (typed events → typed handoffs; confirmation policy →
checkpoints) without standing up the servers. Revisit if/when concurrency outgrows git.

## What crosses, what doesn't
- Memory → `agent-brain`. Methodology → `sabbk-workshop`. Deliverables → `sabbk-clients`. Company →
  `sabbk-co`. The execution engine → here (`sabbk-forge`). One jig (in sabbk-workshop) already guards
  content-location; agents must not write across that line.
- Tier-2 agents read `shared/work/` + `shared/public/` + `handoffs/` + their own dir. Never
  `shared/personal/` or any `restricted/`.
