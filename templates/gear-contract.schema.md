# gear-contract.schema  (documentation; the live contract lives inside each manifest entry's `gear` block as JSON)
#
# A "gear" is one agent in the pipeline. Each gear has a strict input -> work -> output contract.
# One gear's `produces` becomes the next gear's `consumes`. jigs/gear-contract-valid.sh checks the shape.
#
# consumes[]   what MUST exist before this gear may run (the baton handed to it)
#   - type        one of: task | artifact | handoff
#   - path        repo-relative path (for task/artifact)
#   - from        producing agent id (for handoff)
#   - requires[]  fields/keys that must be present in the input
#
# produces[]   what this gear GUARANTEES on success (the baton it hands on)
#   - type        one of: artifact | handoff
#   - path        where the artifact lands (for artifact)
#   - schema      named output shape: spec | plan | build-output | validation | ...
#   - to          recipient agent id (for handoff)
#   - must_cite[] fields the handoff must include (always at least: playbook, phase)
#
# checkpoints[]  where this gear must STOP and ask a human (stop -> ask -> resume)
#   - when        a named gate, e.g. after_plan_before_build | before_client_facing_change | risky_tool_write_or_deploy
#   - policy      AlwaysConfirm | ConfirmRisky | NeverConfirm   (borrowed from OpenHands)
#   - question    the crisp question shown to the human (optional; default derived from `when`)
#
# boundaries[]   hard rules (rendered verbatim into AGENTS.md). Mechanical where possible.
#
# Example (Pi CRO, illustrative):
# consumes:
#   - { type: handoff, from: pi-pm, requires: [client, playbook_phase, objective] }
#   - { type: artifact, path: sabbk-clients/<client>/strategy/*.md }
# produces:
#   - { type: artifact, path: sabbk-clients/<client>/cro/<date>-audit.md, schema: cro-audit-checklist }
#   - { type: handoff, to: pi-pm, must_cite: [playbook, phase] }
# checkpoints:
#   - { when: before_client_facing_change, policy: AlwaysConfirm }
#   - { when: risky_tool_write_or_deploy, policy: ConfirmRisky }
