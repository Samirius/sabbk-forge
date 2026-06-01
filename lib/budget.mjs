#!/usr/bin/env node
// budget.mjs — orchestration-level budget enforcement (the layer we own).
// pi 0.78.0 has NO --max-turns flag, so the runner enforces caps:
//   timeout_sec : per-stage wall-clock — enforced in pi-adapter.mjs (spawn timeout)
//   max_turns   : max gear/stage invocations per run — enforced HERE (guard increments a counter)
//   max_usd     : cumulative cost ceiling — enforced HERE when cost is recorded (measured/--mode json runs)
// Usage:
//   node lib/budget.mjs guard  <agentId> <stateDir>        # exit 4 if a cap would be exceeded, else +1 turn
//   node lib/budget.mjs record <agentId> <stateDir> <usd>  # add cost to the cumulative total
//   node lib/budget.mjs reset  <agentId> <stateDir>        # zero the run state
//
// Exit codes: 0=ok, 1=usage/bad-args, 2=corrupt-state/invalid-value, 3=budget-exceeded, 4=lock-timeout
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, renameSync, statSync, rmdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(HERE, "..", "manifest", "agents.json");

// Exit codes (distinct for caller differentiation)
const EXIT_OK = 0;
const EXIT_USAGE = 1;
const EXIT_CORRUPT = 2;
const EXIT_BUDGET = 3;
const EXIT_LOCK = 4;

function caps(id) {
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const a = (m.agents || []).find((x) => x.id === id);
  if (!a) { console.error(`✗ no agent "${id}" in manifest`); process.exit(EXIT_USAGE); }
  return a.budget || {};
}
const sp = (dir) => join(dir || ".", "budget-state.json");

// Load state — distinguish ENOENT from real errors
const load = (dir) => {
  const path = sp(dir);
  if (!existsSync(path)) return { turns: 0, usd: 0 };
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return { turns: 0, usd: 0 };
    console.error(`✗ budget state corrupt: ${path} — ${e.message}. Fix or delete the file.`);
    process.exit(EXIT_CORRUPT);
  }
};

// FIX: BUD-001 — Lock with staleness detection (auto-recover orphaned locks after 10s)
const LOCK_MAX_AGE_MS = 10000;
const lockFile = (dir) => join(dir || ".", ".budget.lock");

const lock = (dir) => {
  const lf = lockFile(dir);
  const maxWait = 3000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    try {
      mkdirSync(lf, { recursive: false });
      // Write our PID + timestamp for staleness detection
      writeFileSync(join(lf, "owner"), `${process.pid}\n${Date.now()}`);
      return; // acquired
    } catch {
      // Check for stale lock
      const ownerFile = join(lf, "owner");
      try {
        const st = statSync(ownerFile);
        if (Date.now() - st.mtimeMs > LOCK_MAX_AGE_MS) {
          // Stale lock — force remove and retry
          console.warn(`  ⚠ removing stale budget lock (age ${Math.round((Date.now() - st.mtimeMs) / 1000)}s)`);
          forceRemoveLock(lf);
          continue;
        }
      } catch {}
      // FIX: BUD-003 — replaced busy-wait with proper sleep
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); // sleep 100ms
    }
  }
  console.error(`✗ BUDGET LOCK TIMEOUT: could not acquire lock at ${lf}`);
  process.exit(EXIT_LOCK);
};

const forceRemoveLock = (lf) => {
  try {
    const ownerFile = join(lf, "owner");
    if (existsSync(ownerFile)) unlinkSync(ownerFile);
    if (existsSync(lf)) rmdirSync(lf);
  } catch {}
};

// FIX: BUD-002 — unlock surfaces errors instead of silent catch
const unlock = (dir) => {
  const lf = lockFile(dir);
  try {
    const ownerFile = join(lf, "owner");
    if (existsSync(ownerFile)) unlinkSync(ownerFile);
  } catch (e) {
    console.warn(`  ⚠ could not remove lock owner file: ${e.message}`);
  }
  try {
    if (existsSync(lf)) rmdirSync(lf);
  } catch (e) {
    console.warn(`  ⚠ could not release budget lock: ${e.message}`);
  }
};

// FIX: BUD-004 — atomic write (temp file + rename)
const save = (dir, s) => {
  mkdirSync(dir || ".", { recursive: true });
  const target = sp(dir);
  const tmp = `${target}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(s));
  try {
    renameSync(tmp, target);
  } catch (e) {
    // renameSync may fail across mount points; fall back to direct write
    try { unlinkSync(tmp); } catch {}
    writeFileSync(target, JSON.stringify(s));
  }
};

const [cmd, id, dir, arg] = process.argv.slice(2);
if (!cmd || !id) { console.error("usage: budget.mjs guard|record|reset <agentId> <stateDir> [usd]"); process.exit(EXIT_USAGE); }
const c = caps(id);

if (cmd === "guard") {
  lock(dir);
  try {
    const s = load(dir);
    if (c.max_turns != null && s.turns >= c.max_turns) {
      console.error(`✗ BUDGET STOP: ${id} reached max_turns (${c.max_turns}). Halting before the next stage.`); process.exit(EXIT_BUDGET);
    }
    if (c.max_usd != null && s.usd >= c.max_usd) {
      console.error(`✗ BUDGET STOP: ${id} reached max_usd ($${c.max_usd}); spent ~$${s.usd.toFixed(4)}.`); process.exit(EXIT_BUDGET);
    }
    s.turns += 1; save(dir, s);
    console.log(`  ✓ budget ok — turn ${s.turns}/${c.max_turns ?? "∞"}, spent ~$${s.usd.toFixed(4)}/$${c.max_usd ?? "∞"}, per-stage timeout ${c.timeout_sec}s`);
  } finally {
    unlock(dir);
  }
} else if (cmd === "record") {
  const usd = parseFloat(arg || "0");
  if (isNaN(usd)) { console.error("✗ invalid USD value"); process.exit(EXIT_USAGE); }
  if (usd < 0) { console.error(`✗ negative cost rejected: $${usd}. Possible bug in cost measurement.`); process.exit(EXIT_USAGE); }
  lock(dir);
  try {
    const s = load(dir);
    s.usd += usd; save(dir, s);
    console.log(`  recorded $${usd} → cumulative ~$${s.usd.toFixed(4)}/$${c.max_usd ?? "∞"}`);
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
} else { console.error("unknown command"); process.exit(EXIT_USAGE); }
