#!/usr/bin/env node
// planner.mjs — Takes scanner context + request, produces a batched execution plan.
// STRICT: only reads context/ files. Never reads raw codebase.
// CONTRACT: checks for scan.json. Auto-runs scanner if missing/expired.
// EVAL: runs plan eval after generating.
//
// Usage:
//   node lib/planner.mjs audit   <repo-name> [focus]
//   node lib/planner.mjs apply   <repo-name> <audit-report>
//   node lib/planner.mjs build   <repo-name> <spec-file>
//   node lib/planner.mjs refactor <repo-name> <scope>

import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
  readdirSync, statSync
} from "node:fs";
import { execSync } from "node:child_process";
import { join, basename, resolve } from "node:path";

const HERE = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const GLM_KEY = process.env.GLM_API_KEY;

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
  // Check if scan.json exists and is fresh
  if (existsSync(SCAN_JSON)) {
    try {
      const scan = JSON.parse(readFileSync(SCAN_JSON, "utf8"));
      const scannedAt = new Date(scan.scanned_at);
      const ttl = (scan.expires_after_hours || 24) * 3600 * 1000;
      const age = Date.now() - scannedAt.getTime();

      if (age < ttl) {
        console.log(`  ✓ Scanner context fresh (scanned ${Math.round(age / 3600000)}h ago, TTL ${scan.expires_after_hours}h)`);
        return scan;
      } else {
        console.log(`  ⚠️ Scanner context expired (scanned ${Math.round(age / 3600000)}h ago, TTL ${scan.expires_after_hours}h)`);
      }
    } catch (e) {
      console.log(`  ⚠️ scan.json corrupt: ${e.message}`);
    }
  } else {
    console.log(`  ⚠️ No scanner context for ${repoName}`);
  }

  // Auto-scan
  // Need to find the repo path — check if scan.json has it, or look for it
  let repoPath;
  if (existsSync(SCAN_JSON)) {
    try { repoPath = JSON.parse(readFileSync(SCAN_JSON, "utf8")).path; } catch {}
  }

  // Try common locations
  if (!repoPath || !existsSync(repoPath)) {
    const candidates = [
      join(process.env.HOME || "/root", repoName),
      join(process.env.HOME || "/root", "work", repoName),
      process.cwd(),
    ];
    repoPath = candidates.find(p => existsSync(p));
  }

  if (!repoPath) {
    console.error(`✗ Cannot find repo for ${repoName}. Run: forge scan <repo-path> first.`);
    process.exit(1);
  }

  console.log(`  ▶ Auto-scanning: ${repoPath}`);
  try {
    execSync(`node "${join(HERE, "lib", "scanner.mjs")}" "${repoPath}"`, {
      encoding: "utf8", timeout: 60000, stdio: "inherit"
    });
  } catch (e) {
    console.error(`✗ Auto-scan failed: ${e.message}`);
    process.exit(4);
  }

  // Re-read scan.json
  if (!existsSync(SCAN_JSON)) {
    console.error("✗ Scan completed but no scan.json produced");
    process.exit(5);
  }

  return JSON.parse(readFileSync(SCAN_JSON, "utf8"));
}

// ─── Read Context (files only, never raw repo) ────────────────────
function loadIndex() {
  return readFileSync(join(CTX, "index.md"), "utf8");
}

function loadStack() {
  return readFileSync(join(CTX, "stack.md"), "utf8");
}

function loadModules(filter = null) {
  const modules = [];
  const files = readdirSync(CTX).filter(f => f.startsWith("module-") && f.endsWith(".md"));
  for (const f of files.sort()) {
    if (filter && !f.includes(filter) && !filter.some(kw => f.toLowerCase().includes(kw.toLowerCase()))) continue;
    const content = readFileSync(join(CTX, f), "utf8");
    modules.push({ file: f, content: content.slice(0, 6000) }); // token-bound per module
  }
  return modules;
}

function loadModulesByName(names) {
  // Load modules by looking for their names in the content
  const allModules = loadModules();
  return allModules.filter(m =>
    names.some(n => m.content.toLowerCase().includes(n.toLowerCase()))
  );
}

function loadModulesForFiles(filePaths) {
  // Load modules that contain the referenced files
  const allModules = loadModules();
  return allModules.filter(m =>
    filePaths.some(f => m.content.includes(f) || m.content.includes(basename(f)))
  );
}

// ─── LLM Call ─────────────────────────────────────────────────────
async function callGLM(systemPrompt, userPrompt) {
  const body = JSON.stringify({
    model: "glm-5.1",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens: 16000
  });

  const response = execSync(
    `curl -s https://api.z.ai/api/coding/paas/v4/chat/completions -H "Authorization: Bearer ${GLM_KEY}" -H "Content-Type: application/json" -d @-`,
    { input: body, timeout: 300000, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
  );

  const parsed = JSON.parse(response);
  return parsed.choices?.[0]?.message?.content || parsed.choices?.[0]?.message?.reasoning_content || "";
}

// ─── Plan Eval Gate ───────────────────────────────────────────────
function runPlanEval(planPath) {
  console.log(`\n  ▶ Plan eval gate...`);
  try {
    const result = execSync(`node "${join(HERE, "lib", "forge-eval.mjs")}" plan "${planPath}"`, {
      encoding: "utf8", timeout: 10000, stdio: "pipe"
    });
    const evalData = JSON.parse(result);
    if (evalData.passed) {
      console.log(`  ✅ Plan eval passed (${evalData.score}%)`);
    } else {
      console.error(`  ❌ Plan eval FAILED (${evalData.score}%):`);
      evalData.failures.forEach(f => console.error(`     - ${f}`));
    }
    // Write eval result
    mkdirSync(PLAN_DIR, { recursive: true });
    writeFileSync(join(PLAN_DIR, "eval.json"), JSON.stringify({ gate: "plan", ...evalData, evaluated_at: new Date().toISOString() }, null, 2));
    return evalData;
  } catch (e) {
    console.error(`  ⚠️ Plan eval error: ${e.message}`);
    return { passed: false, score: 0, failures: ["eval execution failed"] };
  }
}

// ─── Audit Mode ───────────────────────────────────────────────────
async function auditPlan(focus) {
  console.log(`\n📋 Planning audit for: ${repoName}${focus ? ` (focus: ${focus})` : ""}\n`);

  // Contract: ensure scan exists
  const scan = ensureScan();

  // Read context (files only)
  const index = loadIndex();
  const stack = loadStack();
  const modules = loadModules().slice(0, 8); // max 8 modules for context budget

  // Build context payload from context files — NOT the raw repo
  let contextPayload = `# Project: ${repoName}\n\n${index}\n\n${stack}\n\n`;
  for (const m of modules) {
    contextPayload += `\n${m.content}\n`;
  }

  const systemPrompt = `You are a senior software architect and auditor. You read REAL code and find REAL issues.

You produce two outputs:
1. A human-readable AUDIT-REPORT.md with ranked issues (P0→P3)
2. A machine-readable plan in JSON (array of batches)

Rules:
- Every issue MUST cite a specific file:line or file:function
- No theoretical problems — only issues you can see in the actual code
- Group related issues into batches (issues that touch the same files)
- Each batch should be independently fixable in ~5 minutes by a coding agent
- Order batches by: P0 first, then P1, then P2. Within same priority, order by dependency
- Max 20 issues total (prioritize the most impactful)

For each issue provide:
- ID (e.g., ATT-010, SEC-001, PERF-003)
- Severity (P0/P1/P2/P3)
- Category (security/performance/bug/code-quality/ux/architecture)
- File path (precise)
- Description (what's wrong)
- Fix approach (brief, actionable)
- Risk level (high/medium/low)`;

  const focusClause = focus ? `\n\nFocus area: ${focus}. Prioritize issues in this area.` : "";

  const userPrompt = `Audit this project for ${focus || "bugs, security vulnerabilities, performance issues, code quality problems, and architectural concerns"}.

${contextPayload}

After the analysis, output a JSON plan in a code block like:
\`\`\`json
{
  "id": "${repoName}-audit-${new Date().toISOString().slice(0, 10)}",
  "mode": "apply",
  "total_batches": N,
  "batches": [
    {
      "id": "B001",
      "title": "...",
      "severity": "P0",
      "files": ["path/to/file"],
      "acceptance_criteria": ["..."],
      "depends_on": [],
      "risk": "high"
    }
  ]
}
\`\`\`

${focusClause}`;

  console.log("  ▶ Calling GLM with context files (not raw repo)...");
  const result = await callGLM(systemPrompt, userPrompt);

  if (!result) { console.error("✗ Empty response from model"); process.exit(5); }

  mkdirSync(PLAN_DIR, { recursive: true });

  // Write the full report
  const reportPath = join(PLAN_DIR, "AUDIT-REPORT.md");
  writeFileSync(reportPath, result);
  console.log(`  ✓ Audit report: ${reportPath}`);

  // Extract JSON plan
  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
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

      // Eval gate
      const evalResult = runPlanEval(planPath);
      if (!evalResult.passed) {
        console.error(`\n⚠️  Plan eval failed. Review ${planPath} and fix before applying.`);
      }

      return planPath;
    } catch (e) {
      console.error(`  ⚠️ Could not parse JSON plan: ${e.message}`);
    }
  } else {
    console.log(`  ⚠️ No JSON plan block found. Report saved without plan.`);
  }
}

// ─── Apply Mode ───────────────────────────────────────────────────
async function applyPlan(auditReportPath) {
  console.log(`\n🔧 Planning fix batches for: ${repoName}\n`);

  // Contract: ensure scan exists
  const scan = ensureScan();

  const absReport = auditReportPath.startsWith("/") ? auditReportPath : join(process.cwd(), auditReportPath);
  if (!existsSync(absReport)) { console.error(`✗ report not found: ${absReport}`); process.exit(1); }

  // Read context files only
  const index = loadIndex();
  const report = readFileSync(absReport, "utf8");

  // Load modules relevant to the report's file references
  const mentionedFiles = report.match(/[\w/.-]+\.(php|js|vue|ts|py|jsx|tsx)/g) || [];
  const relevantModules = loadModulesForFiles(mentionedFiles);

  let contextPayload = `${index}\n\n`;
  for (const m of relevantModules.slice(0, 6)) {
    contextPayload += `\n${m.content}\n`;
  }

  const systemPrompt = `You are a senior software engineer planning bug fixes. You read the actual code and plan minimal, safe fixes.

Rules:
- Each batch fixes 1-3 related issues that touch the same files
- Each batch must be independently testable
- Order by severity (P0 first), then by dependency
- Each batch gets precise acceptance criteria
- Minimal changes only — don't refactor surrounding code
- Never add new dependencies

Output ONLY a JSON plan (no markdown report this time).`;

  const userPrompt = `Based on this audit report, create a batched fix plan:

${report.slice(0, 8000)}

RELEVANT CODE CONTEXT (from scanner files):
${contextPayload.slice(0, 8000)}

Output the plan as JSON:
\`\`\`json
{
  "id": "${repoName}-apply-${new Date().toISOString().slice(0, 10)}",
  "mode": "apply",
  "source": "${basename(absReport)}",
  "total_batches": N,
  "batches": [
    {
      "id": "B001",
      "title": "...",
      "severity": "P0",
      "files": ["path/to/file"],
      "acceptance_criteria": ["..."],
      "depends_on": [],
      "risk": "high"
    }
  ]
}
\`\`\``;

  console.log("  ▶ Creating batched fix plan from context files...");
  const result = await callGLM(systemPrompt, userPrompt);

  if (!result) { console.error("✗ Empty response"); process.exit(5); }

  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!jsonMatch) { console.error("✗ No JSON in response"); writeFileSync(join(PLAN_DIR, "raw-apply-response.md"), result); process.exit(5); }

  try {
    const plan = JSON.parse(jsonMatch[1]);
    plan.repo = repoName;
    plan.repo_path = scan.path;
    plan.created = new Date().toISOString();
    plan.source = basename(absReport);
    plan.scanner_ref = `scan.json:${scan.scanned_at}`;

    mkdirSync(PLAN_DIR, { recursive: true });
    const planPath = join(PLAN_DIR, `apply-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
    writeFileSync(planPath, JSON.stringify(plan, null, 2));
    console.log(`  ✓ Fix plan: ${planPath} (${plan.batches?.length || 0} batches)`);

    // Eval gate
    const evalResult = runPlanEval(planPath);
    if (!evalResult.passed) {
      console.error(`\n⚠️  Plan eval failed. Review ${planPath} and fix before applying.`);
    }

    return planPath;
  } catch (e) {
    console.error(`✗ Parse error: ${e.message}`);
    process.exit(5);
  }
}

// ─── Build Mode ───────────────────────────────────────────────────
async function buildPlan(specFilePath) {
  console.log(`\n🏗️  Planning build for: ${repoName}\n`);

  // Contract: ensure scan exists
  const scan = ensureScan();

  const absSpec = specFilePath.startsWith("/") ? specFilePath : join(process.cwd(), specFilePath);
  if (!existsSync(absSpec)) { console.error(`✗ spec not found: ${absSpec}`); process.exit(1); }

  const index = loadIndex();
  const stack = loadStack();
  const spec = readFileSync(absSpec, "utf8");

  const systemPrompt = `You are a senior software architect. Given a feature spec and existing codebase context, decompose the work into buildable batches.

Rules:
- Each batch adds one coherent feature/module
- Each batch must be independently testable
- Order by dependency (shared foundations first)
- Each batch gets precise acceptance criteria
- Reference existing code patterns from the project

Output ONLY a JSON plan.`;

  const userPrompt = `Given this feature spec and project context, create a build plan:

SPEC:
${spec.slice(0, 8000)}

PROJECT CONTEXT (from scanner files):
${index}

${stack.slice(0, 2000)}

Output as JSON:
\`\`\`json
{
  "id": "${repoName}-build-${new Date().toISOString().slice(0, 10)}",
  "mode": "build",
  "source": "${basename(absSpec)}",
  "total_batches": N,
  "batches": [
    {
      "id": "B001",
      "title": "...",
      "severity": "P1",
      "files": ["path/to/new/file"],
      "acceptance_criteria": ["..."],
      "depends_on": [],
      "risk": "medium"
    }
  ]
}
\`\`\``;

  console.log("  ▶ Creating build plan from context files...");
  const result = await callGLM(systemPrompt, userPrompt);

  if (!result) { console.error("✗ Empty response"); process.exit(5); }

  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!jsonMatch) { console.error("✗ No JSON in response"); process.exit(5); }

  try {
    const plan = JSON.parse(jsonMatch[1]);
    plan.repo = repoName;
    plan.repo_path = scan.path;
    plan.created = new Date().toISOString();
    plan.source = basename(absSpec);
    plan.scanner_ref = `scan.json:${scan.scanned_at}`;

    mkdirSync(PLAN_DIR, { recursive: true });
    const planPath = join(PLAN_DIR, `build-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
    writeFileSync(planPath, JSON.stringify(plan, null, 2));
    console.log(`  ✓ Build plan: ${planPath} (${plan.batches?.length || 0} batches)`);

    // Eval gate
    const evalResult = runPlanEval(planPath);
    if (!evalResult.passed) {
      console.error(`\n⚠️  Plan eval failed. Review ${planPath} and fix before applying.`);
    }

    return planPath;
  } catch (e) {
    console.error(`✗ Parse error: ${e.message}`);
    process.exit(5);
  }
}

// ─── Refactor Mode ────────────────────────────────────────────────
async function refactorPlan(scope) {
  console.log(`\n🔄 Planning refactor for: ${repoName} (${scope})\n`);

  // Contract: ensure scan exists
  const scan = ensureScan();

  const index = loadIndex();
  const modules = loadModulesByName([scope]);

  let contextPayload = `${index}\n\n`;
  for (const m of modules.slice(0, 6)) {
    contextPayload += `\n${m.content}\n`;
  }

  const systemPrompt = `You are a senior software architect planning a refactoring. You ensure changes are safe, incremental, and testable.

Rules:
- Each batch is one safe refactoring step
- Each batch must leave the codebase working
- Order by dependency (lowest-level first)
- Each batch gets precise acceptance criteria
- Never plan a big-bang rewrite

Output ONLY a JSON plan.`;

  const userPrompt = `Plan a refactoring of: ${scope}

PROJECT CONTEXT (from scanner files):
${contextPayload.slice(0, 12000)}

Output as JSON:
\`\`\`json
{
  "id": "${repoName}-refactor-${new Date().toISOString().slice(0, 10)}",
  "mode": "refactor",
  "source": "${scope}",
  "total_batches": N,
  "batches": [
    {
      "id": "B001",
      "title": "...",
      "severity": "P1",
      "files": ["path/to/file"],
      "acceptance_criteria": ["..."],
      "depends_on": [],
      "risk": "medium"
    }
  ]
}
\`\`\``;

  console.log("  ▶ Creating refactor plan from context files...");
  const result = await callGLM(systemPrompt, userPrompt);

  if (!result) { console.error("✗ Empty response"); process.exit(5); }

  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!jsonMatch) { console.error("✗ No JSON in response"); process.exit(5); }

  try {
    const plan = JSON.parse(jsonMatch[1]);
    plan.repo = repoName;
    plan.repo_path = scan.path;
    plan.created = new Date().toISOString();
    plan.source = scope;
    plan.scanner_ref = `scan.json:${scan.scanned_at}`;

    mkdirSync(PLAN_DIR, { recursive: true });
    const planPath = join(PLAN_DIR, `refactor-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
    writeFileSync(planPath, JSON.stringify(plan, null, 2));
    console.log(`  ✓ Refactor plan: ${planPath} (${plan.batches?.length || 0} batches)`);

    // Eval gate
    const evalResult = runPlanEval(planPath);
    if (!evalResult.passed) {
      console.error(`\n⚠️  Plan eval failed. Review ${planPath} and fix before applying.`);
    }

    return planPath;
  } catch (e) {
    console.error(`✗ Parse error: ${e.message}`);
    process.exit(5);
  }
}

// ─── Router ───────────────────────────────────────────────────────
switch (mode) {
  case "audit":    await auditPlan(args[0]); break;
  case "apply":    await applyPlan(args[0]); break;
  case "build":    await buildPlan(args[0]); break;
  case "refactor": await refactorPlan(args[0]); break;
  default:
    console.error("mode must be: audit | apply | build | refactor");
    process.exit(2);
}
