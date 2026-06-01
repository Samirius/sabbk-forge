#!/usr/bin/env node
// planner.mjs — Takes scanner context + request, produces a batched plan.
// Iterates modules ONE BY ONE (not all at once) — no timeout issues.
// STRICT: only reads context/ files. Never reads raw codebase.
// CONTRACT: checks scan.json. Auto-runs scanner if missing/expired.
// EVAL: runs plan eval after generating.
//
// Usage:
//   node lib/planner.mjs audit   <repo-name> [focus]
//   node lib/planner.mjs apply   <repo-name> <audit-report>
//   node lib/planner.mjs build   <repo-name> <spec-file>
//   node lib/planner.mjs refactor <repo-name> <scope>

import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
  readdirSync
} from "node:fs";
import { execSync } from "node:child_process";
import { join, basename, resolve } from "node:path";

const HERE = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const GLM_KEY = process.env.GLM_API_KEY || (existsSync(join(process.env.HOME || "/root", ".config", "forge", "zai-key"))
  ? readFileSync(join(process.env.HOME || "/root", ".config", "forge", "zai-key"), "utf8").trim() : "");

const [mode, repoName, ...args] = process.argv.slice(2);
if (!mode || !repoName) {
  console.error("usage: node planner.mjs <audit|apply|build|refactor> <repo-name> [focus|file|scope]");
  process.exit(1);
}

const CTX = join(HERE, "lifecycle", "context", repoName);
const PLAN_DIR = join(HERE, "lifecycle", "plans", repoName);
const SCAN_JSON = join(CTX, "scan.json");

if (!GLM_KEY) { console.error("✗ GLM_API_KEY required for planning"); process.exit(3); }

// ─── Contract: Check / Auto-scan ──────────────────────────────────
function ensureScan() {
  if (existsSync(SCAN_JSON)) {
    try {
      const scan = JSON.parse(readFileSync(SCAN_JSON, "utf8"));
      const age = Date.now() - new Date(scan.scanned_at).getTime();
      const ttl = (scan.expires_after_hours || 24) * 3600 * 1000;
      if (age < ttl) {
        console.log(`  ✓ Scanner context fresh (scanned ${Math.round(age / 3600000)}h ago, TTL ${scan.expires_after_hours}h)`);
        return scan;
      }
      console.log(`  ⚠️ Context expired (scanned ${Math.round(age / 3600000)}h ago)`);
    } catch (e) { console.log(`  ⚠️ scan.json corrupt: ${e.message}`); }
  } else {
    console.log(`  ⚠️ No scanner context for ${repoName}`);
  }

  let repoPath;
  if (existsSync(SCAN_JSON)) { try { repoPath = JSON.parse(readFileSync(SCAN_JSON, "utf8")).path; } catch {} }
  if (!repoPath || !existsSync(repoPath)) {
    const candidates = [join(process.env.HOME || "/root", repoName), join(process.env.HOME || "/root", "work", repoName)];
    repoPath = candidates.find(p => existsSync(p));
  }
  if (!repoPath) { console.error(`✗ Cannot find repo. Run: forge scan <path> first.`); process.exit(1); }

  console.log(`  ▶ Auto-scanning: ${repoPath}`);
  try {
    execSync(`node "${join(HERE, "lib", "scanner.mjs")}" "${repoPath}"`, { encoding: "utf8", timeout: 300000, stdio: "inherit" });
  } catch (e) { console.error(`✗ Auto-scan failed: ${e.message}`); process.exit(4); }

  return JSON.parse(readFileSync(SCAN_JSON, "utf8"));
}

// ─── Context Loading (files only) ─────────────────────────────────
function loadIndex() { return readFileSync(join(CTX, "index.md"), "utf8"); }
function loadStack() { return readFileSync(join(CTX, "stack.md"), "utf8"); }

function loadModules() {
  return readdirSync(CTX).filter(f => f.startsWith("module-") && f.endsWith(".md")).sort()
    .map(f => ({ file: f, content: readFileSync(join(CTX, f), "utf8") }));
}

function loadModulesForFiles(filePaths) {
  return loadModules().filter(m => filePaths.some(f => m.content.includes(f) || m.content.includes(basename(f))));
}

// ─── LLM Call ─────────────────────────────────────────────────────
async function callGLM(systemPrompt, userPrompt, maxTokens = 4000) {
  const body = JSON.stringify({
    model: process.env.FORGE_PLANNER_MODEL || "glm-5",
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    max_tokens: maxTokens,
    temperature: 0.3
  });
  const resp = execSync(
    `curl -s https://api.z.ai/api/coding/paas/v4/chat/completions -H "Authorization: Bearer ${GLM_KEY}" -H "Content-Type: application/json" -d @-`,
    { input: body, timeout: 120000, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );
  return JSON.parse(resp).choices?.[0]?.message?.content || "";
}

// ─── Plan Eval Gate ───────────────────────────────────────────────
function runPlanEval(planPath) {
  console.log(`\n  ▶ Plan eval gate...`);
  try {
    const result = execSync(`node "${join(HERE, "lib", "forge-eval.mjs")}" plan "${planPath}"`, {
      encoding: "utf8", timeout: 10000, stdio: "pipe"
    });
    const evalData = JSON.parse(result);
    console.log(`  ${evalData.passed ? "✅" : "⚠️"} Plan eval: ${evalData.score}%`);
    if (!evalData.passed) evalData.failures.forEach(f => console.error(`     - ${f}`));
    mkdirSync(PLAN_DIR, { recursive: true });
    writeFileSync(join(PLAN_DIR, "eval.json"), JSON.stringify({ gate: "plan", ...evalData, evaluated_at: new Date().toISOString() }, null, 2));
    return evalData;
  } catch (e) {
    console.error(`  ⚠️ Plan eval error: ${e.message}`);
    return { passed: false, score: 0, failures: ["eval execution failed"] };
  }
}

// ─── Audit Mode: iterate modules ONE BY ONE ───────────────────────
async function auditPlan(focus) {
  console.log(`\n📋 Planning audit for: ${repoName}${focus ? ` (focus: ${focus})` : ""}\n`);

  const scan = ensureScan();
  const index = loadIndex();
  const stack = loadStack();
  const allModules = loadModules();

  // Step 1: Iterate modules one by one — find issues per module
  const allFindings = [];
  const systemPrompt = `You are a senior code auditor. Given a module's analysis brief and code, find REAL issues.

For each issue, output EXACTLY:
- [ISSUE-ID] [P0/P1/P2/P3] [security|performance|bug|code-quality|ux|architecture] file:line — description

Rules:
- Only report issues you can SEE in the actual code
- Cite specific file names and function names
- Be concise — one line per issue
- Max 5 issues per module (prioritize the most impactful)
- If no issues found, output: CLEAN

${focus ? `Focus: ${focus}. Prioritize issues in this area.` : ""}`;

  console.log(`  ▶ Auditing ${allModules.length} modules one-by-one...\n`);

  for (const mod of allModules) {
    const modName = mod.file.replace(".md", "");
    console.log(`    → ${modName}...`);

    try {
      const response = await callGLM(systemPrompt, mod.content.slice(0, 8000), 2000);
      if (response && !response.includes("CLEAN")) {
        allFindings.push({ module: modName, findings: response });
        const issueCount = response.split("\n").filter(l => l.trim().startsWith("- [") || l.trim().match(/^\[/)).length;
        console.log(`      ${issueCount} issues found`);
      } else {
        console.log(`      clean`);
      }
    } catch (e) {
      console.log(`      ⚠️ ${e.message}`);
    }
  }

  // Step 2: Merge findings into a batched plan
  console.log(`\n  ▶ Merging ${allFindings.reduce((acc, f) => acc + f.findings.split("\n").length, 0)} findings into batches...`);

  const mergeSystem = `You are a senior project manager. Given a list of code issues across modules, create a batched fix plan.

Group related issues that touch the same files into batches. Each batch should be independently fixable in ~5 minutes.
Output ONLY the JSON plan (no markdown report).`;

  const allFindingsText = allFindings.map(f => `## ${f.module}\n${f.findings}`).join("\n\n");
  const planDate = new Date().toISOString().slice(0, 10);

  const mergePrompt = `Issues found across modules:

${allFindingsText.slice(0, 12000)}

Create a batched fix plan as JSON:
\`\`\`json
{
  "id": "${repoName}-audit-${planDate}",
  "mode": "apply",
  "total_batches": N,
  "batches": [
    {
      "id": "B001",
      "title": "specific title describing the fix",
      "severity": "P0",
      "files": ["path/to/file"],
      "acceptance_criteria": ["criterion 1", "criterion 2"],
      "depends_on": [],
      "risk": "high"
    }
  ]
}
\`\`\``;

  const mergeResponse = await callGLM(mergeSystem, mergePrompt, 6000);

  mkdirSync(PLAN_DIR, { recursive: true });

  // Write the human-readable audit report
  const reportLines = [`# Audit Report: ${repoName}`, `Date: ${new Date().toISOString()}`, `Scanner: ${scan.scanned_at}`, "",
    "## Findings by Module", ""];
  for (const f of allFindings) {
    reportLines.push(`### ${f.module}`, f.findings, "");
  }
  reportLines.push("", "## Execution Plan", mergeResponse);
  writeFileSync(join(PLAN_DIR, "AUDIT-REPORT.md"), reportLines.join("\n"));
  console.log(`  ✓ Audit report: ${join(PLAN_DIR, "AUDIT-REPORT.md")}`);

  // Extract and save the plan
  const jsonMatch = mergeResponse.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const plan = JSON.parse(jsonMatch[1]);
      plan.repo = repoName;
      plan.repo_path = scan.path;
      plan.created = new Date().toISOString();
      plan.source = "audit";
      plan.scanner_ref = `scan.json:${scan.scanned_at}`;

      const planPath = join(PLAN_DIR, `audit-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
      writeFileSync(planPath, JSON.stringify(plan, null, 2));
      console.log(`  ✓ Plan: ${planPath} (${plan.batches?.length || 0} batches)`);

      runPlanEval(planPath);
      return planPath;
    } catch (e) { console.error(`  ⚠️ JSON parse error: ${e.message}`); }
  }
  console.log(`  ⚠️ No JSON plan block found in merge response.`);
}

// ─── Apply Mode (one-by-one module iteration for relevant context) ─
async function applyPlan(auditReportPath) {
  console.log(`\n🔧 Planning fix batches for: ${repoName}\n`);
  const scan = ensureScan();
  const absReport = auditReportPath.startsWith("/") ? auditReportPath : join(process.cwd(), auditReportPath);
  if (!existsSync(absReport)) { console.error(`✗ report not found: ${absReport}`); process.exit(1); }

  const index = loadIndex();
  const report = readFileSync(absReport, "utf8");
  const mentionedFiles = report.match(/[\w/.-]+\.(php|js|vue|ts|py|sh|bash)/g) || [];
  const relevantModules = loadModulesForFiles(mentionedFiles);

  const systemPrompt = `You are a senior software engineer planning bug fixes. Each batch fixes 1-3 related issues touching the same files. Output ONLY JSON.`;
  const userPrompt = `Audit report:\n${report.slice(0, 10000)}\n\nRelevant code context:\n${relevantModules.slice(0, 4).map(m => m.content.slice(0, 3000)).join("\n\n")}\n\nOutput batched fix plan as JSON.`;

  const result = await callGLM(systemPrompt, userPrompt, 6000);
  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!jsonMatch) { console.error("✗ No JSON in response"); process.exit(5); }

  try {
    const plan = JSON.parse(jsonMatch[1]);
    plan.repo = repoName; plan.repo_path = scan.path;
    plan.created = new Date().toISOString();
    mkdirSync(PLAN_DIR, { recursive: true });
    const planPath = join(PLAN_DIR, `apply-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
    writeFileSync(planPath, JSON.stringify(plan, null, 2));
    console.log(`  ✓ Fix plan: ${planPath} (${plan.batches?.length || 0} batches)`);
    runPlanEval(planPath);
  } catch (e) { console.error(`✗ Parse error: ${e.message}`); process.exit(5); }
}

// ─── Build & Refactor Modes (same pattern) ────────────────────────
async function buildPlan(specFilePath) {
  console.log(`\n🏗️ Planning build for: ${repoName}\n`);
  const scan = ensureScan();
  const spec = readFileSync(specFilePath.startsWith("/") ? specFilePath : join(process.cwd(), specFilePath), "utf8");
  const index = loadIndex();

  const result = await callGLM(
    `You are a senior architect. Decompose a feature spec into buildable batches. Output ONLY JSON.`,
    `Spec:\n${spec.slice(0, 8000)}\n\nProject context:\n${index.slice(0, 3000)}\n\nOutput build plan as JSON.`,
    6000
  );
  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!jsonMatch) { console.error("✗ No JSON"); process.exit(5); }
  const plan = JSON.parse(jsonMatch[1]);
  plan.repo = repoName; plan.repo_path = scan.path; plan.created = new Date().toISOString();
  mkdirSync(PLAN_DIR, { recursive: true });
  const planPath = join(PLAN_DIR, `build-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
  writeFileSync(planPath, JSON.stringify(plan, null, 2));
  console.log(`  ✓ Build plan: ${planPath} (${plan.batches?.length || 0} batches)`);
  runPlanEval(planPath);
}

async function refactorPlan(scope) {
  console.log(`\n🔄 Planning refactor for: ${repoName} (${scope})\n`);
  const scan = ensureScan();
  const index = loadIndex();
  const relevantMods = loadModules().filter(m => m.content.toLowerCase().includes(scope.toLowerCase())).slice(0, 6);

  const result = await callGLM(
    `You are a senior architect planning safe refactoring steps. Output ONLY JSON.`,
    `Refactor: ${scope}\n\nContext:\n${index.slice(0, 3000)}\n\n${relevantMods.map(m => m.content.slice(0, 3000)).join("\n\n")}\n\nOutput refactor plan as JSON.`,
    6000
  );
  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!jsonMatch) { console.error("✗ No JSON"); process.exit(5); }
  const plan = JSON.parse(jsonMatch[1]);
  plan.repo = repoName; plan.repo_path = scan.path; plan.created = new Date().toISOString();
  mkdirSync(PLAN_DIR, { recursive: true });
  const planPath = join(PLAN_DIR, `refactor-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
  writeFileSync(planPath, JSON.stringify(plan, null, 2));
  console.log(`  ✓ Refactor plan: ${planPath} (${plan.batches?.length || 0} batches)`);
  runPlanEval(planPath);
}

// ─── Router ───────────────────────────────────────────────────────
switch (mode) {
  case "audit":    await auditPlan(args[0]); break;
  case "apply":    await applyPlan(args[0]); break;
  case "build":    await buildPlan(args[0]); break;
  case "refactor": await refactorPlan(args[0]); break;
  default: console.error("mode: audit | apply | build | refactor"); process.exit(2);
}
