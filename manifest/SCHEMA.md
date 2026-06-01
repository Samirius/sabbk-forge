# Agent Roster Manifest — Schema

> The manifest (`manifest/agents.json`) is the **single source of truth** for every Pi agent.
> Provisioning reads it; jigs validate it; `AGENTS.md` files are rendered from it.
> If a field is not in the manifest, the provisioner cannot know it. Be explicit.

**Why JSON, not YAML:** Node parses JSON natively with zero dependencies. A cheap model on a
bare VM with no npm access can still read and validate it. YAML would need a parser we cannot
guarantee is installed. (A YAML front-end is Phase-3 polish, not spike-critical.)

## Top level

| Field | Type | Required | Meaning |
|---|---|---|---|
| `version` | number | yes | Manifest schema version. Currently `1`. |
| `agents` | array | yes | One object per agent. |

## Per-agent object

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Stable slug, lowercase-with-dashes. Used for paths and `--session-id`. |
| `name` | string | yes | Human display name / codename. |
| `tier` | number | yes | `2` for Pi production agents. (Tier 1 personal assistants are out of scope for this repo.) |
| `kind` | string | yes | `coding` (uses pi-coding-agent, requires `runtime.harness: "pi-coding-agent"`) or `domain` (non-coding Pi agent, requires `runtime.harness: "pi-agent-core"`). **The kind↔harness coupling is validated by jigs.** |
| `role` | string | yes | One sentence: what this gear does. |
| `runtime.harness` | string | yes | `pi-coding-agent` or `pi-agent-core`. |
| `runtime.pinned_version` | string | yes | Exact pi version. Must match `package.json`. Never a range. |
| `model.provider` | string | yes | pi provider key, e.g. `anthropic`, `openai`, `google`. |
| `model.id` | string | yes | Model id pi expects. **Confirm via `pi --list-models` before first live run.** |
| `model.thinking` | string | no | `off`/`minimal`/`low`/`medium`/`high`/`xhigh`. Cheap default = `low`. |
| `model.stages` | object | no | Per-stage model/thinking overrides (cost tiering), e.g. `{ "build": {"id":"claude-haiku-4-5","thinking":"low"} }` — smart planner, cheap builder. Adapter falls back to `model.id` for stages not listed. **Fallback logs a warning** for cost visibility. |
| `tools` | object | yes | Per-stage tool allowlist (arrays of pi built-in tool names: `read bash edit write grep find ls`). Least-privilege per stage. |
| `playbook` | string | yes | Repo-relative path to the domain playbook this agent serves. |
| `boundaries` | string[] | yes | Hard rules. Rendered verbatim into `AGENTS.md`. At least the git + secrets + scope rules. |
| `budget.max_turns` | number | yes | Hard cap on agent-loop turns. The #1 run-cost control. **Minimum: 1** (zero/negative rejected at validation). |
| `budget.max_usd` | number | yes | **Enforced** by `lib/budget.mjs` on `record` calls. The guard checks cumulative spend before each turn and exits(3) if exceeded. |
| `budget.timeout_sec` | number | yes | Wall-clock kill switch for a single run. |
| `gear` | object | yes | The input->output contract. See `templates/gear-contract.schema.yaml`. |

## Adding an agent

1. Copy an existing entry, change `id`/`name`/`role`/`playbook`/`model`/`tools`/`gear`.
2. Run `bash jigs/run-all.sh` — it must pass before the entry is usable.
3. Provision it: `bash bin/provision-agent.sh <id>`.

The next gear's `gear.consumes` must match some prior gear's `gear.produces` — `jigs/gear-contract-valid.sh` checks the shape so a pipeline cannot be wired with a mismatched baton.

**Validation:** The manifest rejects unknown/typo fields at validation time (strict schema — no extra properties allowed).
