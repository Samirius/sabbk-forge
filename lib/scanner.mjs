#!/usr/bin/env node
// scanner.mjs — Reads actual source code, builds a structured module index.
// NO LLM calls. Pure file reading + analysis.
//
// Usage: node lib/scanner.mjs <repo-path>
// Output: lifecycle/context/<repo-name>/
//   index.md      — full repo map (modules, files, stack, hotspots)
//   stack.md      — detected stack, versions, dependencies
//   module-N.md   — per-module: key files content (token-bounded)

import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
  readdirSync, statSync
} from "node:fs";
import { execSync } from "node:child_process";
import { join, basename, resolve, extname, relative } from "node:path";

const TOKEN_BUDGET_PER_MODULE = 4000;  // ~16KB
const MAX_FILE_SIZE = 50000;           // skip files > 50KB
const MAX_FILES_PER_MODULE = 15;

const repoPath = process.argv[2];
if (!repoPath) { console.error("usage: node scanner.mjs <repo-path>"); process.exit(1); }

const ABS = resolve(repoPath);
const NAME = basename(ABS);
const OUT = join(process.env.FORGE_ROOT || resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "lifecycle", "context", NAME);
const ROOT = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));

// ─── Helpers ──────────────────────────────────────────────────────
function run(cmd) {
  try { return execSync(cmd, { encoding: "utf8", timeout: 10000, cwd: ABS }).trim(); }
  catch { return ""; }
}

function fileSize(path) {
  try { return statSync(path).size; } catch { return 0; }
}

function isText(path) {
  const bin = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".eot",
    ".mp4", ".mp3", ".wav", ".zip", ".gz", ".tar", ".sqlite", ".db", ".lock",
    ".min.js", ".min.css", ".map", ".wasm"];
  return !bin.some(e => path.endsWith(e));
}

const SKIP_DIRS = new Set([
  "node_modules", "vendor", ".git", "storage", "bootstrap", "dist", "build",
  ".next", ".nuxt", "coverage", "__pycache__", ".cache", "public/build",
  "public/vendor", "debug", ".pi"
]);

// ─── Walk files ───────────────────────────────────────────────────
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
  } catch { /* permission denied, skip */ }
  return files;
}

// ─── Detect Stack ─────────────────────────────────────────────────
function detectStack() {
  const stack = { languages: [], frameworks: [], databases: [], tools: [] };

  // PHP/Laravel
  const composer = existsSync(join(ABS, "composer.json"));
  if (composer) {
    stack.languages.push("PHP");
    try {
      const c = JSON.parse(readFileSync(join(ABS, "composer.json"), "utf8"));
      const deps = { ...c.require, ...c["require-dev"] };
      if (deps["laravel/framework"]) { stack.frameworks.push(`Laravel ${deps["laravel/framework"].replace(/[^0-9.]/g, "")}`); }
      if (deps["inertiajs/inertia-laravel"]) stack.frameworks.push("Inertia.js");
      if (deps["laravel/sanctum"]) stack.tools.push("Sanctum auth");
      if (deps["barryvdh/laravel-dompdf"]) stack.tools.push("DomPDF");
    } catch {}
  }

  // Node/Vue/React/Astro
  const pkg = existsSync(join(ABS, "package.json"));
  if (pkg) {
    stack.languages.push("JavaScript");
    try {
      const p = JSON.parse(readFileSync(join(ABS, "package.json"), "utf8"));
      const deps = { ...p.dependencies, ...p.devDependencies };
      if (deps.vue) { stack.frameworks.push(`Vue ${deps.vue.replace(/[^0-9.]/g, "")}`); stack.languages.push("Vue SFC"); }
      if (deps.react) stack.frameworks.push("React");
      if (deps.astro) stack.frameworks.push("Astro");
      if (deps.tailwindcss) stack.tools.push("Tailwind CSS");
      if (deps["primevue"]) stack.tools.push("PrimeVue");
      if (deps.vite) stack.tools.push("Vite");
      if (deps.typescript) stack.languages.push("TypeScript");
      if (deps.nuxt) stack.frameworks.push("Nuxt");
      if (deps.next) stack.frameworks.push("Next.js");
    } catch {}
  }

  // Astro config
  if (existsSync(join(ABS, "astro.config.mjs"))) stack.frameworks.push("Astro");

  // Python
  if (existsSync(join(ABS, "pyproject.toml")) || existsSync(join(ABS, "setup.py"))) {
    stack.languages.push("Python");
  }

  // Docker
  if (existsSync(join(ABS, "docker-compose.yml")) || existsSync(join(ABS, "Dockerfile"))) {
    stack.tools.push("Docker");
  }

  // Database detection from config
  if (existsSync(join(ABS, ".env"))) {
    try {
      const env = readFileSync(join(ABS, ".env"), "utf8");
      if (/DB_/.test(env)) stack.databases.push("MySQL/PostgreSQL");
      if (/REDIS_/.test(env)) stack.databases.push("Redis");
    } catch {}
  }
  if (existsSync(join(ABS, "config", "database.php"))) {
    try {
      const dbconf = readFileSync(join(ABS, "config", "database.php"), "utf8");
      if (/mysql/i.test(dbconf)) stack.databases.push("MySQL");
      if (/pgsql/i.test(dbconf)) stack.databases.push("PostgreSQL");
      if (/sqlite/i.test(dbconf)) stack.databases.push("SQLite");
    } catch {}
  }

  return stack;
}

// ─── Module Detection ─────────────────────────────────────────────
function detectModules(files) {
  const modules = new Map();

  // Laravel module structure
  const laravelDirs = {
    "Controllers": "app/Http/Controllers",
    "Models": "app/Models",
    "Services": "app/Services",
    "Middleware": "app/Http/Middleware",
    "Requests": "app/Http/Requests",
    "Resources": "app/Http/Resources",
    "Migrations": "database/migrations",
    "Routes": "routes",
    "Views-Vue": "resources/js",
    "Views-Blade": "resources/views",
    "Tests": "tests",
    "Config": "config",
    "Public": "public",
  };

  // Astro module structure
  const astroDirs = {
    "Pages": "src/pages",
    "Components": "src/components",
    "Layouts": "src/layouts",
    "Content": "src/content",
    "Public": "public",
  };

  // Generic Node module structure
  const nodeDirs = {
    "Source": "src",
    "Components": "src/components",
    "Pages": "src/pages",
    "Utils": "src/utils",
    "Tests": "tests",
    "Public": "public",
  };

  // Try each framework's module map
  let moduleMap = {};
  if (existsSync(join(ABS, "composer.json"))) moduleMap = laravelDirs;
  else if (existsSync(join(ABS, "astro.config.mjs"))) moduleMap = astroDirs;
  else if (existsSync(join(ABS, "package.json"))) moduleMap = nodeDirs;

  // Detect top-level directories
  const topDirs = [];
  try {
    for (const entry of readdirSync(ABS, { withFileTypes: true })) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        topDirs.push(entry.name);
      }
    }
  } catch {}

  // If no framework map matched, or map had no matches, use directory-based modules
  let usedFallback = false;
  if (Object.keys(moduleMap).length > 0) {
    // Build module → files mapping from framework map
    for (const [modName, modPath] of Object.entries(moduleMap)) {
      const modFiles = files.filter(f => {
        const rel = relative(ABS, f);
        return rel.startsWith(modPath + "/") || rel === modPath;
      });
      if (modFiles.length > 0) {
        modules.set(modName, { path: modPath, files: modFiles });
      }
    }
  }

  // Fallback: use top-level directories as modules (each becomes its own module)
  if (modules.size === 0) {
    usedFallback = true;
    for (const dir of topDirs.sort()) {
      const dirPath = dir;
      const modFiles = files.filter(f => {
        const rel = relative(ABS, f);
        return rel.startsWith(dir + "/") || rel === dir;
      });
      if (modFiles.length > 0) {
        modules.set(dir, { path: dirPath, files: modFiles });
      }
    }
  } else {
    // Also add unmapped top-level dirs as modules
    const mappedPaths = new Set([...modules.values()].map(m => m.path.split("/")[0]));
    for (const dir of topDirs.sort()) {
      if (!mappedPaths.has(dir)) {
        const modFiles = files.filter(f => {
          const rel = relative(ABS, f);
          return rel.startsWith(dir + "/");
        });
        if (modFiles.length > 0) {
          modules.set(dir, { path: dir, files: modFiles });
        }
      }
    }
  }

  // Catch remaining files into "Root" module
  const mapped = new Set([...modules.values()].flatMap(m => m.files));
  const rootFiles = files.filter(f => !mapped.has(f));
  if (rootFiles.length > 0) {
    modules.set("Root", { path: ".", files: rootFiles.slice(0, MAX_FILES_PER_MODULE) });
  }

  return modules;
}

// ─── Build Module Context ─────────────────────────────────────────
function buildModuleContext(modName, modInfo) {
  const parts = [`# Module: ${modName}`, `Path: ${modInfo.path}`, `Files: ${modInfo.files.length}`, ""];

  // Sort files: PHP classes first, then routes, then views, then tests, then config
  const priority = (f) => {
    if (f.includes("Controller")) return 0;
    if (f.includes("Service")) return 1;
    if (f.includes("Model")) return 2;
    if (f.includes("Middleware")) return 3;
    if (f.includes("routes")) return 4;
    if (f.includes("migration")) return 5;
    if (f.includes("test") || f.includes("Test")) return 6;
    if (f.includes("vue")) return 7;
    return 9;
  };

  const sorted = [...modInfo.files].sort((a, b) => priority(a) - priority(b));
  let tokens = 0;

  for (const file of sorted.slice(0, MAX_FILES_PER_MODULE)) {
    const rel = relative(ABS, file);
    const size = fileSize(file);
    if (tokens + size / 4 > TOKEN_BUDGET_PER_MODULE) {
      parts.push(`\n--- (${modInfo.files.length - sorted.indexOf(file)} more files not shown) ---`);
      break;
    }
    parts.push(`## ${rel}`, "```" + extname(file).slice(1));
    try {
      const content = readFileSync(file, "utf8");
      // Truncate very long files
      if (content.length > 8000) {
        parts.push(content.slice(0, 8000));
        parts.push(`\n// ... truncated (${content.length} bytes total)`);
      } else {
        parts.push(content);
      }
    } catch {
      parts.push("(could not read)");
    }
    parts.push("```", "");
    tokens += size / 4;
  }

  return parts.join("\n");
}

// ─── Hotspot Detection ────────────────────────────────────────────
function findHotspots(files) {
  const hotspots = [];

  // Files changed most recently (git log)
  const recentFiles = run("git log --oneline --name-only -20 2>/dev/null")
    .split("\n")
    .filter(l => l && !l.match(/^[a-f0-9]/))
    .reduce((acc, f) => { acc[f] = (acc[f] || 0) + 1; return acc; }, {});

  for (const [f, count] of Object.entries(recentFiles).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    if (count >= 2) hotspots.push(`🔥 ${f} (${count} changes recently)`);
  }

  // Large files (complexity proxy)
  const largeFiles = files
    .filter(f => fileSize(f) > 10000)
    .sort((a, b) => fileSize(b) - fileSize(a))
    .slice(0, 5);

  for (const f of largeFiles) {
    const rel = relative(ABS, f);
    hotspots.push(`📏 ${rel} (${Math.round(fileSize(f) / 1024)}KB)`);
  }

  return hotspots;
}

// ─── Git State ────────────────────────────────────────────────────
function gitState() {
  const branch = run("git branch --show-current 2>/dev/null");
  const lastCommit = run("git log --oneline -1 2>/dev/null");
  const dirtyCount = run("git status --short 2>/dev/null").split("\n").filter(Boolean).length;
  const totalCommits = run("git rev-list --count HEAD 2>/dev/null");
  const contributors = run("git shortlog -sn 2>/dev/null").split("\n").slice(0, 5);

  return { branch, lastCommit, dirtyCount, totalCommits, contributors };
}

// ─── Build Index ──────────────────────────────────────────────────
function buildIndex(stack, modules, hotspots, git) {
  const lines = [
    `# Repo Index: ${NAME}`,
    `Path: ${ABS}`,
    `Scanned: ${new Date().toISOString()}`,
    "",
    "## Stack",
    ...stack.languages.map(l => `- Language: ${l}`),
    ...stack.frameworks.map(f => `- Framework: ${f}`),
    ...stack.databases.map(d => `- Database: ${d}`),
    ...stack.tools.map(t => `- Tool: ${t}`),
    "",
    "## Git",
    `- Branch: ${git.branch}`,
    `- Last: ${git.lastCommit}`,
    `- Dirty: ${git.dirtyCount} files`,
    `- Commits: ${git.totalCommits}`,
    `- Contributors: ${git.contributors.filter(Boolean).join(", ") || "N/A"}`,
    "",
    "## Modules",
  ];

  let modNum = 1;
  for (const [name, info] of modules) {
    lines.push(`- ${name} (${info.files.length} files) → module-${String(modNum).padStart(3, "0")}.md`);
    modNum++;
  }

  if (hotspots.length > 0) {
    lines.push("", "## Hotspots");
    lines.push(...hotspots);
  }

  lines.push("", "## File Counts");
  const extCount = {};
  for (const f of walkFiles(ABS)) {
    const ext = extname(f) || "(none)";
    extCount[ext] = (extCount[ext] || 0) + 1;
  }
  for (const [ext, count] of Object.entries(extCount).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    lines.push(`- ${ext}: ${count}`);
  }

  return lines.join("\n");
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

// Write outputs
mkdirSync(OUT, { recursive: true });

// 1. Index
writeFileSync(join(OUT, "index.md"), buildIndex(stack, modules, hotspots, git));
console.log(`  ✓ index.md`);

// 2. Stack detail
const stackLines = [
  `# Stack: ${NAME}`, "",
  ...stack.languages.map(l => `Language: ${l}`),
  ...stack.frameworks.map(f => `Framework: ${f}`),
  ...stack.databases.map(d => `Database: ${d}`),
  ...stack.tools.map(t => `Tool: ${t}`), "",
  "## Dependencies",
];

if (existsSync(join(ABS, "composer.json"))) {
  try {
    const c = JSON.parse(readFileSync(join(ABS, "composer.json"), "utf8"));
    stackLines.push("### PHP (composer.json)");
    for (const [k, v] of Object.entries(c.require || {}).slice(0, 20)) {
      stackLines.push(`- ${k}: ${v}`);
    }
  } catch {}
}
if (existsSync(join(ABS, "package.json"))) {
  try {
    const p = JSON.parse(readFileSync(join(ABS, "package.json"), "utf8"));
    stackLines.push("### Node (package.json)");
    for (const [k, v] of Object.entries({ ...(p.dependencies || {}), ...(p.devDependencies || {}) }).slice(0, 20)) {
      stackLines.push(`- ${k}: ${v}`);
    }
  } catch {}
}
writeFileSync(join(OUT, "stack.md"), stackLines.join("\n"));
console.log(`  ✓ stack.md`);

// 3. Per-module files (with actual code)
let modNum = 1;
for (const [name, info] of modules) {
  const content = buildModuleContext(name, info);
  const filename = `module-${String(modNum).padStart(3, "0")}.md`;
  writeFileSync(join(OUT, filename), content);
  console.log(`  ✓ ${filename} (${name}: ${info.files.length} files)`);
  modNum++;
}

// 4. scan.json — the machine-readable contract
const moduleFiles = [...modules.keys()].map((_, i) => `module-${String(i + 1).padStart(3, "0")}.md`);
const scanManifest = {
  repo: NAME,
  path: ABS,
  scanned_at: new Date().toISOString(),
  expires_after_hours: parseInt(process.env.FORGE_SCAN_TTL_HOURS || "24", 10),
  modules: [...modules.keys()],
  module_file_counts: Object.fromEntries([...modules.entries()].map(([k, v]) => [k, v.files.length])),
  file_count: files.length,
  stack: {
    languages: stack.languages,
    frameworks: stack.frameworks,
    databases: stack.databases,
    tools: stack.tools,
  },
  outputs: {
    index: "index.md",
    stack: "stack.md",
    modules: moduleFiles,
  },
};
writeFileSync(join(OUT, "scan.json"), JSON.stringify(scanManifest, null, 2));
console.log(`  ✓ scan.json (contract manifest)`);

// 5. Run eval gate
console.log(`\n  ▶ Eval gate...`);
let evalScore = "?";
try {
  const evalStdout = execSync(`node "${join(ROOT, "lib", "forge-eval.mjs")}" scan "${OUT}"`, {
    encoding: "utf8", timeout: 15000, stdio: ["pipe", "pipe", "pipe"]
  });
  try {
    const evalData = JSON.parse(evalStdout);
    evalScore = evalData.score + "%";
    if (evalData.passed) {
      console.log(`  ✅ Scan eval passed (${evalData.score}%)`);
    } else {
      console.error(`  ⚠️  Scan eval issues:`);
      evalData.failures.forEach(f => console.error(`     - ${f}`));
    }
  } catch {}
} catch (e) {
  // Eval may have written to stderr but still produced eval.json
  console.error(`  ⚠️  Scan eval had issues. Check ${OUT}/eval.json`);
}

console.log(`\n✅ Context built: ${OUT}`);
console.log(`   ${modules.size} modules, ${files.length} files indexed`);
console.log(`   Eval: ${evalScore}`);
