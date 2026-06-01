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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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

// FIX: CODE-003 — distinguish ENOENT (expected) from real errors
const load = (dir) => {
  const path = sp(dir);
  if (!existsSync(path)) return { turns: 0, usd: 0 };
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return { turns: 0, usd: 0 };
    // Real errors (EACCES, corrupt JSON, etc.) — propagate
    console.error(`✗ budget state corrupt: ${path} — ${e.message}. Fix or delete the file.`);
    process.exit(2);
  }
};

// FIX: BUG-002 — simple file-based mutex for concurrent safety
const lockFile = (dir) => join(dir || ".", ".budget.lock");
const lock = (dir) => {
  const lf = lockFile(dir);
  const maxWait = 2000; // 2 seconds
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      mkdirSync(lf, { recursive: false });
      return; // acquired
    } catch {
      // Lock held by another process, wait briefly
      const s = Date.now();
      while (Date.now() - s < 50) {} // spin 50ms
    }
  }
  console.error(`✗ BUDGET LOCK TIMEOUT: could not acquire lock at ${lf}`);
  process.exit(3);
};
const unlock = (dir) => {
  try { const lf = lockFile(dir); if (existsSync(lf)) { const { rmdirSync } = await import("node:fs"); rmdirSync(lf); } } catch {}
};

const save = (dir, s) => { mkdirSync(dir || ".", { recursive: true }); writeFileSync(sp(dir), JSON.stringify(s)); };

const [cmd, id, dir, arg] = process.argv.slice(2);
if (!cmd || !id) { console.error("usage: budget.mjs guard|record|reset <agentId> <stateDir> [usd]"); process.exit(2); }
const c = caps(id);

if (cmd === "guard") {
  lock(dir);
  try {
    const s = load(dir);
    if (c.max_turns != null && s.turns >= c.max_turns) {
      console.error(`✗ BUDGET STOP: ${id} reached max_turns (${c.max_turns}). Halting before the next stage.`); process.exit(3);
    }
    if (c.max_usd != null && s.usd >= c.max_usd) {
      console.error(`✗ BUDGET STOP: ${id} reached max_usd ($${c.max_usd}); spent ~$${s.usd.toFixed(4)}.`); process.exit(3);
    }
    s.turns += 1; save(dir, s);
    console.log(`  ✓ budget ok — turn ${s.turns}/${c.max_turns}, spent ~$${s.usd.toFixed(4)}/$${c.max_usd}, per-stage timeout ${c.timeout_sec}s`);
  } finally {
    unlock(dir);
  }
} else if (cmd === "record") {
  // FIX: BUG-003 — reject negative USD values
  const usd = parseFloat(arg || "0");
  if (isNaN(usd)) { console.error("✗ invalid USD value"); process.exit(2); }
  if (usd < 0) { console.error(`✗ negative cost rejected: $${usd}. Possible bug in cost measurement.`); process.exit(2); }
  lock(dir);
  try {
    const s = load(dir);
    s.usd += usd; save(dir, s);
    console.log(`  recorded $${usd} → cumulative ~$${s.usd.toFixed(4)}/$${c.max_usd}`);
  } finally {
    unlock(dir);
  }
} else if (cmd === "reset") {
  lock(dir);
  try {
    save(dir, { turns: 0, usd: 0 }); console.log(`  budget state reset for ${id}`);
  } finally {
    unlock(dir);
  }
} else { console.error("unknown command"); process.exit(2); }
