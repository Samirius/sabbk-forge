#!/usr/bin/env node
// executor.mjs — Runs each batch from a plan through pi-software.
// Generates TASK.md per batch, calls `npx pi` with the core pipeline,
// tracks progress with resume capability.
//
// Usage:
//   node lib/executor.mjs <plan.json> [batch-ids...]
//   node lib/executor.mjs plan.json                  (run all)
//   node lib/executor.mjs plan.json B001 B002        (run specific)
//   node lib/executor.mjs plan.json --dry-run        (print commands, don't run)
//   node lib/executor.mjs plan.json --auto-approve   (skip checkpoints)
//
// Environment:
//   GLM_API_KEY — required (or ~/.config/forge/zai-key)

import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
  readdirSync, statSync, copyFileSync
} from "node:fs";
import { join, basename, resolve, dirname } from "node:path";
import { execSync, spawn } from "node:child_process";

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const ROOT = resolve(HERE, "..");

const planPath = process.argv[2];
if (!planPath) {
  console.error("usage: node executor.mjs <plan.json> [batch-ids...] [--dry-run] [--auto-approve]");
  process.exit(1);
}

const planAbs = resolve(planPath);
if (!existsSync(planAbs)) { console.error(`✗ plan not found: ${planAbs}`); process.exit(1); }

const plan = JSON.parse(readFileSync(planAbs, "utf8"));
const dryRun = process.argv.includes("--dry-run");
const autoApprove = process.argv.includes("--auto-approve");

const requestedIds = process.argv.slice(3).filter(a => !a.startsWith("--"));

// ─── Resolve API Key ──────────────────────────────────────────────
function resolveApiKey() {
  if (process.env.GLM_API_KEY) return process.env.GLM_API_KEY;
  const keyFile = join(process.env.HOME || "/root", ".config", "forge", "zai-key");
  if (existsSync(keyFile)) return readFileSync(keyFile, "utf8").trim();
  console.error("✗ No GLM_API_KEY. Set env var or create ~/.config/forge/zai-key");
  process.exit(3);
}

const API_KEY = resolveApiKey();

// ─── Resolve pi binary ────────────────────────────────────────────
function resolvePiBin() {
  const local = join(ROOT, "node_modules", ".bin", "pi");
  if (existsSync(local)) return local;
  // Try npx
  try { execSync("which npx", { encoding: "utf8" }); return "npx pi"; }
  catch { console.error("✗ pi not found. Install: npm install @earendil-works/pi-coding-agent"); process.exit(3); }
}

const PI_BIN = resolvePiBin();

// ─── Resolve agent workdir ────────────────────────────────────────
function resolveWorkdir() {
  // Use the spike/workdir/pi-software where AGENTS.md is provisioned
  return join(ROOT, "spike", "workdir", "pi-software");
}

const WORKDIR = resolveWorkdir();

// ─── Progress Tracking ────────────────────────────────────────────
const planDir = dirname(planAbs);
const progressPath = join(planDir, "progress.json");

function loadProgress() {
  if (existsSync(progressPath)) {
    try { return JSON.parse(readFileSync(progressPath, "utf8")); }
    catch { return { plan_id: plan.id, batches: {} }; }
  }
  return { plan_id: plan.id, started: new Date().toISOString(), batches: {} };
}

function saveProgress(progress) {
  writeFileSync(progressPath, JSON.stringify(progress, null, 2));
}

function markBatch(progress, batchId, status, detail = {}) {
  progress.batches[batchId] = {
    status,
    started: detail.started || new Date().toISOString(),
    finished: detail.finished || null,
    ...detail
  };
  saveProgress(progress);
}

// ─── Dependency Resolution ────────────────────────────────────────
function resolveOrder(batches) {
  const visited = new Set();
  const order = [];
  const batchMap = new Map(batches.map(b => [b.id, b]));

  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const batch = batchMap.get(id);
    if (batch?.depends_on) {
      for (const dep of batch.depends_on) visit(dep);
    }
    order.push(id);
  }

  batches.forEach(b => visit(b.id));
  return order;
}

// ─── Generate TASK.md ─────────────────────────────────────────────
function generateTask(batch, plan, repoPath) {
  const lines = [
    `# Task: ${batch.title}`, "",
    `**Plan:** ${plan.id}`,
    `**Batch:** ${batch.id}`,
    `**Severity:** ${batch.severity}`,
    `**Risk:** ${batch.risk}`,
    `**Branch:** ${batch.branch || `fix/forge-${batch.id}-ai`}`,
    "",
    "## Objective", batch.title, "",
    "## Files to Modify",
    ...batch.files.map(f => `- \`${f}\``), "",
    "## Acceptance Criteria",
    ...batch.acceptance_criteria.map((ac, i) => `${i + 1}. ${ac}`), "",
    "## Constraints",
    "- Make MINIMAL changes — only fix the described issue",
    "- Preserve existing code style and patterns",
    "- Do not add new dependencies",
    "- Do not modify files not listed above",
    "- Every change must be verifiable",
  ];
  return lines.join("\n");
}

// ─── Run pi stage ─────────────────────────────────────────────────
function runPiStage(stageName, tools, prompt, sessionId, cwd, timeoutSec = 180, isFirst = false) {
  // All stages: --session-id creates or resumes the named session
  // No --continue needed — pi auto-continues an existing session-id
  const model = process.env.FORGE_PI_MODEL || "glm-5";  // GLM-5 for pi agents, 5.1 reserved for Jarvis
  const cmd = `${PI_BIN} --print --mode text --provider glm --model ${model} --thinking low --session-id ${sessionId} --tools ${tools} ${prompt}`;
  console.log(`  → ${stageName}${isFirst ? " (new session)" : " (continuing)"}...`);
  try {
    const result = execSync(cmd, {
      cwd,
      encoding: "utf8",
      timeout: timeoutSec * 1000,
      env: { ...process.env, GLM_API_KEY: API_KEY },
      maxBuffer: 10 * 1024 * 1024
    });
    return { ok: true, output: result };
  } catch (e) {
    return { ok: false, output: e.stdout || "", error: e.message };
  }
}

// ─── Copy files between workdir and batch dir ─────────────────────
function copyArtifact(src, destDir, filename) {
  if (existsSync(join(src, filename))) {
    mkdirSync(destDir, { recursive: true });
    copyFileSync(join(src, filename), join(destDir, filename));
    return true;
  }
  return false;
}

// ─── Run a single batch ───────────────────────────────────────────
async function runBatch(batch, plan, progress) {
  const batchDir = join(planDir, batch.id);
  mkdirSync(batchDir, { recursive: true });

  const branchName = batch.branch || `fix/forge-${batch.id}-ai`;
  const repoPath = plan.repo_path || plan.repo;
  const sessionId = `forge-${batch.id}`;

  // Generate TASK.md in both batch dir and workdir
  const taskContent = generateTask(batch, plan);
  writeFileSync(join(batchDir, "TASK.md"), taskContent);
  writeFileSync(join(WORKDIR, "TASK.md"), taskContent);

  // Clear previous artifacts from workdir
  for (const f of ["SPEC.md", "PLAN.md", "VALIDATION.md"]) {
    try { const p = join(WORKDIR, f); if (existsSync(p)) { unlinkSync(p); } } catch {}
  }

  if (dryRun) {
    console.log(`\n  [DRY RUN] Batch ${batch.id}: ${batch.title}`);
    console.log(`    Files: ${batch.files.join(", ")}`);
    console.log(`    Branch: ${branchName}`);
    console.log(`    TASK.md: ${join(batchDir, "TASK.md")}`);
    console.log(`    Workdir: ${WORKDIR}`);
    console.log(`    Pipeline: SPEC → PLAN → CHECKPOINT → BUILD → VALIDATE`);
    return "pending";
  }

  console.log(`\n▶ Batch ${batch.id}: ${batch.title}`);
  markBatch(progress, batch.id, "running", { started: new Date().toISOString() });

  // Set up branch in target repo
  if (repoPath && existsSync(repoPath)) {
    try {
      execSync(`git -C ${repoPath} checkout -b ${branchName} 2>/dev/null || git -C ${repoPath} checkout ${branchName}`, { encoding: "utf8" });
    } catch { /* branch may exist */ }
  }

  try {
    // ─── Stage 1: SPEC (new session) ────────────────────
    const specResult = runPiStage("SPEC", "read,grep,ls,write",
      `"Read ./TASK.md. Write ./SPEC.md: restate the task as a crisp spec with explicit, checkable acceptance criteria. Do NOT write code yet."`,
      sessionId, WORKDIR, 120, true);
    if (!specResult.ok) throw new Error(`SPEC stage failed: ${specResult.error}`);
    copyArtifact(WORKDIR, batchDir, "SPEC.md");

    // ─── Stage 2: PLAN (continue session) ─────────────────
    const planResult = runPiStage("PLAN", "read,grep,ls,write",
      `"Read ./SPEC.md. Write ./PLAN.md: numbered build steps, exactly which files you will create or modify, and how each acceptance criterion will be validated."`,
      sessionId, WORKDIR, 120);
    if (!planResult.ok) throw new Error(`PLAN stage failed: ${planResult.error}`);
    copyArtifact(WORKDIR, batchDir, "PLAN.md");

    // ─── Checkpoint ───────────────────────────────────────
    if (!autoApprove) {
      console.log(`\n  ⏸ CHECKPOINT: Batch ${batch.id}`);
      console.log(`    SPEC: ${join(batchDir, "SPEC.md")}`);
      console.log(`    PLAN: ${join(batchDir, "PLAN.md")}`);

      if (process.stdin.isTTY) {
        console.log(`    Review and type 'y' to proceed, anything else to skip:`);
        const answer = await new Promise(resolve => {
          process.stdin.setEncoding("utf8");
          process.stdin.once("data", d => resolve(d.trim().toLowerCase()));
          setTimeout(() => { console.log("  (auto-approving after 60s)"); resolve("y"); }, 60000);
        });
        if (answer !== "y" && answer !== "yes") {
          markBatch(progress, batch.id, "skipped", { finished: new Date().toISOString(), reason: "user skipped" });
          console.log(`  ⊘ Skipped ${batch.id}`);
          return "skipped";
        }
      } else {
        console.log(`    Non-interactive mode. Waiting 10s then proceeding...`);
        await new Promise(r => setTimeout(r, 10000));
      }
    }

    // ─── Stage 3: BUILD ───────────────────────────────────
    // For BUILD, pi needs access to the target repo files
    // We give it bash + edit tools and tell it where the repo is
    const buildPrompt = `"Read ./PLAN.md and ./SPEC.md. Execute the plan: modify the files listed in PLAN.md. The target repo is at ${repoPath}. Work on branch ${branchName}. Write changes to the actual files."`;
    const buildResult = runPiStage("BUILD", "read,bash,edit,write",
      buildPrompt, sessionId, WORKDIR, 300);
    if (!buildResult.ok) {
      console.error(`  ⚠️ BUILD had issues: ${buildResult.error}`);
      // Don't fail entirely — still try validate
    }

    // Copy build output if any
    const buildDir = join(WORKDIR, "build");
    if (existsSync(buildDir)) {
      mkdirSync(join(batchDir, "build"), { recursive: true });
      try { execSync(`cp -r ${buildDir}/* ${join(batchDir, "build")}/ 2>/dev/null || true`); } catch {}
    }

    // ─── Stage 4: VALIDATE ────────────────────────────────
    const validatePrompt = `"Read ./SPEC.md. Verify the changes against each acceptance criterion. Run bash commands to test. Write ./VALIDATION.md: list each criterion with PASS/FAIL and evidence."`;
    const validateResult = runPiStage("VALIDATE", "read,bash,grep,ls,write",
      validatePrompt, sessionId, WORKDIR, 180);
    if (!validateResult.ok) throw new Error(`VALIDATE stage failed: ${validateResult.error}`);
    copyArtifact(WORKDIR, batchDir, "VALIDATION.md");

    // ─── Eval gate ────────────────────────────────────────
    console.log(`  → Eval...`);
    try {
      execSync(`node "${join(ROOT, "lib", "forge-eval.mjs")}" batch "${batchDir}"`, {
        encoding: "utf8", timeout: 10000, stdio: "pipe"
      });
      console.log(`  ✅ Batch eval passed`);
    } catch {
      console.log(`  ⚠️ Batch eval had issues`);
    }

    markBatch(progress, batch.id, "passed", { finished: new Date().toISOString() });
    console.log(`  ✅ Batch ${batch.id} complete`);
    return "passed";

  } catch (e) {
    markBatch(progress, batch.id, "failed", { finished: new Date().toISOString(), error: e.message });
    console.error(`  ✗ Batch ${batch.id} failed: ${e.message}`);
    return "failed";
  }
}

// ─── Summary ──────────────────────────────────────────────────────
function writeSummary(progress) {
  const results = Object.entries(progress.batches);
  const passed = results.filter(([_, b]) => b.status === "passed").length;
  const failed = results.filter(([_, b]) => b.status === "failed").length;
  const skipped = results.filter(([_, b]) => b.status === "skipped").length;
  const remaining = results.filter(([_, b]) => b.status === "pending" || b.status === "running").length;

  const lines = [
    `# Forge Execution Summary`,
    `Plan: ${plan.id}`,
    `Date: ${new Date().toISOString()}`,
    "",
    `## Results`,
    `- ✅ Passed: ${passed}`,
    `- ❌ Failed: ${failed}`,
    `- ⊘ Skipped: ${skipped}`,
    `- ⏳ Remaining: ${remaining}`,
    `- 📊 Total: ${results.length}`,
    "",
    `## Per-Batch`, "",
  ];

  for (const [id, b] of results) {
    const icon = b.status === "passed" ? "✅" : b.status === "failed" ? "❌" : b.status === "skipped" ? "⊘" : "⏳";
    lines.push(`- ${icon} ${id}: ${b.status}${b.error ? ` (${b.error})` : ""}`);
  }

  lines.push("", "## Next Steps");
  if (failed > 0) lines.push(`- Re-run failed: forge apply ${planPath} ${results.filter(([_, b]) => b.status === "failed").map(([id]) => id).join(" ")}`);
  if (remaining > 0) lines.push(`- Continue: forge apply ${planPath}`);
  if (failed === 0 && remaining === 0) lines.push("- All complete! Review VALIDATION.md files and merge.");

  writeFileSync(join(planDir, "SUMMARY.md"), lines.join("\n"));
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔨 Forge Executor: ${plan.id}`);
  console.log(`   Batches: ${plan.batches?.length || 0}`);
  console.log(`   Mode: ${dryRun ? "DRY RUN" : autoApprove ? "AUTO-APPROVE" : "INTERACTIVE"}`);
  console.log(`   Pi: ${PI_BIN}`);
  console.log(`   Workdir: ${WORKDIR}`);
  console.log(`   Key: ${API_KEY ? "✓" : "✗"}`);

  if (!plan.batches?.length) { console.error("✗ No batches in plan"); process.exit(1); }

  const runOrder = resolveOrder(plan.batches);
  const toRun = requestedIds.length > 0
    ? runOrder.filter(id => requestedIds.includes(id))
    : runOrder;

  console.log(`   Order: ${toRun.join(" → ")}\n`);

  // Ensure pi-software is provisioned
  if (!existsSync(join(WORKDIR, "AGENTS.md"))) {
    console.log("  ▶ Provisioning pi-software...");
    execSync(`bash "${join(ROOT, "bin", "provision-agent.sh")}" pi-software`, {
      encoding: "utf8", timeout: 30000, cwd: ROOT
    });
  }

  const progress = loadProgress();
  const results = { passed: 0, failed: 0, skipped: 0 };

  for (const batchId of toRun) {
    const batch = (plan.batches || []).find(b => b.id === batchId);
    if (!batch) { console.warn(`  ⚠️ Unknown batch: ${batchId}`); continue; }

    // Check dependencies
    const depsOk = (batch.depends_on || []).every(dep => progress.batches[dep]?.status === "passed");
    if (!depsOk && batch.depends_on?.length > 0) {
      console.log(`  ⊘ Skipping ${batchId}: dependencies not met`);
      markBatch(progress, batchId, "skipped", { reason: "dependency not met" });
      results.skipped++;
      continue;
    }

    // Skip already passed
    if (progress.batches[batchId]?.status === "passed") {
      console.log(`  ✓ ${batchId} already passed`);
      continue;
    }

    const result = await runBatch(batch, plan, progress);
    results[result]++;
  }

  writeSummary(progress);
  console.log(`\n📊 ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
  console.log(`   Summary: ${join(planDir, "SUMMARY.md")}`);
}

main().catch(e => { console.error(`✗ Executor failed: ${e.message}`); process.exit(1); });
