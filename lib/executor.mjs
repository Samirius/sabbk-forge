#!/usr/bin/env node
// executor.mjs — Runs each batch from a plan through the core pipeline.
// Generates TASK.md per batch, calls run-spike.sh, tracks progress.
//
// Usage:
//   node lib/executor.mjs <plan.json> [batch-ids...]
//   node lib/executor.mjs plan.json                  (run all)
//   node lib/executor.mjs plan.json B001 B002        (run specific)
//   node lib/executor.mjs plan.json --dry-run        (print commands, don't run)
//   node lib/executor.mjs plan.json --auto-approve   (skip checkpoints)

import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
  readdirSync, statSync, appendFileSync, unlinkSync
} from "node:fs";
import { join, basename, resolve, dirname } from "node:path";
import { spawn, execSync } from "node:child_process";

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

// Parse requested batch IDs (everything that's not a flag)
const requestedIds = process.argv.slice(3).filter(a => !a.startsWith("--"));

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
    status, // pending | running | passed | failed | skipped
    started: detail.started || new Date().toISOString(),
    finished: detail.finished || null,
    ...detail
  };
  saveProgress(progress);
}

// ─── Dependency Resolution ────────────────────────────────────────
function resolveOrder(batches) {
  // Topological sort respecting depends_on
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

// ─── Generate TASK.md for a batch ─────────────────────────────────
function generateTask(batch, plan, repoPath) {
  const lines = [
    `# Task: ${batch.title}`,
    "",
    `**Plan:** ${plan.id}`,
    `**Batch:** ${batch.id}`,
    `**Severity:** ${batch.severity}`,
    `**Risk:** ${batch.risk}`,
    `**Branch:** ${batch.branch || `fix/forge-${batch.id}-ai`}`,
    "",
    "## Objective",
    batch.title,
    "",
    "## Files to Modify",
    ...batch.files.map(f => `- \`${f}\``),
    "",
    "## Acceptance Criteria",
    ...batch.acceptance_criteria.map((ac, i) => `${i + 1}. ${ac}`),
    "",
    "## Constraints",
    "- Make MINIMAL changes — only fix the described issue",
    "- Preserve existing code style and patterns",
    "- Do not add new dependencies",
    "- Do not modify files not listed above",
    "- Every change must be verifiable",
  ];

  return lines.join("\n");
}

// ─── Run a single batch through the pipeline ──────────────────────
async function runBatch(batch, plan, progress) {
  const batchDir = join(planDir, batch.id);
  mkdirSync(batchDir, { recursive: true });

  // Generate TASK.md
  const taskContent = generateTask(batch, plan);
  writeFileSync(join(batchDir, "TASK.md"), taskContent);

  // Copy task to spike workdir for pi-software
  const agentWorkdir = join(ROOT, "spike", "workdir", "pi-software");
  mkdirSync(agentWorkdir, { recursive: true });
  writeFileSync(join(agentWorkdir, "TASK.md"), taskContent);

  const branchName = batch.branch || `fix/forge-${batch.id}-ai`;
  const repoPath = plan.repo_path || plan.repo;

  if (dryRun) {
    console.log(`\n  [DRY RUN] Batch ${batch.id}: ${batch.title}`);
    console.log(`    Files: ${batch.files.join(", ")}`);
    console.log(`    Branch: ${branchName}`);
    console.log(`    TASK.md: ${join(batchDir, "TASK.md")}`);
    console.log(`    Would run: bash bin/run-spike.sh --run pi-software`);
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

  // Run through core pipeline
  // Stage 1+2: SPEC + PLAN
  try {
    const piBin = existsSync(join(ROOT, "node_modules", ".bin", "pi"))
      ? join(ROOT, "node_modules", ".bin", "pi") : "pi";

    const prov = process.env.PI_PROVIDER || "glm";
    const model = process.env.PI_MODEL_ID || "glm-5.1";

    const specMsg = `Read ./AGENTS.md (your contract) and ./TASK.md. Write ./SPEC.md: restate the task as a crisp spec with explicit, checkable acceptance criteria. Do NOT write code yet.`;
    const planMsg = `Read ./SPEC.md. Write ./PLAN.md: numbered build steps, exactly which files you will create or modify, and how each acceptance criterion will be validated.`;

    // SPEC stage
    console.log(`  → SPEC...`);
    execSync(
      `${piBin} --print --mode text --provider ${prov} --model ${model} --thinking low --session-id forge-${batch.id} --tools read,grep,ls,write "${specMsg}"`,
      { cwd: agentWorkdir, encoding: "utf8", timeout: 120000, env: { ...process.env } }
    );

    // PLAN stage
    console.log(`  → PLAN...`);
    execSync(
      `${piBin} --print --mode text --provider ${prov} --model ${model} --thinking low --session-id forge-${batch.id} --tools read,grep,ls,write --resume "${planMsg}"`,
      { cwd: agentWorkdir, encoding: "utf8", timeout: 120000, env: { ...process.env } }
    );

    // Copy artifacts to batch dir
    for (const f of ["SPEC.md", "PLAN.md"]) {
      if (existsSync(join(agentWorkdir, f))) {
        writeFileSync(join(batchDir, f), readFileSync(join(agentWorkdir, f), "utf8"));
      }
    }

    // Checkpoint
    if (!autoApprove) {
      console.log(`\n  ⏸ CHECKPOINT: Review PLAN.md for batch ${batch.id}`);
      console.log(`    Plan: ${join(batchDir, "PLAN.md")}`);
      console.log(`    Type 'y' to proceed, anything else to skip this batch:`);

      // For non-interactive mode, auto-approve if flag is set
      // In interactive terminals, this would pause for input
      // For forge runs, --auto-approve should be used
      const chunks = [];
      process.stdin.setEncoding("utf8");
      const answer = await new Promise(resolve => {
        process.stdin.once("data", d => resolve(d.trim().toLowerCase()));
        setTimeout(() => { console.log("  (auto-approving after 30s timeout)"); resolve("y"); }, 30000);
      });

      if (answer !== "y" && answer !== "yes") {
        markBatch(progress, batch.id, "skipped", { finished: new Date().toISOString(), reason: "user skipped at checkpoint" });
        console.log(`  ⊘ Skipped batch ${batch.id}`);
        return "skipped";
      }
    }

    // BUILD + VALIDATE stages
    const buildMsg = `Read ./PLAN.md. Execute it: create or modify the files listed in PLAN.md. Stay strictly inside the repo. Work on branch ${branchName}.`;
    const validMsg = `Verify changes against ./SPEC.md acceptance criteria. Write ./VALIDATION.md: list each criterion with pass/fail and evidence.`;

    console.log(`  → BUILD...`);
    execSync(
      `${piBin} --print --mode text --provider ${prov} --model ${model} --thinking low --session-id forge-${batch.id} --tools read,bash,edit,write --resume "${buildMsg}"`,
      { cwd: agentWorkdir, encoding: "utf8", timeout: 300000, env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=2048" } }
    );

    console.log(`  → VALIDATE...`);
    execSync(
      `${piBin} --print --mode text --provider ${prov} --model ${model} --thinking low --session-id forge-${batch.id} --tools read,bash,grep,ls,write --resume "${validMsg}"`,
      { cwd: agentWorkdir, encoding: "utf8", timeout: 180000, env: { ...process.env } }
    );

    // Copy results to batch dir
    for (const f of ["VALIDATION.md"]) {
      if (existsSync(join(agentWorkdir, f))) {
        writeFileSync(join(batchDir, f), readFileSync(join(agentWorkdir, f), "utf8"));
      }
    }

    // Check for build output
    const buildDir = join(agentWorkdir, "build");
    if (existsSync(buildDir)) {
      mkdirSync(join(batchDir, "build"), { recursive: true });
      execSync(`cp -r ${buildDir}/* ${join(batchDir, "build")}/ 2>/dev/null || true`);
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
    `## Per-Batch`,
    "",
  ];

  for (const [id, b] of results) {
    const icon = b.status === "passed" ? "✅" : b.status === "failed" ? "❌" : b.status === "skipped" ? "⊘" : "⏳";
    lines.push(`- ${icon} ${id}: ${b.status}${b.error ? ` (${b.error})` : ""}`);
  }

  lines.push("", "## Next Steps");
  if (failed > 0) lines.push(`- Review failed batches and re-run: node lib/executor.mjs ${planPath} ${results.filter(([_, b]) => b.status === "failed").map(([id]) => id).join(" ")}`);
  if (remaining > 0) lines.push(`- Continue remaining: node lib/executor.mjs ${planPath}`);
  if (failed === 0 && remaining === 0) lines.push("- All batches complete! Review VALIDATION.md files and merge.");

  const summaryPath = join(planDir, "SUMMARY.md");
  writeFileSync(summaryPath, lines.join("\n"));
  return summaryPath;
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔨 Forge Executor: ${plan.id}`);
  console.log(`   Batches: ${plan.batches?.length || 0}`);
  console.log(`   Mode: ${dryRun ? "DRY RUN" : autoApprove ? "AUTO-APPROVE" : "INTERACTIVE"}\n`);

  if (!plan.batches?.length) { console.error("✗ No batches in plan"); process.exit(1); }

  // Determine which batches to run
  const runOrder = resolveOrder(plan.batches);
  const toRun = requestedIds.length > 0
    ? runOrder.filter(id => requestedIds.includes(id))
    : runOrder;

  console.log(`  Execution order: ${toRun.join(" → ")}\n`);

  const progress = loadProgress();
  const batchMap = new Map(plan.batches.map(b => [b.id, b]));
  const results = { passed: 0, failed: 0, skipped: 0 };

  for (const batchId of toRun) {
    const batch = batchMap.get(batchId);
    if (!batch) { console.warn(`  ⚠️ Unknown batch: ${batchId}`); continue; }

    // Check if dependencies passed
    const depsOk = (batch.depends_on || []).every(dep => {
      const depStatus = progress.batches[dep]?.status;
      return depStatus === "passed";
    });

    if (!depsOk && batch.depends_on?.length > 0) {
      console.log(`  ⊘ Skipping ${batchId}: dependencies not met`);
      markBatch(progress, batchId, "skipped", { reason: "dependency not met" });
      results.skipped++;
      continue;
    }

    // Skip already completed
    const existing = progress.batches[batchId];
    if (existing?.status === "passed") {
      console.log(`  ✓ ${batchId} already passed, skipping`);
      continue;
    }

    const result = await runBatch(batch, plan, progress);
    results[result]++;
  }

  // Summary
  const summaryPath = writeSummary(progress);
  console.log(`\n📊 Summary: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
  console.log(`   ${summaryPath}`);
}

main().catch(e => { console.error(`✗ Executor failed: ${e.message}`); process.exit(1); });
