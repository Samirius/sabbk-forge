#!/usr/bin/env node
// scanner.mjs — Reads source code AND understands it.
// Phase 1 (no LLM): Walk files, detect stack, map modules, read code
// Phase 2 (LLM): Analyze each module for patterns, issues, deps, complexity
//
// Usage: node lib/scanner.mjs <repo-path>
// Output: lifecycle/context/<repo-name>/
//   scan.json        — machine-readable contract
//   index.md         — repo overview (modules, stack, git, hotspots)
//   stack.md         — dependencies, versions
//   module-N.md      — per-module: code + LLM analysis brief
//   eval.json        — scan eval results

import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
  readdirSync, statSync
} from "node:fs";
import { execSync } from "node:child_process";
import { join, basename, resolve, extname, relative } from "node:path";

const TOKEN_BUDGET_PER_MODULE = 4000;
const MAX_FILE_SIZE = 50000;
const MAX_FILES_PER_MODULE = 15;
const HERE = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const ROOT = HERE;

const repoPath = process.argv[2];
if (!repoPath) { console.error("usage: node scanner.mjs <repo-path>"); process.exit(1); }

const ABS = resolve(repoPath);
const NAME = basename(ABS);
const OUT = join(ROOT, "lifecycle", "context", NAME);

// Resolve API key
const GLM_KEY = process.env.GLM_API_KEY || (existsSync(join(process.env.HOME || "/root", ".config", "forge", "zai-key"))
  ? readFileSync(join(process.env.HOME || "/root", ".config", "forge", "zai-key"), "utf8").trim() : "");

const SKIP_DIRS = new Set([
  "node_modules", "vendor", ".git", "storage", "bootstrap", "dist", "build",
  ".next", ".nuxt", "coverage", "__pycache__", ".cache", "public/build",
  "public/vendor", "debug", ".pi"
]);

// ─── Phase 1: File Operations (no LLM) ───────────────────────────
// ... (walkFiles, detectStack, detectModules, buildModuleContext,
//      findHotspots, gitState, buildIndex — same as before)

function run(cmd) {
  try { return execSync(cmd, { encoding: "utf8", timeout: 10000, cwd: ABS }).trim(); }
  catch { return ""; }
}
function fileSize(path) { try { return statSync(path).size; } catch { return 0; } }
function isText(path) {
  const bin = [".png",".jpg",".jpeg",".gif",".webp",".ico",".woff",".woff2",".ttf",".eot",
    ".mp4",".mp3",".wav",".zip",".gz",".tar",".sqlite",".db",".lock",".min.js",".min.css",".map",".wasm"];
  return !bin.some(e => path.endsWith(e));
}

function walkFiles(dir, depth = 0) {
  if (depth > 8) return [];
  let files = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        files = files.concat(walkFiles(full, depth + 1));
      } else if (entry.isFile() && isText(full) && fileSize(full) <= MAX_FILE_SIZE) {
        files.push(full);
      }
    }
  } catch {}
  return files;
}

function detectStack() {
  const stack = { languages: [], frameworks: [], databases: [], tools: [] };
  if (existsSync(join(ABS, "composer.json"))) {
    stack.languages.push("PHP");
    try {
      const c = JSON.parse(readFileSync(join(ABS, "composer.json"), "utf8"));
      const deps = { ...c.require, ...c["require-dev"] };
      if (deps["laravel/framework"]) stack.frameworks.push(`Laravel ${deps["laravel/framework"].replace(/[^0-9.]/g, "")}`);
      if (deps["inertiajs/inertia-laravel"]) stack.frameworks.push("Inertia.js");
    } catch {}
  }
  if (existsSync(join(ABS, "package.json"))) {
    stack.languages.push("JavaScript");
    try {
      const p = JSON.parse(readFileSync(join(ABS, "package.json"), "utf8"));
      const deps = { ...p.dependencies, ...p.devDependencies };
      if (deps.vue) stack.frameworks.push(`Vue ${deps.vue.replace(/[^0-9.]/g, "")}`);
      if (deps.react) stack.frameworks.push("React");
      if (deps.astro) stack.frameworks.push("Astro");
      if (deps.tailwindcss) stack.tools.push("Tailwind CSS");
      if (deps["primevue"]) stack.tools.push("PrimeVue");
      if (deps.vite) stack.tools.push("Vite");
      if (deps.typescript) stack.languages.push("TypeScript");
    } catch {}
  }
  if (existsSync(join(ABS, "astro.config.mjs")) && !stack.frameworks.includes("Astro")) stack.frameworks.push("Astro");
  if (existsSync(join(ABS, "docker-compose.yml"))) stack.tools.push("Docker");

  // Shell/Bash detection
  const shellFiles = [];
  try {
    const allFiles = walkFiles(ABS);
    for (const f of allFiles) {
      if (f.endsWith(".sh") || f.endsWith(".bash")) shellFiles.push(f);
      else {
        try {
          const head = readFileSync(f, "utf8").slice(0, 20);
          if (head.startsWith("#!/bin/bash") || head.startsWith("#!/usr/bin/env bash")) shellFiles.push(f);
        } catch {}
      }
    }
  } catch {}
  if (shellFiles.length > 3) { stack.languages.push("Bash"); stack.tools.push(`Shell (${shellFiles.length} scripts)`); }

  return stack;
}

function detectModules(files) {
  const modules = new Map();
  const laravelDirs = { "Controllers":"app/Http/Controllers","Models":"app/Models","Services":"app/Services","Middleware":"app/Http/Middleware","Requests":"app/Http/Requests","Resources":"app/Http/Resources","Migrations":"database/migrations","Routes":"routes","Views-Vue":"resources/js","Views-Blade":"resources/views","Tests":"tests","Config":"config" };
  const astroDirs = { "Pages":"src/pages","Components":"src/components","Layouts":"src/layouts","Content":"src/content" };
  const nodeDirs = { "Source":"src","Components":"src/components","Tests":"tests" };

  let moduleMap = {};
  if (existsSync(join(ABS, "composer.json"))) moduleMap = laravelDirs;
  else if (existsSync(join(ABS, "astro.config.mjs"))) moduleMap = astroDirs;
  else if (existsSync(join(ABS, "package.json"))) moduleMap = nodeDirs;

  if (Object.keys(moduleMap).length > 0) {
    for (const [modName, modPath] of Object.entries(moduleMap)) {
      const modFiles = files.filter(f => { const rel = relative(ABS, f); return rel.startsWith(modPath + "/") || rel === modPath; });
      if (modFiles.length > 0) modules.set(modName, { path: modPath, files: modFiles });
    }
  }

  // Fallback: directory-based
  const topDirs = [];
  try { for (const e of readdirSync(ABS, { withFileTypes: true })) { if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) topDirs.push(e.name); } } catch {}

  if (modules.size === 0) {
    for (const dir of topDirs.sort()) {
      const modFiles = files.filter(f => relative(ABS, f).startsWith(dir + "/"));
      if (modFiles.length > 0) modules.set(dir, { path: dir, files: modFiles });
    }
  } else {
    const mappedPaths = new Set([...modules.values()].map(m => m.path.split("/")[0]));
    for (const dir of topDirs.sort()) {
      if (!mappedPaths.has(dir)) {
        const modFiles = files.filter(f => relative(ABS, f).startsWith(dir + "/"));
        if (modFiles.length > 0) modules.set(dir, { path: dir, files: modFiles });
      }
    }
  }

  const mapped = new Set([...modules.values()].flatMap(m => m.files));
  const rootFiles = files.filter(f => !mapped.has(f));
  if (rootFiles.length > 0) modules.set("Root", { path: ".", files: rootFiles.slice(0, MAX_FILES_PER_MODULE) });
  return modules;
}

function buildModuleCode(modName, modInfo) {
  const parts = [`# Module: ${modName}`, `Path: ${modInfo.path}`, `Files: ${modInfo.files.length}`, ""];
  const priority = (f) => {
    if (f.includes("Controller")) return 0; if (f.includes("Service")) return 1;
    if (f.includes("Model")) return 2; if (f.includes("Middleware")) return 3;
    if (f.includes("routes")) return 4; if (f.includes("migration")) return 5;
    if (f.includes("test") || f.includes("Test")) return 6; return 9;
  };
  const sorted = [...modInfo.files].sort((a, b) => priority(a) - priority(b));
  let tokens = 0;
  for (const file of sorted.slice(0, MAX_FILES_PER_MODULE)) {
    const rel = relative(ABS, file);
    if (tokens + fileSize(file) / 4 > TOKEN_BUDGET_PER_MODULE) {
      parts.push(`\n--- (${modInfo.files.length - sorted.indexOf(file)} more files not shown) ---`);
      break;
    }
    parts.push(`## ${rel}`, "```" + extname(file).slice(1));
    try {
      const content = readFileSync(file, "utf8");
      parts.push(content.length > 8000 ? content.slice(0, 8000) + "\n// ... truncated" : content);
    } catch { parts.push("(could not read)"); }
    parts.push("```", "");
    tokens += fileSize(file) / 4;
  }
  return parts.join("\n");
}

function findHotspots(files) {
  const hotspots = [];
  const recentFiles = run("git log --oneline --name-only -20 2>/dev/null").split("\n").filter(l => l && !l.match(/^[a-f0-9]/)).reduce((acc, f) => { acc[f] = (acc[f] || 0) + 1; return acc; }, {});
  for (const [f, count] of Object.entries(recentFiles).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    if (count >= 2) hotspots.push(`🔥 ${f} (${count} changes recently)`);
  }
  files.filter(f => fileSize(f) > 10000).sort((a, b) => fileSize(b) - fileSize(a)).slice(0, 5)
    .forEach(f => hotspots.push(`📏 ${relative(ABS, f)} (${Math.round(fileSize(f) / 1024)}KB)`));
  return hotspots;
}

function gitState() {
  const branch = run("git branch --show-current 2>/dev/null");
  const lastCommit = run("git log --oneline -1 2>/dev/null");
  const dirtyCount = run("git status --short 2>/dev/null").split("\n").filter(Boolean).length;
  const totalCommits = run("git rev-list --count HEAD 2>/dev/null");
  const contributors = run("git shortlog -sn 2>/dev/null").split("\n").slice(0, 5);
  return { branch, lastCommit, dirtyCount, totalCommits, contributors };
}

function buildIndex(stack, modules, hotspots, git) {
  const lines = [`# Repo Index: ${NAME}`, `Path: ${ABS}`, `Scanned: ${new Date().toISOString()}`, "",
    "## Stack", ...stack.languages.map(l => `- Language: ${l}`), ...stack.frameworks.map(f => `- Framework: ${f}`),
    ...stack.databases.map(d => `- Database: ${d}`), ...stack.tools.map(t => `- Tool: ${t}`), "",
    "## Git", `- Branch: ${git.branch}`, `- Last: ${git.lastCommit}`, `- Dirty: ${git.dirtyCount} files`,
    `- Commits: ${git.totalCommits}`, "", "## Modules"];
  let modNum = 1;
  for (const [name, info] of modules) {
    lines.push(`- ${name} (${info.files.length} files) → module-${String(modNum).padStart(3, "0")}.md`);
    modNum++;
  }
  if (hotspots.length > 0) { lines.push("", "## Hotspots", ...hotspots); }
  return lines.join("\n");
}

// ─── Phase 2: LLM Module Analysis (child process per module) ─────
// Each module analysis runs in a separate node process to avoid OOM.
// The child receives module code via a temp file, calls GLM, writes analysis to stdout.

import { writeFileSync as _writeFileSync, unlinkSync as _unlinkSync, mkdtempSync as _mkdtempSync } from "node:fs";
import { tmpdir as _tmpdir } from "node:os";
import { fork as _fork } from "node:child_process";

// Write the analysis worker script once
const _TMPDIR = _mkdtempSync(join(_tmpdir(), "forge-scan-"));
const _WORKER = join(_TMPDIR, "analyze-worker.cjs");
_writeFileSync(_WORKER, `
const https = require('https');
const fs = require('fs');
const GLM_KEY = process.env.GLM_KEY;
const model = process.env.FORGE_SCANNER_MODEL || 'glm-5';

const payloadFile = process.argv[2];
const payload = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));
const body = JSON.stringify({
  model,
  messages: [{ role: 'system', content: payload.system }, { role: 'user', content: payload.user }],
  max_tokens: 2000,
  temperature: 0.3
});

const req = https.request('https://api.z.ai/api/coding/paas/v4/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + GLM_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      const content = parsed.choices?.[0]?.message?.content || '(empty)';
      process.stdout.write(content);
    } catch (e) {
      process.stderr.write('Parse: ' + e.message + '\\n');
      process.stdout.write('(LLM parse failed)');
    }
    process.exit(0);
  });
});
req.on('error', (e) => { process.stderr.write('Req: ' + e.message); process.exit(1); });
req.write(body);
req.end();
`);

async function analyzeModule(modName, modCode) {
  if (!GLM_KEY) {
    return `## Analysis\n(No LLM key — skipping analysis. Raw code only.)`;
  }

  const system = `You are a senior code analyst. Given a module's source code, produce a structured brief.

Your output MUST be in this exact format:

## Module Brief: [name]

### Purpose
[1-2 sentences: what this module does]

### Key Files
[List the most important files and what they contain]

### Patterns Found
- [Pattern 1: description]
- [Pattern 2: description]

### Issues Detected
- [ISSUE-ID] [P0/P1/P2/P3] [category] file:line — [description]

### Dependencies
[What other modules does this one depend on?]

### Complexity
[Rate: low/medium/high — explain why]

Be concise. Be specific. Cite actual file names and line numbers you can see.`;

  const payload = JSON.stringify({ system, user: modCode.slice(0, 8000) });

  return new Promise((resolve) => {
    try {
      // Write payload to temp file, pass path as arg to worker
      const payloadFile = join(_TMPDIR, `payload-${modName}.json`);
      _writeFileSync(payloadFile, payload);
      const child = _fork(_WORKER, [payloadFile], {
        env: { ...process.env, GLM_KEY },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        timeout: 90000
      });

      let stdout = '', stderr = '';
      child.stdout.on('data', c => stdout += c);
      child.stderr.on('data', c => stderr += c);
      child.on('close', (code) => {
        try { _unlinkSync(payloadFile); } catch {}
        if (stdout.length > 20 && !stdout.includes('(failed)')) {
          resolve(stdout);
        } else {
          resolve(`## Analysis\n(LLM call failed${stderr ? ': ' + stderr.trim().slice(0, 200) : ''}. Raw code preserved below.)`);
        }
      });
      child.on('error', (e) => {
        resolve(`## Analysis\n(Worker error: ${e.message}. Raw code preserved below.)`);
      });

      child.stdin.write(payload);
      child.stdin.end();
    } catch (e) {
      resolve(`## Analysis\n(Fork error: ${e.message}. Raw code preserved below.)`);
    }
  });
}

// ─── Main ─────────────────────────────────────────────────────────
console.log(`\n🔍 Scanning: ${NAME} (${ABS})\n`);

const files = walkFiles(ABS);
console.log(`  ${files.length} text files found`);

const stack = detectStack();
console.log(`  Stack: ${[...stack.languages, ...stack.frameworks].join(" + ") || "unknown"}`);

const modules = detectModules(files);
console.log(`  Modules: ${[...modules.keys()].join(", ")}`);

const hotspots = findHotspots(files);
const git = gitState();

mkdirSync(OUT, { recursive: true });

// Phase 1 outputs (no LLM)
writeFileSync(join(OUT, "index.md"), buildIndex(stack, modules, hotspots, git));
console.log(`  ✓ index.md`);

// Stack detail
const stackLines = [`# Stack: ${NAME}`, ""];
if (existsSync(join(ABS, "composer.json"))) {
  try {
    const c = JSON.parse(readFileSync(join(ABS, "composer.json"), "utf8"));
    stackLines.push("### PHP", ...Object.entries(c.require || {}).slice(0, 20).map(([k, v]) => `- ${k}: ${v}`));
  } catch {}
}
if (existsSync(join(ABS, "package.json"))) {
  try {
    const p = JSON.parse(readFileSync(join(ABS, "package.json"), "utf8"));
    const deps = { ...(p.dependencies || {}), ...(p.devDependencies || {}) };
    stackLines.push("### Node", ...Object.entries(deps).slice(0, 20).map(([k, v]) => `- ${k}: ${v}`));
  } catch {}
}
writeFileSync(join(OUT, "stack.md"), stackLines.join("\n"));
console.log(`  ✓ stack.md`);

// Phase 1 + Phase 2: Module files with code + LLM analysis
let modNum = 1;
const moduleNames = [...modules.keys()];
const moduleFileList = [];

for (const [name, info] of modules) {
  const rawCode = buildModuleCode(name, info);
  const filename = `module-${String(modNum).padStart(3, "0")}.md`;
  moduleFileList.push(filename);

  // Phase 2: LLM analysis (per module, not batched)
  console.log(`  ▶ Analyzing ${name} (${info.files.length} files)...`);
  const analysis = await analyzeModule(name, rawCode);

  // Combine: analysis brief FIRST (for the planner), then raw code for reference
  const content = `${analysis}\n\n---\n\n## Raw Code\n\n${rawCode}`;
  writeFileSync(join(OUT, filename), content);
  console.log(`    ✓ ${filename} (${name})`);
  modNum++;
}

// scan.json contract
const scanManifest = {
  repo: NAME, path: ABS, scanned_at: new Date().toISOString(),
  expires_after_hours: parseInt(process.env.FORGE_SCAN_TTL_HOURS || "24", 10),
  modules: moduleNames,
  file_count: files.length,
  stack: { languages: stack.languages, frameworks: stack.frameworks, databases: stack.databases, tools: stack.tools },
  outputs: { index: "index.md", stack: "stack.md", modules: moduleFileList },
  has_llm_analysis: !!GLM_KEY,
};
writeFileSync(join(OUT, "scan.json"), JSON.stringify(scanManifest, null, 2));
console.log(`  ✓ scan.json`);

// Eval gate
console.log(`\n  ▶ Eval gate...`);
let evalScore = "?";
try {
  const evalStdout = execSync(`node "${join(ROOT, "lib", "forge-eval.mjs")}" scan "${OUT}"`, {
    encoding: "utf8", timeout: 15000, stdio: ["pipe", "pipe", "pipe"]
  });
  try {
    const evalData = JSON.parse(evalStdout);
    evalScore = evalData.score + "%";
    console.log(`  ${evalData.passed ? "✅" : "⚠️"} Scan eval: ${evalData.score}%`);
  } catch {}
} catch { console.error(`  ⚠️ Scan eval had issues`); }

console.log(`\n✅ Context built: ${OUT}`);
console.log(`   ${modules.size} modules, ${files.length} files`);
console.log(`   LLM analysis: ${GLM_KEY ? "yes" : "no"}`);
console.log(`   Eval: ${evalScore}`);
