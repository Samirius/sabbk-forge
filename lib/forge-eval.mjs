#!/usr/bin/env node
// forge-eval.mjs — Shared eval primitives for all 3 pipeline gates.
//
// Usage:
//   node lib/forge-eval.mjs scan   <context-dir>
//   node lib/forge-eval.mjs plan   <plan.json>
//   node lib/forge-eval.mjs batch  <batch-dir>
//
// Each returns JSON with { passed, checks: { name: bool }, score, failures: [] }
// Exit code: 0 = passed, 1 = failed

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const [gate, target] = process.argv.slice(2);
if (!gate || !target) {
  console.error("usage: node forge-eval.mjs <scan|plan|batch> <path>");
  process.exit(2);
}

// ─── Scan Eval ────────────────────────────────────────────────────
function evalScan(ctxDir) {
  const abs = resolve(target);
  const checks = {};
  const failures = [];

  // 1. has_index
  const indexPath = join(abs, "index.md");
  checks.has_index = existsSync(indexPath) && statSync(indexPath).size > 100;
  if (!checks.has_index) failures.push("index.md missing or empty");

  // 2. has_stack
  const stackPath = join(abs, "stack.md");
  checks.has_stack = existsSync(stackPath) && statSync(stackPath).size > 50;
  if (!checks.has_stack) failures.push("stack.md missing or empty");

  // 3. has_modules
  const moduleFiles = readdirSync(abs).filter(f => f.startsWith("module-") && f.endsWith(".md"));
  checks.has_modules = moduleFiles.length >= 2;
  if (!checks.has_modules) failures.push(`only ${moduleFiles.length} module files (need ≥2)`);

  // 4. min_modules — for Laravel: need Controllers, Models, Routes at minimum
  const indexContent = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
  const criticalModules = ["Controller", "Model", "Route"];
  const foundCritical = criticalModules.filter(m => indexContent.includes(m));
  checks.min_modules = foundCritical.length >= 2 || moduleFiles.length >= 4;
  if (!checks.min_modules) failures.push(`missing critical modules (found: ${foundCritical.join(", ")})`);

  // 5. modules_have_code — check for actual source code blocks
  let modulesWithCode = 0;
  let emptyModules = 0;
  for (const mf of moduleFiles) {
    const content = readFileSync(join(abs, mf), "utf8");
    if (/```\w/.test(content)) modulesWithCode++;
    if (content.length < 200) emptyModules++;
  }
  checks.modules_have_code = modulesWithCode >= Math.max(1, moduleFiles.length * 0.5);
  if (!checks.modules_have_code) failures.push(`only ${modulesWithCode}/${moduleFiles.length} modules have code blocks`);

  // 6. no_empty_modules
  checks.no_empty_modules = emptyModules === 0;
  if (!checks.no_empty_modules) failures.push(`${emptyModules} module files are empty (<200 bytes)`);

  const passed = Object.values(checks).every(Boolean);
  const score = Math.round((Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100);

  return { passed, checks, score, failures };
}

// ─── Plan Eval ────────────────────────────────────────────────────
function evalPlan(planPath) {
  const abs = resolve(planPath);
  const checks = {};
  const failures = [];

  if (!existsSync(abs)) {
    return { passed: false, checks: { exists: false }, score: 0, failures: ["plan.json not found"] };
  }

  let plan;
  try {
    plan = JSON.parse(readFileSync(abs, "utf8"));
  } catch (e) {
    return { passed: false, checks: { parseable: false }, score: 0, failures: [`invalid JSON: ${e.message}`] };
  }

  // 1. has_batches
  checks.has_batches = Array.isArray(plan.batches) && plan.batches.length >= 1;
  if (!checks.has_batches) failures.push("no batches defined");

  // 2. batches_have_ids
  if (checks.has_batches) {
    const allHaveIds = plan.batches.every(b => typeof b.id === "string" && b.id.length > 0);
    const uniqueIds = new Set(plan.batches.map(b => b.id)).size === plan.batches.length;
    checks.batches_have_ids = allHaveIds && uniqueIds;
    if (!checks.batches_have_ids) failures.push("batch IDs missing or not unique");
  } else {
    checks.batches_have_ids = false;
  }

  // 3. batches_have_files
  if (checks.has_batches) {
    checks.batches_have_files = plan.batches.every(b => Array.isArray(b.files) && b.files.length >= 1);
    if (!checks.batches_have_files) failures.push("some batches missing file references");
  } else {
    checks.batches_have_files = false;
  }

  // 4. batches_have_acs
  if (checks.has_batches) {
    checks.batches_have_acs = plan.batches.every(b =>
      Array.isArray(b.acceptance_criteria) && b.acceptance_criteria.length >= 1
    );
    if (!checks.batches_have_acs) failures.push("some batches missing acceptance criteria");
  } else {
    checks.batches_have_acs = false;
  }

  // 5. deps_are_valid
  if (checks.has_batches && checks.batches_have_ids) {
    const ids = new Set(plan.batches.map(b => b.id));
    checks.deps_are_valid = plan.batches.every(b =>
      (b.depends_on || []).every(dep => ids.has(dep))
    );
    if (!checks.deps_are_valid) failures.push("some depends_on reference non-existent batch IDs");
  } else {
    checks.deps_are_valid = true;
  }

  // 6. no_circular_deps
  if (checks.has_batches && checks.deps_are_valid) {
    const visited = new Set();
    const inStack = new Set();
    let hasCycle = false;
    const batchMap = new Map(plan.batches.map(b => [b.id, b]));

    function dfs(id) {
      if (inStack.has(id)) { hasCycle = true; return; }
      if (visited.has(id)) return;
      visited.add(id);
      inStack.add(id);
      const batch = batchMap.get(id);
      if (batch?.depends_on) batch.depends_on.forEach(dfs);
      inStack.delete(id);
    }

    plan.batches.forEach(b => dfs(b.id));
    checks.no_circular_deps = !hasCycle;
    if (hasCycle) failures.push("circular dependency detected");
  } else {
    checks.no_circular_deps = true;
  }

  // 7. files_exist (if repo_path is accessible)
  if (checks.has_batches && plan.repo_path && existsSync(plan.repo_path)) {
    const allFiles = plan.batches.flatMap(b => b.files);
    const existing = allFiles.filter(f => existsSync(join(plan.repo_path, f)));
    checks.files_exist = existing.length >= allFiles.length * 0.5; // at least 50% must exist
    if (!checks.files_exist) failures.push(`${allFiles.length - existing.length}/${allFiles.length} referenced files don't exist`);
  } else {
    checks.files_exist = true; // can't verify, assume ok
  }

  // 8. title_quality — titles should be specific, not generic
  if (checks.has_batches) {
    const genericPatterns = /^(fix bugs|update code|improve|refactor|cleanup|misc)$/i;
    checks.title_quality = plan.batches.every(b => b.title && b.title.length > 10 && !genericPatterns.test(b.title));
    if (!checks.title_quality) failures.push("some batch titles are too generic");
  } else {
    checks.title_quality = false;
  }

  const passed = Object.values(checks).every(Boolean);
  const score = Math.round((Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100);

  return { passed, checks, score, failures };
}

// ─── Batch Eval ───────────────────────────────────────────────────
function evalBatch(batchDir) {
  const abs = resolve(batchDir);
  const checks = {};
  const failures = [];

  // Check for required artifacts from core pipeline
  checks.has_task = existsSync(join(abs, "TASK.md"));
  if (!checks.has_task) failures.push("TASK.md missing");

  checks.has_spec = existsSync(join(abs, "SPEC.md"));
  if (!checks.has_spec) failures.push("SPEC.md missing");

  checks.has_plan = existsSync(join(abs, "PLAN.md"));
  if (!checks.has_plan) failures.push("PLAN.md missing");

  checks.has_validation = existsSync(join(abs, "VALIDATION.md"));
  if (!checks.has_validation) failures.push("VALIDATION.md missing");

  // Check validation content for pass indicators
  if (checks.has_validation) {
    const content = readFileSync(join(abs, "VALIDATION.md"), "utf8");
    const passCount = (content.match(/✅|pass/gi) || []).length;
    const failCount = (content.match(/❌|fail/gi) || []).length;
    checks.validation_passed = passCount > 0 && failCount === 0;
    if (!checks.validation_passed && failCount > 0) failures.push(`${failCount} acceptance criteria failed`);
  } else {
    checks.validation_passed = false;
  }

  const passed = Object.values(checks).every(Boolean);
  const score = Math.round((Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100);

  return { passed, checks, score, failures };
}

// ─── Router ───────────────────────────────────────────────────────
let result;
switch (gate) {
  case "scan":  result = evalScan(target); break;
  case "plan":  result = evalPlan(target); break;
  case "batch": result = evalBatch(target); break;
  default:
    console.error("gate must be: scan | plan | batch");
    process.exit(2);
}

// Write eval result alongside the target
const resultPath = gate === "scan" ? join(resolve(target), "eval.json") : join(resolve(target), "..", "eval.json");
try {
  writeFileSync(resultPath, JSON.stringify({ gate, ...result, evaluated_at: new Date().toISOString() }, null, 2));
} catch {}

console.log(JSON.stringify(result, null, 2));
if (!result.passed) {
  console.error(`\n❌ Eval FAILED (${result.score}%):`);
  result.failures.forEach(f => console.error(`  - ${f}`));
  process.exit(1);
} else {
  console.error(`\n✅ Eval PASSED (${result.score}%)`);
  process.exit(0);
}
