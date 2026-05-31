#!/usr/bin/env node
// lifecycle.mjs — The forge's external layer for real projects
//
// Modes:
//   audit   <repo-path> [focus]       — Scan a repo, produce an audit report with ranked issues
//   fix     <repo-path> <batch-file>  — Fix a batch of bugs/issues from a spec file
//   refactor <repo-path> <scope>      — Plan + execute a refactoring scope
//   build   <repo-path> <spec-file>   — Build new features from a spec (greenfield or additive)
//   status  <repo-path>               — Show what the forge knows about a repo
//
// This is the LIFECYCLE layer — it sits above run-spike.sh and handles:
//   1. Repo context loading (so agents understand existing code)
//   2. Chunking large work into manageable batches
//   3. Running the pipeline per-batch with repo-aware working dirs
//   4. Tracking progress across batches

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MANIFEST = join(ROOT, "manifest", "agents.json");

const [mode, ...args] = process.argv.slice(2);
if (!mode) { printUsage(); process.exit(2); }

function printUsage() {
  console.log(`forge lifecycle — full software lifecycle engine

Usage:
  node lifecycle.mjs audit   <repo-path> [focus]
  node lifecycle.mjs fix     <repo-path> <batch-file>
  node lifecycle.mjs refactor <repo-path> <scope>
  node lifecycle.mjs build   <repo-path> <spec-file>
  node lifecycle.mjs status  <repo-path>

Modes:
  audit     Scan a repo and produce a ranked issue report
  fix       Fix a batch of bugs from a spec file
  refactor  Plan and execute a refactoring scope
  build     Build new features from a spec
  status    Show forge state for a repo

Environment:
  GLM_API_KEY    Required for live runs (LLM provider key)
  FORGE_DRY_RUN  Set to "1" to print commands without executing
`);
}

// ─── Repo Context ──────────────────────────────────────────────────
// Builds a context file that the agent can read to understand the repo
function buildRepoContext(repoPath) {
  const abs = resolve(repoPath);
  const name = basename(abs);
  const ctx = [];

  ctx.push(`# Repo Context: ${name}`);
  ctx.push(`Path: ${abs}`);
  ctx.push(`Generated: ${new Date().toISOString()}`);
  ctx.push("");

  // Detect stack
  const hasComposer = existsSync(join(abs, "composer.json"));
  const hasPackage = existsSync(join(abs, "package.json"));
  const hasAstro = existsSync(join(abs, "astro.config.mjs"));
  const hasDocker = existsSync(join(abs, "docker-compose.yml"));
  const hasGit = existsSync(join(abs, ".git"));

  ctx.push("## Stack");
  if (hasComposer) {
    try {
      const composer = JSON.parse(readFileSync(join(abs, "composer.json"), "utf8"));
      const deps = Object.keys(composer.require || {});
      ctx.push(`- PHP/Laravel${deps.find(d => d.startsWith("laravel")) ? ` (Laravel ${composer.require["laravel/framework"]?.replace(/[^0-9.]/g, "") || "?"})` : ""}`);
      ctx.push(`- Dependencies: ${deps.slice(0, 10).join(", ")}`);
    } catch { ctx.push("- PHP (composer.json found)"); }
  }
  if (hasPackage) {
    try {
      const pkg = JSON.parse(readFileSync(join(abs, "package.json"), "utf8"));
      ctx.push(`- Node: ${pkg.dependencies?.vue ? "Vue" : ""}${pkg.dependencies?.react ? "React" : ""}${hasAstro ? " Astro" : ""}`);
      ctx.push(`- Dev: ${Object.keys(pkg.devDependencies || {}).slice(0, 8).join(", ")}`);
    } catch { ctx.push("- Node (package.json found)"); }
  }
  if (hasDocker) ctx.push("- Docker");
  ctx.push("");

  // File counts by type
  try {
    const findCmd = `cd ${abs} && find . -not -path './node_modules/*' -not -path './.git/*' -not -path './vendor/*' -not -path './storage/*' -not -path './bootstrap/cache/*' -type f | sed 's/.*\\.//' | sort | uniq -c | sort -rn | head -20`;
    const fileTypes = execSync(findCmd, { encoding: "utf8", timeout: 10000 }).trim();
    ctx.push("## File Types (top 20)");
    ctx.push(fileTypes);
    ctx.push("");
  } catch {}

  // Git state
  if (hasGit) {
    try {
      const branch = execSync(`git -C ${abs} branch --show-current`, { encoding: "utf8" }).trim();
      const lastCommit = execSync(`git -C ${abs} log --oneline -1`, { encoding: "utf8" }).trim();
      const dirtyFiles = execSync(`git -C ${abs} status --short`, { encoding: "utf8" }).trim();
      ctx.push("## Git State");
      ctx.push(`- Branch: ${branch}`);
      ctx.push(`- Last: ${lastCommit}`);
      ctx.push(`- Dirty: ${dirtyFiles ? dirtyFiles.split("\n").length + " files" : "clean"}`);
      ctx.push("");
    } catch {}
  }

  // Key files to read
  ctx.push("## Key Files");
  const keyPaths = [
    "README.md", "AGENTS.md", "docs/BUG-HUNT", "docs/FRONTEND-AUDIT",
    "docs/COMPETITIVE-ANALYSIS", "package.json", "composer.json",
    "routes/api.php", "routes/web.php", "resources/js/router.js",
    "app/Http/Controllers", "app/Models", "app/Services",
    "database/migrations", "tests"
  ];
  const found = keyPaths.filter(p => existsSync(join(abs, p)));
  ctx.push(found.map(p => `- ${p}`).join("\n"));
  ctx.push("");

  return ctx.join("\n");
}

// ─── Audit Mode ────────────────────────────────────────────────────
async function auditMode(repoPath, focus) {
  const abs = resolve(repoPath);
  const name = basename(abs);
  console.log(`\n🔍 FORGE AUDIT: ${name}${focus ? ` (focus: ${focus})` : ""}\n`);

  if (!existsSync(abs)) { console.error(`✗ repo not found: ${abs}`); process.exit(1); }

  // 1. Build repo context
  const context = buildRepoContext(abs);
  const ctxFile = join(ROOT, "lifecycle", "context", `${name}-context.md`);
  mkdirSync(dirname(ctxFile), { recursive: true });
  writeFileSync(ctxFile, context);
  console.log(`✓ Repo context: ${ctxFile}`);

  // 2. Run the audit via pi
  const GLM_KEY = process.env.GLM_API_KEY;
  if (!GLM_KEY) {
    console.error("✗ GLM_API_KEY required for audit");
    process.exit(3);
  }

  const focusClause = focus ? `\nFocus area: ${focus}` : "";
  const prompt = `Audit this project for ${focus || "bugs, security, performance, code quality"}.

PROJECT CONTEXT:
${context.substring(0, 4000)}

For each issue: Severity (P0-P3), Category, File:line, Description, Fix approach.
Group by severity (P0 first). End with summary counts.
Be precise — cite real code, no theoretical problems.`;

  const auditWorkdir = join(ROOT, "lifecycle", "workdir", name, "audit");
  mkdirSync(auditWorkdir, { recursive: true });

  // Write the context + prompt to the workdir
  writeFileSync(join(auditWorkdir, "REPO-CONTEXT.md"), context);
  writeFileSync(join(auditWorkdir, "TASK.md"), prompt);

  // Build the pi command
  const tmpBody = JSON.stringify({
    model: "glm-5.1",
    messages: [
      { role: "system", content: "You are a senior software auditor. Read real code, find real issues, write precise reports with file:line references. Output to AUDIT-REPORT.md." },
      { role: "user", content: prompt.substring(0, 12000) }
    ],
    max_tokens: 16000
  });
  const tmpFile = `/tmp/forge-audit-${name}-${Date.now()}.json`;
  writeFileSync(tmpFile, tmpBody);

  console.log("▶ Running audit via GLM-5.1...");
  if (process.env.FORGE_DRY_RUN === "1") {
    console.log(`  [DRY RUN] Would POST to GLM with ${prompt.length} char prompt`);
    console.log(`  Output would go to: ${auditWorkdir}/AUDIT-REPORT.md`);
    return;
  }

  try {
    const response = execSync(
      `curl -s https://api.z.ai/api/coding/paas/v4/chat/completions -H "Authorization: Bearer ${GLM_KEY}" -H "Content-Type: application/json" -d @${tmpFile}`,
      { timeout: 300000, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
    );
    const parsed = JSON.parse(response);
    const content = parsed.choices?.[0]?.message?.content || "";
    const reasoning = parsed.choices?.[0]?.message?.reasoning_content || "";
    const report = content || reasoning;

    if (!report) {
      console.error("✗ Empty response from model");
      process.exit(5);
    }

    writeFileSync(join(auditWorkdir, "AUDIT-REPORT.md"), report);
    console.log(`\n✅ Audit report: ${auditWorkdir}/AUDIT-REPORT.md`);

    // Also copy to the repo itself
    writeFileSync(join(abs, "AUDIT-REPORT.md"), report);
    console.log(`✅ Also saved to: ${abs}/AUDIT-REPORT.md`);

    // Quick summary
    const p0Count = (report.match(/P0/g) || []).length;
    const p1Count = (report.match(/P1/g) || []).length;
    const p2Count = (report.match(/P2/g) || []).length;
    console.log(`\n📊 Summary: ~${p0Count} P0 | ~${p1Count} P1 | ~${p2Count} P2 issues`);

  } catch (e) {
    console.error(`✗ Audit failed: ${e.message}`);
    process.exit(4);
  } finally {
    try { require("fs").unlinkSync(tmpFile); } catch {}
  }
}

// ─── Fix Mode ──────────────────────────────────────────────────────
async function fixMode(repoPath, batchFile) {
  const abs = resolve(repoPath);
  const name = basename(abs);
  const batch = resolve(batchFile);
  console.log(`\n🔧 FORGE FIX: ${name}`);
  console.log(`  Batch: ${batch}\n`);

  if (!existsSync(abs)) { console.error(`✗ repo not found: ${abs}`); process.exit(1); }
  if (!existsSync(batch)) { console.error(`✗ batch file not found: ${batch}`); process.exit(1); }

  const GLM_KEY = process.env.GLM_API_KEY;
  if (!GLM_KEY) { console.error("✗ GLM_API_KEY required"); process.exit(3); }

  // 1. Load repo context
  const context = buildRepoContext(abs);

  // 2. Read the batch file
  const batchContent = readFileSync(batch, "utf8");

  // 3. Create workdir and branch
  const branch = `fix/forge-batch-${Date.now()}-ai`;
  const workdir = join(ROOT, "lifecycle", "workdir", name, "fix");
  mkdirSync(workdir, { recursive: true });

  try { execSync(`git -C ${abs} checkout -b ${branch}`, { encoding: "utf8" }); }
  catch { console.log("  (branch may already exist, continuing)"); }

  // 4. Build the fix prompt
  const prompt = `You are fixing real bugs in a production software project.

PROJECT CONTEXT:
${context}

BUGS TO FIX:
${batchContent}

INSTRUCTIONS:
1. Read each bug description carefully
2. For each bug, read the affected file(s)
3. Apply the MINIMAL fix — don't refactor surrounding code
4. After each fix, verify it doesn't break anything else
5. Write a VALIDATION.md documenting:
   - Each fix: what was changed, which file, which lines
   - How to verify the fix works
   - Any risks or trade-offs

Rules:
- One fix per logical change — don't batch unrelated fixes in one edit
- Preserve existing code style and patterns
- Don't add new dependencies
- If a bug is unclear, document what you assumed and why`;

  writeFileSync(join(workdir, "TASK.md"), prompt);
  writeFileSync(join(workdir, "REPO-CONTEXT.md"), context);

  // 5. Run pi against the repo directly
  console.log("▶ Running fix pipeline via GLM-5.1...");
  if (process.env.FORGE_DRY_RUN === "1") {
    console.log(`  [DRY RUN] Would run pi-software against ${abs} on branch ${branch}`);
    console.log(`  Prompt: ${prompt.length} chars`);
    return;
  }

  const piBin = existsSync(join(ROOT, "node_modules", ".bin", "pi"))
    ? join(ROOT, "node_modules", ".bin", "pi") : "pi";

  const agentConfig = {
    provider: "glm",
    model: "glm-5.1",
    thinking: "medium",
    tools: "read,bash,edit,write,ls",
    sessionId: `fix-${name}-${Date.now()}`
  };

  // Write prompt to temp file for large payloads
  const fixTmpFile = `/tmp/forge-fix-${name}-${Date.now()}.txt`;
  writeFileSync(fixTmpFile, prompt.substring(0, 16000));

  // Use pi directly with repo as working directory
  const child = spawn(piBin, [
    "--print", "--mode", "text",
    "--provider", agentConfig.provider,
    "--model", agentConfig.model,
    "--thinking", agentConfig.thinking,
    "--session-id", agentConfig.sessionId,
    "--tools", agentConfig.tools,
    prompt.substring(0, 16000)
  ], {
    stdio: "inherit",
    cwd: abs,
    env: { ...process.env, GLM_API_KEY: GLM_KEY, NODE_OPTIONS: "--max-old-space-size=2048" },
    timeout: 600000  // 10 min max for large repos
  });

  child.on("exit", (code) => {
    try { require("fs").unlinkSync(fixTmpFile); } catch {}
    if (code === 0) {
      console.log(`\n✅ Fix pipeline complete. Check ${abs}/VALIDATION.md`);
      console.log(`  Branch: ${branch}`);
      console.log(`  Next: review changes, then git commit && git push`);
    } else {
      console.error(`\n✗ Fix pipeline exited with code ${code}`);
    }
    process.exit(code ?? 0);
  });

  child.on("error", (e) => {
    console.error(`✗ Could not launch pi: ${e.message}`);
    process.exit(127);
  });
}

// ─── Status Mode ───────────────────────────────────────────────────
async function statusMode(repoPath) {
  const abs = resolve(repoPath);
  const name = basename(abs);
  console.log(`\n📋 FORGE STATUS: ${name}\n`);

  if (!existsSync(abs)) { console.error(`✗ repo not found: ${abs}`); process.exit(1); }

  // Context
  const ctx = buildRepoContext(abs);
  console.log(ctx);

  // Check for forge state
  const lifecycleDir = join(ROOT, "lifecycle", "workdir", name);
  if (existsSync(lifecycleDir)) {
    const subdirs = readdirSync(lifecycleDir).filter(d => statSync(join(lifecycleDir, d)).isDirectory());
    console.log("## Forge History");
    for (const d of subdirs) {
      const auditReport = join(lifecycleDir, d, "AUDIT-REPORT.md");
      const validation = join(lifecycleDir, d, "VALIDATION.md");
      if (existsSync(auditReport)) console.log(`  - Audit: ${auditReport}`);
      if (existsSync(validation)) console.log(`  - Validation: ${validation}`);
    }
  } else {
    console.log("## Forge History: (none — first interaction)");
  }
}

// ─── Router ────────────────────────────────────────────────────────
switch (mode) {
  case "audit":
    auditMode(args[0], args[1]);
    break;
  case "fix":
    fixMode(args[0], args[1]);
    break;
  case "status":
    statusMode(args[0]);
    break;
  case "refactor":
  case "build":
    console.log(`⚠️  ${mode} mode not yet implemented — coming next`);
    process.exit(2);
  default:
    printUsage();
    process.exit(2);
}
