#!/usr/bin/env node
// planner.mjs — Takes scanner context + request, produces a batched execution plan.
// Uses LLM with real code context to decompose work into independent batches.
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
import { join, basename } from "node:path";

const ROOT = process.env.FORGE_ROOT || resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const GLM_KEY = process.env.GLM_API_KEY;

const [mode, repoName, ...args] = process.argv.slice(2);
if (!mode || !repoName) {
  console.error("usage: node planner.mjs <audit|apply|build|refactor> <repo-name> [focus|file|scope]");
  process.exit(1);
}

const CTX = join(ROOT, "lifecycle", "context", repoName);
const PLAN_DIR = join(ROOT, "lifecycle", "plans", repoName);

if (!GLM_KEY) { console.error("✗ GLM_API_KEY required for planning"); process.exit(3); }
if (!existsSync(CTX)) { console.error(`✗ no scanner context for ${repoName}. Run scanner first.`); process.exit(1); }

// ─── Read Context ─────────────────────────────────────────────────
function loadContext() {
  const index = readFileSync(join(CTX, "index.md"), "utf8");
  const stack = readFileSync(join(CTX, "stack.md"), "utf8");
  return { index, stack };
}

function loadModules() {
  const modules = [];
  const files = readdirSync(CTX).filter(f => f.startsWith("module-") && f.endsWith(".md"));
  for (const f of files.sort()) {
    const content = readFileSync(join(CTX, f), "utf8");
    modules.push({ file: f, content: content.slice(0, 6000) }); // token-bound per module
  }
  return modules;
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

  const { execSync } = await import("node:child_process");
  const response = execSync(
    `curl -s https://api.z.ai/api/coding/paas/v4/chat/completions -H "Authorization: Bearer ${GLM_KEY}" -H "Content-Type: application/json" -d @-`,
    { input: body, timeout: 300000, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
  );

  const parsed = JSON.parse(response);
  return parsed.choices?.[0]?.message?.content || parsed.choices?.[0]?.message?.reasoning_content || "";
}

// ─── Audit Mode ───────────────────────────────────────────────────
async function auditPlan(focus) {
  console.log(`\n📋 Planning audit for: ${repoName}${focus ? ` (focus: ${focus})` : ""}\n`);

  const { index, stack } = loadContext();
  const modules = loadModules();

  // Build context payload — index + relevant modules
  let contextPayload = `# Project: ${repoName}\n\n${index}\n\n${stack}\n\n`;
  for (const m of modules.slice(0, 8)) { // max 8 modules to stay in context
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

  console.log("  ▶ Calling GLM with real code context...");
  const result = await callGLM(systemPrompt, userPrompt);

  if (!result) { console.error("✗ Empty response from model"); process.exit(5); }

  // Split into report and plan
  mkdirSync(PLAN_DIR, { recursive: true });

  // Write the full report
  const reportPath = join(PLAN_DIR, "AUDIT-REPORT.md");
  writeFileSync(reportPath, result);
  console.log(`  ✓ Audit report: ${reportPath}`);

  // Extract JSON plan from the response
  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const plan = JSON.parse(jsonMatch[1]);
      plan.repo = repoName;
      plan.created = new Date().toISOString();
      plan.source = "audit";

      const planPath = join(PLAN_DIR, `audit-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
      writeFileSync(planPath, JSON.stringify(plan, null, 2));
      console.log(`  ✓ Plan: ${planPath} (${plan.total_batches || plan.batches?.length || "?"} batches)`);
    } catch (e) {
      console.error(`  ⚠️ Could not parse JSON plan: ${e.message}`);
      console.error(`  Report is still saved — extract plan manually if needed.`);
    }
  } else {
    console.log(`  ⚠️ No JSON plan block found in response. Report saved without plan.`);
  }
}

// ─── Apply Mode ───────────────────────────────────────────────────
async function applyPlan(auditReportPath) {
  console.log(`\n🔧 Planning fix batches for: ${repoName}\n`);

  const absReport = auditReportPath.startsWith("/") ? auditReportPath : join(process.cwd(), auditReportPath);
  if (!existsSync(absReport)) { console.error(`✗ report not found: ${absReport}`); process.exit(1); }

  const { index, stack } = loadContext();
  const report = readFileSync(absReport, "utf8");

  // Load relevant modules based on files mentioned in report
  const modules = loadModules();
  const mentionedFiles = report.match(/[\w/.-]+\.(php|js|vue|ts|py|jsx|tsx)/g) || [];
  const relevantModules = modules.filter(m =>
    mentionedFiles.some(f => m.content.includes(f) || m.content.includes(basename(f)))
  );

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

RELEVANT CODE CONTEXT:
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

  console.log("  ▶ Creating batched fix plan...");
  const result = await callGLM(systemPrompt, userPrompt);

  if (!result) { console.error("✗ Empty response"); process.exit(5); }

  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!jsonMatch) { console.error("✗ No JSON in response"); writeFileSync(join(PLAN_DIR, "raw-apply-response.md"), result); process.exit(5); }

  try {
    const plan = JSON.parse(jsonMatch[1]);
    plan.repo = repoName;
    plan.created = new Date().toISOString();

    mkdirSync(PLAN_DIR, { recursive: true });
    const planPath = join(PLAN_DIR, `apply-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
    writeFileSync(planPath, JSON.stringify(plan, null, 2));
    console.log(`  ✓ Fix plan: ${planPath} (${plan.batches?.length || 0} batches)`);
  } catch (e) {
    console.error(`✗ Parse error: ${e.message}`);
    process.exit(5);
  }
}

// ─── Build Mode ───────────────────────────────────────────────────
async function buildPlan(specFilePath) {
  console.log(`\n🏗️  Planning build for: ${repoName}\n`);

  const absSpec = specFilePath.startsWith("/") ? specFilePath : join(process.cwd(), specFilePath);
  if (!existsSync(absSpec)) { console.error(`✗ spec not found: ${absSpec}`); process.exit(1); }

  const { index, stack } = loadContext();
  const spec = readFileSync(absSpec, "utf8");

  const systemPrompt = `You are a senior software architect. Given a feature spec and existing codebase context, decompose the work into buildable batches.

Rules:
- Each batch adds one coherent feature/module
- Each batch must be independently testable
- Order by dependency (shared foundations first, then modules that depend on them)
- Each batch gets precise acceptance criteria
- Reference existing code patterns from the project

Output ONLY a JSON plan.`;

  const userPrompt = `Given this feature spec and project context, create a build plan:

SPEC:
${spec.slice(0, 8000)}

PROJECT CONTEXT:
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

  console.log("  ▶ Creating build plan...");
  const result = await callGLM(systemPrompt, userPrompt);

  if (!result) { console.error("✗ Empty response"); process.exit(5); }

  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!jsonMatch) { console.error("✗ No JSON in response"); process.exit(5); }

  try {
    const plan = JSON.parse(jsonMatch[1]);
    plan.repo = repoName;
    plan.created = new Date().toISOString();

    mkdirSync(PLAN_DIR, { recursive: true });
    const planPath = join(PLAN_DIR, `build-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
    writeFileSync(planPath, JSON.stringify(plan, null, 2));
    console.log(`  ✓ Build plan: ${planPath} (${plan.batches?.length || 0} batches)`);
  } catch (e) {
    console.error(`✗ Parse error: ${e.message}`);
    process.exit(5);
  }
}

// ─── Refactor Mode ────────────────────────────────────────────────
async function refactorPlan(scope) {
  console.log(`\n🔄 Planning refactor for: ${repoName} (${scope})\n`);

  const { index, stack } = loadContext();
  const modules = loadModules();

  // Find modules relevant to the scope
  const relevantModules = modules.filter(m =>
    m.content.toLowerCase().includes(scope.toLowerCase()) ||
    m.file.toLowerCase().includes(scope.toLowerCase())
  );

  let contextPayload = `${index}\n\n`;
  for (const m of relevantModules.slice(0, 6)) {
    contextPayload += `\n${m.content}\n`;
  }

  const systemPrompt = `You are a senior software architect planning a refactoring. You ensure changes are safe, incremental, and testable at each step.

Rules:
- Each batch is one safe refactoring step
- Each batch must leave the codebase in a working state
- Order by dependency (lowest-level changes first)
- Identify files that will change and files at risk of breaking
- Each batch gets precise acceptance criteria
- Never plan a "big bang" rewrite

Output ONLY a JSON plan.`;

  const userPrompt = `Plan a refactoring of: ${scope}

PROJECT CONTEXT:
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

  console.log("  ▶ Creating refactor plan...");
  const result = await callGLM(systemPrompt, userPrompt);

  if (!result) { console.error("✗ Empty response"); process.exit(5); }

  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!jsonMatch) { console.error("✗ No JSON in response"); process.exit(5); }

  try {
    const plan = JSON.parse(jsonMatch[1]);
    plan.repo = repoName;
    plan.created = new Date().toISOString();

    mkdirSync(PLAN_DIR, { recursive: true });
    const planPath = join(PLAN_DIR, `refactor-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
    writeFileSync(planPath, JSON.stringify(plan, null, 2));
    console.log(`  ✓ Refactor plan: ${planPath} (${plan.batches?.length || 0} batches)`);
  } catch (e) {
    console.error(`✗ Parse error: ${e.message}`);
    process.exit(5);
  }
}

// ─── Router ───────────────────────────────────────────────────────
switch (mode) {
  case "audit":   await auditPlan(args[0]); break;
  case "apply":   await applyPlan(args[0]); break;
  case "build":   await buildPlan(args[0]); break;
  case "refactor": await refactorPlan(args[0]); break;
  default:
    console.error("mode must be: audit | apply | build | refactor");
    process.exit(2);
}
