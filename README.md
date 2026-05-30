# sabbk-forge

The **execution layer** of the Sabbk agent workshop: it boots Pi agents on the
[`earendil-works/pi`](https://github.com/earendil-works/pi) runtime from a single manifest, gives them
shared memory (git + handoffs) and stop → ask → resume human checkpoints, and proves itself with jigs.

`sabbk-workshop` says *how we work*. **`sabbk-forge` is the engine that executes it on pi.** It consumes the
other four repos (playbooks/jigs from `sabbk-workshop`, identities/handoffs from `agent-brain`) as inputs.

## → Read [`START-HERE.md`](./START-HERE.md). That is the whole on-ramp.

```
START-HERE.md      single entry point (clone → first agent), self-verifying steps
manifest/          agents.json (source of truth) + SCHEMA.md
templates/         AGENTS.md.tmpl (pi identity) + gear-contract.schema.yaml
lib/               pi-adapter.mjs (THE thin seam over pi) + validate.mjs (zero-dep)
bin/               provision-agent.sh · run-spike.sh · checkpoint.sh
protocols/         SHARING.md (git+handoff bus) · CHECKPOINT.md (terminate-save-resume)
jigs/              run-all.sh + manifest/gear/cheap-model-self-test validators
spike/             TASK.md (one internal forge task) + workdir/ (agent outputs)
```

Status: **Phase-2 spike.** One agent (`pi-coding-spike`) proven end to end before the full roster is added.
