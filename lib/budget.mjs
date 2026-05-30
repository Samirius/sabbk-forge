#!/usr/bin/env node
// budget.mjs — orchestration-level budget enforcement (the layer we own).
// pi 0.78.0 has NO --max-turns flag, so the runner enforces caps:
//   timeout_sec : per-stage wall-clock — enforced in pi-adapter.mjs (spawn timeout)
//   max_turns   : max gear/stage invocations per run — enforced HERE (guard increments a counter)
//   max_usd     : cumulative cost ceiling — enforced HERE when cost is recorded (measured/--mode json runs)
// Usage:
//   node lib/budget.mjs guard  <agentId> <stateDir>        # exit 3 if a cap would be exceeded, else +1 turn
//   node lib/budget.mjs record <agentId> <stateDir> <usd>  # add cost to the cumulative total
//   node lib/budget.mjs reset  <agentId> <stateDir>        # zero the run state
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(HERE, "..", "manifest", "agents.json");

function caps(id) {
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const a = (m.agents || []).find((x) => x.id === id);
  if (!a) { console.error(`✗ no agent "${id}" in manifest`); process.exit(1); }
  return a.budget || {};
}
const sp = (dir) => join(dir || ".", "budget-state.json");
const load = (dir) => { try { return JSON.parse(readFileSync(sp(dir), "utf8")); } catch { return { turns: 0, usd: 0 }; } };
const save = (dir, s) => { mkdirSync(dir || ".", { recursive: true }); writeFileSync(sp(dir), JSON.stringify(s)); };

const [cmd, id, dir, arg] = process.argv.slice(2);
if (!cmd || !id) { console.error("usage: budget.mjs guard|record|reset <agentId> <stateDir> [usd]"); process.exit(2); }
const c = caps(id);
const s = load(dir);

if (cmd === "guard") {
  if (c.max_turns != null && s.turns >= c.max_turns) {
    console.error(`✗ BUDGET STOP: ${id} reached max_turns (${c.max_turns}). Halting before the next stage.`); process.exit(3);
  }
  if (c.max_usd != null && s.usd >= c.max_usd) {
    console.error(`✗ BUDGET STOP: ${id} reached max_usd ($${c.max_usd}); spent ~$${s.usd.toFixed(4)}.`); process.exit(3);
  }
  s.turns += 1; save(dir, s);
  console.log(`  ✓ budget ok — turn ${s.turns}/${c.max_turns}, spent ~$${s.usd.toFixed(4)}/$${c.max_usd}, per-stage timeout ${c.timeout_sec}s`);
} else if (cmd === "record") {
  s.usd += parseFloat(arg || "0") || 0; save(dir, s);
  console.log(`  recorded $${arg} → cumulative ~$${s.usd.toFixed(4)}/$${c.max_usd}`);
} else if (cmd === "reset") {
  save(dir, { turns: 0, usd: 0 }); console.log(`  budget state reset for ${id}`);
} else { console.error("unknown command"); process.exit(2); }
