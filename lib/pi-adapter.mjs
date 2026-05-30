#!/usr/bin/env node
// pi-adapter.mjs — THE THIN ABSTRACTION OVER pi. This is the ONLY file that knows pi's CLI.
// If pi changes its flags, or we swap the harness, change only this file.
//
// Subcommands:
//   render <id> <outPath>                 Render AGENTS.md for agent <id> from the template + manifest.
//   cmd    <id> <stage> <message> [--resume]   Print the exact `pi` argv for a stage (DRY — does not run).
//   spawn  <id> <stage> <message> [--resume]   Execute pi for a stage (requires pi installed + provider key).
//
// FLAG MAPPING is based on pi v0.78.0's documented CLI (packages/coding-agent/src/cli/args.ts).
// Run `pi --help` and `pi --models` (START-HERE step 2) to confirm before the first LIVE run.
// The API key is NEVER passed as an arg — pi reads it from the provider env var (e.g. ANTHROPIC_API_KEY).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MANIFEST = join(ROOT, "manifest", "agents.json");
const TEMPLATE = join(ROOT, "templates", "AGENTS.md.tmpl");

export const PINNED_PI = "0.78.0";          // must equal package.json + every manifest pinned_version
export const PI_BIN = process.env.PI_BIN || "pi";

function agent(id) {
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const a = (m.agents || []).find((x) => x.id === id);
  if (!a) { console.error(`✗ no agent "${id}" in manifest`); process.exit(1); }
  return a;
}

const bullets = (arr, f) => (arr && arr.length ? arr.map((x) => "- " + f(x)).join("\n") : "- (none)");

export function render(id, outPath) {
  const a = agent(id);
  const map = {
    ID: a.id, NAME: a.name, TIER: a.tier, KIND: a.kind, ROLE: a.role,
    HARNESS: a.runtime.harness, PINNED_VERSION: a.runtime.pinned_version,
    MODEL_PROVIDER: a.model.provider, MODEL_ID: a.model.id, THINKING: a.model.thinking || "low",
    PLAYBOOK: a.playbook,
    MAX_TURNS: a.budget.max_turns, TIMEOUT_SEC: a.budget.timeout_sec,
    CONSUMES: bullets(a.gear.consumes, (c) => `\`${c.type}\`${c.path ? " " + c.path : ""}${c.from ? " from " + c.from : ""}${c.requires ? " (requires: " + c.requires.join(", ") + ")" : ""}`),
    PRODUCES: bullets(a.gear.produces, (p) => `\`${p.type}\`${p.path ? " " + p.path : ""}${p.to ? " to " + p.to : ""}${p.schema ? " [" + p.schema + "]" : ""}`),
    CHECKPOINTS: bullets(a.gear.checkpoints, (c) => `**${c.when}** -> policy \`${c.policy}\`${c.question ? ' — "' + c.question + '"' : ""}`),
    BOUNDARIES: bullets(a.boundaries, (b) => b),
  };
  let out = readFileSync(TEMPLATE, "utf8").replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? String(map[k]) : `{{${k}}}`));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, out);
  return outPath;
}

// Map (agent, stage, message) -> pi argv. The ONLY place pi flags are constructed.
export function buildArgs(a, stage, message, { resume = false } = {}) {
  const tools = (a.tools && a.tools[stage]) || a.tools.build || ["read"];
  // Env overrides let the SAME manifest entry run on a different provider (e.g. GLM) without edits.
  // GLM is registered as a custom openai-completions provider in ~/.pi/agent/models.json.
  const provider = process.env.PI_PROVIDER || a.model.provider;
  const modelId = process.env.PI_MODEL_ID || a.model.id;
  const mode = process.env.PI_MODE || "text";    // set PI_MODE=json to capture usage for cost measurement
  const argv = [
    "--print",                                   // non-interactive / batch
    "--mode", mode,                              // text|json|rpc
    "--provider", provider,
    "--model", modelId,
    "--thinking", a.model.thinking || "low",
    "--session-id", `${a.id}-spike`,             // SAME id across all stages -> context carries, non-interactively
    "--tools", tools.join(","),                  // least-privilege allowlist for THIS stage
  ];
  // Deliberately NO --resume. In pi 0.78.0 --resume opens an interactive session PICKER
  // (breaks --print) and cannot be combined with --session-id. A stable --session-id alone
  // loads-or-creates the session and continues it across stages. (Confirmed via the Hermes spike.)
  void resume;                                   // kept for call-site compatibility; intentional no-op
  argv.push(message);                            // positional prompt LAST
  return argv;
}

const shq = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);

function main() {
  const [sub, id, stage, message, ...rest] = process.argv.slice(2);
  const resume = rest.includes("--resume");
  if (sub === "render") return void render(id, stage /* outPath */);
  if (!["cmd", "spawn"].includes(sub)) { console.error("usage: pi-adapter.mjs render|cmd|spawn ..."); process.exit(1); }
  const a = agent(id);
  const argv = buildArgs(a, stage, message, { resume });
  if (sub === "cmd") {
    console.log("# stage=" + stage + "  tools=" + ((a.tools[stage] || []).join(",")));
    console.log([PI_BIN, ...argv].map(shq).join(" "));
    return;
  }
  // spawn (live)
  const hasPi = !!process.env.PI_BIN || existsSync(join(ROOT, "node_modules", ".bin", "pi"));
  const bin = existsSync(join(ROOT, "node_modules", ".bin", "pi")) ? join(ROOT, "node_modules", ".bin", "pi") : PI_BIN;
  const child = spawn(bin, argv, { stdio: "inherit", cwd: join(ROOT, "spike", "workdir", a.id), env: process.env });
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (e) => { console.error(`✗ could not launch pi (${e.message}). Is it installed? See START-HERE step 1.`); process.exit(127); });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
