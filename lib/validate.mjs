#!/usr/bin/env node
// validate.mjs — zero-dependency validator for the agent manifest and gear contracts.
// Usage: node lib/validate.mjs <manifest|gear>
// Exit 0 = all good. Exit 1 = at least one violation (printed). No npm deps on purpose.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(HERE, "..", "manifest", "agents.json");
const TOOLS = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);
const THINKING = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

const errors = [];
const fail = (id, msg) => errors.push(`  ✗ [${id}] ${msg}`);

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch (e) {
  console.error(`✗ cannot read/parse manifest/agents.json: ${e.message}`);
  process.exit(1);
}

const mode = process.argv[2] || "manifest";
const agents = Array.isArray(manifest.agents) ? manifest.agents : [];
if (manifest.version !== 1) fail("manifest", `version must be 1, got ${JSON.stringify(manifest.version)}`);
if (agents.length === 0) fail("manifest", "no agents defined");

const isStr = (v) => typeof v === "string" && v.length > 0;
const isArr = (v) => Array.isArray(v) && v.length > 0;

function checkManifest(a) {
  const id = a.id || "<no-id>";
  for (const f of ["id", "name", "role", "kind"]) if (!isStr(a[f])) fail(id, `missing string field "${f}"`);
  if (![1, 2].includes(a.tier)) fail(id, `tier must be 1 or 2, got ${JSON.stringify(a.tier)}`);
  if (!["coding", "domain"].includes(a.kind)) fail(id, `kind must be coding|domain`);
  if (!a.runtime || !isStr(a.runtime.harness)) fail(id, `runtime.harness required`);
  if (!a.runtime || !isStr(a.runtime.pinned_version)) fail(id, `runtime.pinned_version required (exact, no range)`);
  else if (/[\^~*x]/.test(a.runtime.pinned_version)) fail(id, `pinned_version must be exact, got "${a.runtime.pinned_version}"`);
  if (!a.model || !isStr(a.model.provider) || !isStr(a.model.id)) fail(id, `model.provider and model.id required`);
  if (a.model && a.model.thinking && !THINKING.has(a.model.thinking)) fail(id, `model.thinking invalid: ${a.model.thinking}`);
  if (!a.tools || typeof a.tools !== "object") fail(id, `tools (per-stage allowlist) required`);
  else for (const [stage, list] of Object.entries(a.tools)) {
    if (!isArr(list)) { fail(id, `tools.${stage} must be a non-empty array`); continue; }
    for (const t of list) if (!TOOLS.has(t)) fail(id, `tools.${stage} has unknown pi tool "${t}"`);
  }
  if (!isStr(a.playbook)) fail(id, `playbook path required`);
  if (!isArr(a.boundaries)) fail(id, `boundaries[] required`);
  else {
    const joined = a.boundaries.join(" ").toLowerCase();
    if (!joined.includes("force-push")) fail(id, `boundaries must include the git no-force-push rule`);
    if (!joined.includes("secret") && !joined.includes("credential")) fail(id, `boundaries must include a secrets rule`);
  }
  if (!a.budget || typeof a.budget.max_turns !== "number") fail(id, `budget.max_turns (number) required — the run-cost cap`);
  if (!a.budget || typeof a.budget.timeout_sec !== "number") fail(id, `budget.timeout_sec (number) required`);
}

function checkGear(a) {
  const id = a.id || "<no-id>";
  const g = a.gear;
  if (!g || typeof g !== "object") { fail(id, `gear contract required`); return; }
  if (!isArr(g.consumes)) fail(id, `gear.consumes[] required (what must exist before this gear runs)`);
  else g.consumes.forEach((c, i) => { if (!isStr(c.type)) fail(id, `gear.consumes[${i}].type required`); });
  if (!isArr(g.produces)) fail(id, `gear.produces[] required (what this gear guarantees on success)`);
  else g.produces.forEach((p, i) => {
    if (!isStr(p.type)) fail(id, `gear.produces[${i}].type required`);
    if (p.type === "artifact" && !isStr(p.path)) fail(id, `gear.produces[${i}] artifact needs a path`);
    if (p.type === "handoff" && !isArr(p.must_cite)) fail(id, `gear.produces[${i}] handoff must declare must_cite[]`);
  });
  if (!isArr(g.checkpoints)) fail(id, `gear.checkpoints[] required (at least one human gate)`);
  else g.checkpoints.forEach((c, i) => {
    if (!isStr(c.when)) fail(id, `gear.checkpoints[${i}].when required`);
    if (!["AlwaysConfirm", "ConfirmRisky", "NeverConfirm"].includes(c.policy))
      fail(id, `gear.checkpoints[${i}].policy must be AlwaysConfirm|ConfirmRisky|NeverConfirm`);
  });
}

for (const a of agents) (mode === "gear" ? checkGear : checkManifest)(a);

if (errors.length) {
  console.error(`✗ ${mode} validation FAILED (${errors.length}):`);
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`✓ ${mode} validation passed for ${agents.length} agent(s).`);
