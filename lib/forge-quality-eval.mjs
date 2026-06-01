#!/usr/bin/env node
// forge-quality-eval.mjs — v2 QUALITY eval (LLM judge).
//
// Unlike forge-eval.mjs (structural: "does it have the right shape?"),
// this judges ACTUAL QUALITY: are findings real? Are fixes correct? Is severity accurate?
//
// Usage:
//   node lib/forge-quality-eval.mjs audit  <context-dir> <audit-report>
//   node lib/forge-quality-eval.mjs plan   <plan.json>
//   node lib/forge-quality-eval.mjs scan   <context-dir>
//
// Cost: ~$0.01-0.03 per eval (GLM call)

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve, basename } from "node:path";

const HERE = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const GLM_KEY = process.env.GLM_API_KEY || "";

const [gate, ...args] = process.argv.slice(2);
if (!gate || args.length < 1) {
  console.error("usage: node forge-quality-eval.mjs <audit|plan|scan> <path> [...]");
  process.exit(2);
}

if (!GLM_KEY) { console.error("✗ GLM_API_KEY required for quality eval"); process.exit(3); }

async function callGLM(system, user) {
  const body = JSON.stringify({
    model: "glm-5.1",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    max_tokens: 4000,
    temperature: 0.3
  });

  const resp = execSync(
    `curl -s https://api.z.ai/api/coding/paas/v4/chat/completions -H "Authorization: Bearer ${GLM_KEY}" -H "Content-Type: application/json" -d @-`,
    { input: body, timeout: 120000, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );
  const parsed = JSON.parse(resp);
  return parsed.choices?.[0]?.message?.content || "";
}

// ─── Audit Quality ────────────────────────────────────────────────
// Judges: are the findings real? Severity accurate? Fix approaches viable?
async function evalAuditQuality() {
  const ctxDir = resolve(args[0]);
  const reportPath = resolve(args[1]);

  if (!existsSync(reportPath)) { console.error(`✗ report not found: ${reportPath}`); process.exit(1); }

  // Read index for context overview
  const indexPath = join(ctxDir, "index.md");
  const index = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";

  // Read the audit report
  const report = readFileSync(reportPath, "utf8");

  // Read 2-3 module files to spot-check against
  let sampleCode = "";
  try {
    const mods = readdirSync(ctxDir).filter(f => f.startsWith("module-") && f.endsWith(".md")).slice(0, 3);
    for (const m of mods) {
      sampleCode += readFileSync(join(ctxDir, m), "utf8").slice(0, 2000) + "\n\n";
    }
  } catch {}

  const system = `You are a senior code review judge. You evaluate the QUALITY of an automated audit report.

Score each dimension 0-10:
1. PRECISION: Are the findings real (not hallucinated)? Do they reference actual code?
2. SEVERITY: Are severity ratings (P0-P3) justified? P0 should be security/data-loss, P3 should be cosmetic.
3. FIX_VIABILITY: Are the fix approaches practical and minimal?
4. COMPLETENESS: Did it miss obvious issues visible in the code?
5. SIGNAL_NOISE: Ratio of real issues to noise (theoretical, vague, or irrelevant findings).

Also count:
- real_issues: findings that reference actual code and describe a genuine problem
- hallucinated: findings that reference code/features that don't exist
- over_severe: findings rated too high
- under_severe: findings rated too low

Output JSON only.`;

  const user = `AUDIT REPORT TO EVALUATE:
${report.slice(0, 8000)}

REPO INDEX (for cross-referencing):
${index.slice(0, 3000)}

SAMPLE CODE (for spot-checking findings):
${sampleCode.slice(0, 4000)}

Evaluate this audit report. Output JSON:
\`\`\`json
{
  "precision": N,
  "severity_accuracy": N,
  "fix_viability": N,
  "completeness": N,
  "signal_noise": N,
  "overall": N,
  "real_issues": N,
  "hallucinated": N,
  "over_severe": N,
  "under_severe": N,
  "verdict": "pass|borderline|fail",
  "notes": "brief explanation"
}
\`\`\``;

  console.log("🔍 Quality eval: audit report...");
  const result = await callGLM(system, user);

  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const scores = JSON.parse(jsonMatch[1]);
      const avg = (scores.precision + scores.severity_accuracy + scores.fix_viability + scores.completeness + scores.signal_noise) / 5;
      scores.average = Math.round(avg * 10) / 10;

      console.log(JSON.stringify(scores, null, 2));
      console.log(`\n${scores.verdict === "pass" ? "✅" : scores.verdict === "borderline" ? "⚠️" : "❌"} Audit quality: ${scores.average}/10 (${scores.verdict})`);
      console.log(`   Real: ${scores.real_issues} | Hallucinated: ${scores.hallucinated} | Over-severe: ${scores.over_severe} | Under-severe: ${scores.under_severe}`);

      return scores;
    } catch (e) {
      console.error("Parse error:", e.message);
    }
  }
  console.log("Raw response:", result.slice(0, 500));
}

// ─── Plan Quality ─────────────────────────────────────────────────
// Judges: are batches well-scoped? ACs testable? Dependencies correct?
async function evalPlanQuality() {
  const planPath = resolve(args[0]);
  if (!existsSync(planPath)) { console.error(`✗ plan not found: ${planPath}`); process.exit(1); }

  const plan = JSON.parse(readFileSync(planPath, "utf8"));

  const system = `You are a senior project manager evaluating a work plan.

Score each dimension 0-10:
1. BATCH_SCOPING: Are batches the right size? (1-3 related issues, independently fixable)
2. AC_TESTABILITY: Can each acceptance criterion be objectively verified?
3. DEP_ORDERING: Are dependency orderings correct? (no false dependencies, no missing ones)
4. FILE_ACCURACY: Do the referenced files make sense for the issues described?
5. RISK_ASSESSMENT: Are risk ratings appropriate?

Output JSON only.`;

  const user = `PLAN TO EVALUATE:
${JSON.stringify(plan, null, 2).slice(0, 10000)}

Evaluate this plan. Output JSON:
\`\`\`json
{
  "batch_scoping": N,
  "ac_testability": N,
  "dep_ordering": N,
  "file_accuracy": N,
  "risk_assessment": N,
  "overall": N,
  "verdict": "pass|borderline|fail",
  "issues": ["specific issue 1", "specific issue 2"],
  "notes": "brief explanation"
}
\`\`\``;

  console.log("🔍 Quality eval: plan...");
  const result = await callGLM(system, user);

  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const scores = JSON.parse(jsonMatch[1]);
      const avg = (scores.batch_scoping + scores.ac_testability + scores.dep_ordering + scores.file_accuracy + scores.risk_assessment) / 5;
      scores.average = Math.round(avg * 10) / 10;

      console.log(JSON.stringify(scores, null, 2));
      console.log(`\n${scores.verdict === "pass" ? "✅" : scores.verdict === "borderline" ? "⚠️" : "❌"} Plan quality: ${scores.average}/10 (${scores.verdict})`);
      if (scores.issues?.length) {
        console.log("   Issues:");
        scores.issues.forEach(i => console.log(`   - ${i}`));
      }
      return scores;
    } catch (e) {
      console.error("Parse error:", e.message);
    }
  }
  console.log("Raw response:", result.slice(0, 500));
}

// ─── Scan Quality ─────────────────────────────────────────────────
// Judges: did the scanner capture the right modules? Is the code actually useful?
async function evalScanQuality() {
  const ctxDir = resolve(args[0]);
  if (!existsSync(ctxDir)) { console.error(`✗ context dir not found: ${ctxDir}`); process.exit(1); }

  // Read index
  const index = existsSync(join(ctxDir, "index.md")) ? readFileSync(join(ctxDir, "index.md"), "utf8") : "";

  // Sample 3 modules
  let moduleSamples = "";
  const mods = readdirSync(ctxDir).filter(f => f.startsWith("module-") && f.endsWith(".md")).slice(0, 3);
  for (const m of mods) {
    const content = readFileSync(join(ctxDir, m), "utf8");
    moduleSamples += `\n## ${m} (${content.length} bytes)\n${content.slice(0, 1500)}\n`;
  }

  const system = `You are a senior developer evaluating a code scanner's output quality.

Score each dimension 0-10:
1. MODULE_COVERAGE: Did the scanner capture the important parts of the project?
2. CODE_FIDELITY: Is the captured code actually useful for an LLM? (real code, not just listings)
3. TOKEN_EFFICIENCY: Is the context well-sized? (not too much boilerplate, not too little substance)
4. INDEX_USEFULNESS: Does the index give a good overview for deciding what to look at?
5. STACK_DETECTION: Was the tech stack correctly identified?

Output JSON only.`;

  const user = `SCAN INDEX:
${index.slice(0, 3000)}

SAMPLE MODULES:
${moduleSamples.slice(0, 6000)}

Evaluate this scan output. Output JSON:
\`\`\`json
{
  "module_coverage": N,
  "code_fidelity": N,
  "token_efficiency": N,
  "index_usefulness": N,
  "stack_detection": N,
  "overall": N,
  "verdict": "pass|borderline|fail",
  "missing_modules": ["any important dirs/files missed"],
  "notes": "brief explanation"
}
\`\`\``;

  console.log("🔍 Quality eval: scan...");
  const result = await callGLM(system, user);

  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const scores = JSON.parse(jsonMatch[1]);
      const avg = (scores.module_coverage + scores.code_fidelity + scores.token_efficiency + scores.index_usefulness + scores.stack_detection) / 5;
      scores.average = Math.round(avg * 10) / 10;

      console.log(JSON.stringify(scores, null, 2));
      console.log(`\n${scores.verdict === "pass" ? "✅" : scores.verdict === "borderline" ? "⚠️" : "❌"} Scan quality: ${scores.average}/10 (${scores.verdict})`);
      if (scores.missing_modules?.length) {
        console.log("   Missing:");
        scores.missing_modules.forEach(m => console.log(`   - ${m}`));
      }
      return scores;
    } catch (e) {
      console.error("Parse error:", e.message);
    }
  }
  console.log("Raw response:", result.slice(0, 500));
}

// ─── Router ───────────────────────────────────────────────────────
switch (gate) {
  case "audit": await evalAuditQuality(); break;
  case "plan":  await evalPlanQuality(); break;
  case "scan":  await evalScanQuality(); break;
  default:
    console.error("gate must be: audit | plan | scan");
    process.exit(2);
}
