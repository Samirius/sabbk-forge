# Human Checkpoint Protocol — stop → ask → resume

> Borrowed from AutoGen's terminate-save-resume + OpenHands' confirmation policies, mapped onto
> pi's `--session-id` / `--resume`. The design rule: **a checkpoint must not burn tokens while it waits.**

## Why terminate-save-resume (not a blocking prompt)
A blocking `pi.ui.confirm()` keeps a process — and its context — alive while a human takes hours.
That idle time is real money. Instead, at a checkpoint the agent **writes a checkpoint file, ends the
run, and persists its pi session.** A later run resumes from the exact session with the human's answer.
Waiting costs **zero**.

## The three policies (per gear, in the manifest `gear.checkpoints[]`)
- `NeverConfirm` — proceed without asking (e.g. the SPEC and PLAN *drafting* stages).
- `ConfirmRisky` — ask only before a risky tool call (file write outside workdir, deploy, anything irreversible).
- `AlwaysConfirm` — always ask (e.g. before BUILD, before any client-facing change).

## The flow
1. Gear reaches a checkpoint `when` whose policy requires a human.
2. Gear runs: `bash bin/checkpoint.sh request <agent-id> "<question>"` → writes
   `spike/workdir/<agent-id>/CHECKPOINT-<ts>.md` (frontmatter `status: OPEN`, question, options, context) and **exits 0**.
3. Human reads the checkpoint (and the PLAN.md it references), then:
   `bash bin/checkpoint.sh answer <checkpoint-file> "approve"` (or `"revise: <notes>"` / `"reject"`).
4. `bash bin/checkpoint.sh resume <agent-id>` reads the decision and re-launches the next stage with
   `pi --resume` (same `--session-id`), feeding the decision in as the next message.

## Checkpoint file = a handoff variant
The checkpoint file is just a handoff (same schema as `agent-brain/handoffs/TEMPLATE.md`) with
`type: checkpoint` and a `## Decision` block. So the existing handoff jigs and the git audit trail
apply to checkpoints for free.

## Question format (keep it answerable by a tired human on a phone)
- One sentence question.
- A short, fixed option set (`approve | revise | reject`), plus free-text after `revise:`.
- A pointer to the one artifact to review (usually `PLAN.md`).
