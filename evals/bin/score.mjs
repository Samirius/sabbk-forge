#!/usr/bin/env node
// score.mjs — Eval scoring engine: Tiers 1-4
// Usage: node evals/bin/score.mjs <taskId> <resultDir> [--judge|--no-judge]
//
// Tier 1: Mechanical — file existence, schema structure, format checks
// Tier 2: Output quality — AC coverage, boundary compliance, validation completeness
// Tier 3: LLM-as-judge — prompt a judge model to score spec/plan/validation quality
// Tier 4: Regression — compare against previous runs, track cost/perf over time

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

const taskId = process.argv[2];
const resultDir = process.argv[3];
const judgeFlag = process.argv[4] || "--judge";
const doJudge = judgeFlag === "--judge";

if (!taskId || !resultDir) {
  console.error("usage: score.mjs <taskId> <resultDir> [--judge|--no-judge]");
  process.exit(2);
}

// ─── Helpers ───────────────────────────────────────────────────────
const readFile = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const readFileDir = (p) => { try { return readdirSync(p); } catch { return []; } };
const sectionHeaders = (text) => {
  if (!text) return [];
  return [...text.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1].trim());
};
const hasLine = (text, pattern) => text && text.includes(pattern);
const lineCount = (text) => text ? text.split("\n").length : 0;

function assert(label, condition, details = "") {
  const status = condition ? "PASS" : "FAIL";
  const detail = details ? ` — ${details}` : "";
  console.log(`  ${status === "PASS" ? "✅" : "❌"} ${label}${detail}`);
  return { label, status, details };
}

// ─── Tier 1: Mechanical evals ──────────────────────────────────────
function tier1(dir) {
  console.log("\n─── Tier 1: Mechanical ───");
  const results = [];
  const spec = readFile(join(dir, "SPEC.md"));
  const plan = readFile(join(dir, "PLAN.md"));
  const validation = readFile(join(dir, "VALIDATION.md"));
  const task = readFile(join(dir, "TASK.md"));
  const buildFiles = readFileDir(join(dir, "build"));

  // File existence
  results.push(assert("SPEC.md exists", spec !== null));
  results.push(assert("PLAN.md exists", plan !== null));
  results.push(assert("VALIDATION.md exists", validation !== null));
  results.push(assert("build/ directory has files", buildFiles.length > 0, `${buildFiles.length} file(s)`));

  // SPEC structure
  if (spec) {
    results.push(assert("SPEC has acceptance criteria section",
      /acceptance.criteria|##.*criteria|AC-\d/i.test(spec),
      "Looks for 'acceptance criteria' or 'AC-N' patterns"));
    results.push(assert("SPEC has objective/task statement",
      /objective|task|goal/i.test(spec)));
    results.push(assert("SPEC is substantive (>20 lines)",
      lineCount(spec) > 20, `${lineCount(spec)} lines`));
  }

  // PLAN structure
  if (plan) {
    results.push(assert("PLAN has numbered steps",
      /^\d+[\.\)]\s/m.test(plan),
      "Looks for '1.' or '1)' numbering"));
    results.push(assert("PLAN references files to create",
      /\.(sh|md|js|ts|py|json)/i.test(plan)));
    results.push(assert("PLAN references acceptance criteria",
      /AC|acceptance|criterion|criteria/i.test(plan)));
    results.push(assert("PLAN is substantive (>15 lines)",
      lineCount(plan) > 15, `${lineCount(plan)} lines`));
  }

  // VALIDATION structure
  if (validation) {
    const passCount = (validation.match(/✅|PASS|pass/gi) || []).length;
    const failCount = (validation.match(/❌.*(?:FAIL|failed|failure)/gi) || []).length;
    const failVerdicts = (validation.match(/\*\*Status:\*\*.*FAIL|verdict.*FAIL|result.*FAIL/gi) || []).length;
    results.push(assert("VALIDATION has pass/fail verdicts",
      passCount > 0, `${passCount} passes, ${failCount} fails`));
    results.push(assert("VALIDATION has evidence (commands/output)",
      /```|\$\s|test\s|assert|exit|grep/i.test(validation),
      "Looks for code blocks or command output"));
    results.push(assert("VALIDATION has zero failures",
      failCount === 0, `${failCount} failure(s)`));
  }

  // Task echo check — did the agent understand the task?
  if (task && spec) {
    // Extract key noun phrases from the task (simple heuristic: words > 4 chars that aren't stopwords)
    const stopwords = new Set(["about", "which", "their", "there", "these", "those", "other", "should", "would", "could", "every", "where", "after", "before", "between"]);
    const taskWords = (task.match(/\b[a-z]{5,}\b/gi) || [])
      .filter((w) => !stopwords.has(w.toLowerCase()))
      .map((w) => w.toLowerCase());
    const uniqueTaskWords = [...new Set(taskWords)];
    const specLower = spec.toLowerCase();
    const echoed = uniqueTaskWords.filter((w) => specLower.includes(w));
    const echoRate = uniqueTaskWords.length > 0 ? echoed.length / uniqueTaskWords.length : 0;
    results.push(assert("SPEC echoes task keywords (>50% overlap)",
      echoRate > 0.5, `${Math.round(echoRate * 100)}% overlap (${echoed.length}/${uniqueTaskWords.length} keywords)`));
  }

  return results;
}

// ─── Tier 2: Output quality evals ──────────────────────────────────
function tier2(dir) {
  console.log("\n─── Tier 2: Output Quality ───");
  const results = [];
  const spec = readFile(join(dir, "SPEC.md"));
  const plan = readFile(join(dir, "PLAN.md"));
  const validation = readFile(join(dir, "VALIDATION.md"));
  const task = readFile(join(dir, "TASK.md"));
  const buildDir = join(dir, "build");

  // AC coverage: extract ACs from task, check each appears in VALIDATION
  if (task && validation) {
    const acPattern = /(?:^|\n)\s*(?:\d+[\.\)]\s*)?(?:AC-?\d+|criterion|criterion\s*\d+)[\s:]*([^\n]+)/gi;
    const taskACs = [...task.matchAll(/\d+\.\s+(?=[A-Z])/gm)].map((m) => m[0].trim());
    // Also try numbered acceptance criteria
    const numberedACs = [...task.matchAll(/acceptance_criteria:\s*\n([\s\S]*?)(?=\n\w|\n\n|$)/gi)];
    const hasExplicitACs = numberedACs.length > 0 || /\d+\.\s+\w.*$/m.test(task.match(/acceptance_criteria([\s\S]*)/)?.[1] || "");

    if (taskACs.length > 0 || hasExplicitACs) {
      const valLower = validation.toLowerCase();
      let covered = 0;
      let total = 0;
      // Extract acceptance criteria lines from task
      const criteriaSection = task.match(/acceptance_criteria[\s\S]*?(?=\n\*\*|\n[a-z_]*:|\n$)/i);
      if (criteriaSection) {
        const criteria = criteriaSection[0].match(/^\d+\.\s+.+$/gm) || [];
        total = criteria.length;
        for (const c of criteria) {
          // Check if the key phrase from this criterion appears in validation
          const keyPhrase = c.replace(/^\d+\.\s+/, "").split(/\s+/).slice(0, 4).join(" ").toLowerCase();
          if (valLower.includes(keyPhrase) || valLower.includes(`ac-${criteria.indexOf(c) + 1}`) || valLower.includes(`ac${criteria.indexOf(c) + 1}`)) {
            covered++;
          }
        }
      }
      results.push(assert("VALIDATION covers all ACs from task",
        total === 0 || covered >= total * 0.8,
        `${covered}/${total} criteria referenced`));
    } else {
      results.push(assert("VALIDATION references task requirements",
        validation.length > 100, "Validation is substantive"));
    }
  }

  // Boundary compliance: check nothing was written outside the workdir
  // (We can't check this directly from the eval results, but we can check the build artifacts)
  const buildContents = readFileDir(buildDir);
  const suspiciousPatterns = [".env", "credentials", "secret", "password", "token"];
  const suspicious = buildContents.filter((f) =>
    suspiciousPatterns.some((p) => f.toLowerCase().includes(p)));
  results.push(assert("No credential/secret files in build",
    suspicious.length === 0,
    suspicious.length > 0 ? `Found: ${suspicious.join(", ")}` : "Clean"));

  // Build artifact quality
  for (const f of buildContents) {
    const content = readFile(join(buildDir, f));
    if (content) {
      // Check for TODO/FIXME placeholders (agent didn't finish)
      const todos = (content.match(/TODO|FIXME|HACK|XXX|PLACEHOLDER/gi) || []).length;
      results.push(assert(`build/${f} has no TODO/FIXME placeholders`,
        todos === 0, todos > 0 ? `${todos} placeholder(s)` : "Clean"));

      // Check file isn't empty or trivially small
      results.push(assert(`build/${f} is substantive (>10 lines)`,
        lineCount(content) > 10, `${lineCount(content)} lines`));
    }
  }

  // Validation self-consistency: if it says PASS, the build should actually exist
  if (validation) {
    const claimsPass = /✅|PASS/i.test(validation);
    const buildExists = buildContents.length > 0;
    results.push(assert("VALIDATION claims match build existence",
      claimsPass === buildExists,
      claimsPass && !buildExists ? "Claims pass but no build" : "Consistent"));
  }

  // Plan-to-build traceability: PLAN mentions files that should exist in build
  if (plan && buildContents.length > 0) {
    const planLower = plan.toLowerCase();
    const referenced = buildContents.filter((f) => planLower.includes(f.toLowerCase()));
    results.push(assert("Build files are referenced in PLAN",
      referenced.length >= buildContents.length * 0.5,
      `${referenced.length}/${buildContents.length} build files mentioned in plan`));
  }

  return results;
}

// ─── Tier 3: LLM-as-judge ──────────────────────────────────────────
function tier3(dir) {
  console.log("\n─── Tier 3: LLM-as-Judge ───");

  if (!doJudge) {
    console.log("  ⏭️  Skipped (--no-judge flag)");
    return [];
  }

  const results = [];
  const spec = readFile(join(dir, "SPEC.md"));
  const plan = readFile(join(dir, "PLAN.md"));
  const validation = readFile(join(dir, "VALIDATION.md"));
  const task = readFile(join(dir, "TASK.md"));

  // Read rubrics
  const specRubric = readFile(join(ROOT, "evals", "rubrics", "spec-quality.md"));
  const planRubric = readFile(join(ROOT, "evals", "rubrics", "plan-quality.md"));
  const valRubric = readFile(join(ROOT, "evals", "rubrics", "validation-quality.md"));

  const GLM_KEY = process.env.GLM_API_KEY;
  if (!GLM_KEY) {
    console.log("  ⏭️  Skipped (GLM_API_KEY not set)");
    return [];
  }

  // Judge function — calls GLM via pi's custom provider config
  function judge(stage, rubric, output, taskText) {
    if (!output || !rubric) return null;

    const prompt = `You are an expert evaluator judging the quality of an AI agent's ${stage} output.

RUBRIC:
${rubric}

ORIGINAL TASK:
${taskText || "(not available)"}

AGENT OUTPUT TO EVALUATE:
${output}

Score each dimension on a 1-5 scale. Then give an overall score.
Respond in EXACTLY this format:
DIMENSION_SCORES: <comma-separated numbers>
OVERALL: <number 1-5>
STRENGTHS: <one line>
WEAKNESSES: <one line>
VERDICT: PASS or FAIL (PASS = overall >= 3)`;

    try {
      // Write prompt to temp file to avoid shell escaping issues
      const tmpFile = `/tmp/judge-prompt-${stage}-${Date.now()}.json`;
      const body = JSON.stringify({
        model: "glm-5.1",
        messages: [{ role: "user", content: prompt.substring(0, 8000) }],
        max_tokens: 2000
      });
      writeFileSync(tmpFile, body);

      const cmd = `curl -s https://api.z.ai/api/coding/paas/v4/chat/completions -H "Authorization: Bearer ${GLM_KEY}" -H "Content-Type: application/json" -d @${tmpFile}`;
      const response = execSync(cmd, { timeout: 90000, encoding: "utf8" });
      const parsed = JSON.parse(response);
      const content = parsed.choices?.[0]?.message?.content || "";
      const reasoning = parsed.choices?.[0]?.message?.reasoning_content || "";
      const text = content || reasoning; // GLM-5.1 may put output in reasoning_content
      // Debug: log what we got
      if (!text) {
        console.log(`  ⚠️ Judge ${stage}: empty response. Content: '${content.substring(0,50)}', Reasoning: '${reasoning.substring(0,50)}'`);
      }
      // Clean up temp file
      try { require("fs").unlinkSync(tmpFile); } catch {}

      // Parse scores
      const overallMatch = text.match(/OVERALL:\s*(\d+)/i);
      const verdictMatch = text.match(/VERDICT:\s*(PASS|FAIL)/i);
      const strengthsMatch = text.match(/STRENGTHS:\s*(.+)/i);
      const weaknessesMatch = text.match(/WEAKNESSES:\s*(.+)/i);

      const overall = overallMatch ? parseInt(overallMatch[1]) : 0;
      const verdict = verdictMatch ? verdictMatch[1] : (overall >= 3 ? "PASS" : "FAIL");

      return {
        overall,
        verdict,
        strengths: strengthsMatch?.[1] || "",
        weaknesses: weaknessesMatch?.[1] || "",
        raw: text.substring(0, 300)
      };
    } catch (e) {
      return { overall: 0, verdict: "ERROR", strengths: "", weaknesses: e.message, raw: "" };
    }
  }

  // Judge each stage
  const specScore = judge("SPEC", specRubric, spec, task);
  if (specScore) {
    results.push(assert(`SPEC quality: ${specScore.overall}/5`,
      specScore.verdict === "PASS",
      specScore.strengths || specScore.weaknesses));
    results.push({ label: "SPEC judge details", status: specScore.verdict === "PASS" ? "PASS" : "FAIL", details: `Score: ${specScore.overall}/5 | ${specScore.strengths} | Weakness: ${specScore.weaknesses}` });
  }

  const planScore = judge("PLAN", planRubric, plan, task);
  if (planScore) {
    results.push(assert(`PLAN quality: ${planScore.overall}/5`,
      planScore.verdict === "PASS",
      planScore.strengths || planScore.weaknesses));
    results.push({ label: "PLAN judge details", status: planScore.verdict === "PASS" ? "PASS" : "FAIL", details: `Score: ${planScore.overall}/5 | ${planScore.strengths} | Weakness: ${planScore.weaknesses}` });
  }

  const valScore = judge("VALIDATION", valRubric, validation, task);
  if (valScore) {
    results.push(assert(`VALIDATION quality: ${valScore.overall}/5`,
      valScore.verdict === "PASS",
      valScore.strengths || valScore.weaknesses));
    results.push({ label: "VALIDATION judge details", status: valScore.verdict === "PASS" ? "PASS" : "FAIL", details: `Score: ${valScore.overall}/5 | ${valScore.strengths} | Weakness: ${valScore.weaknesses}` });
  }

  return results;
}

// ─── Tier 4: Regression tracking ───────────────────────────────────
function tier4(task, dir) {
  console.log("\n─── Tier 4: Regression ───");
  const results = [];

  // Check for previous runs of this task
  const taskResultsDir = join(ROOT, "evals", "results", task);
  const previousRuns = readFileDir(taskResultsDir)
    .filter((d) => statSync(join(taskResultsDir, d)).isDirectory())
    .sort()
    .reverse(); // newest first

  const currentRun = dir.split("/").pop();

  if (previousRuns.length <= 1) {
    results.push(assert("First run — establishing baseline", true, "No previous runs to compare"));
  } else {
    // Find the previous run
    const prevRun = previousRuns.find((d) => d !== currentRun);
    if (prevRun) {
      const prevScore = readFile(join(taskResultsDir, prevRun, "score.json"));
      if (prevScore) {
        try {
          const prev = JSON.parse(prevScore);
          const prevPassRate = prev.pass / (prev.pass + prev.fail) || 0;
          console.log(`  📊 Previous run (${prevRun}): ${prev.pass}/${prev.pass + prev.fail} = ${Math.round(prevPassRate * 100)}%`);
          results.push(assert("Previous baseline found", true, `Run ${prevRun}: ${Math.round(prevPassRate * 100)}% pass rate`));
        } catch {
          results.push(assert("Previous score.json parseable", false, "Could not parse"));
        }
      }
    }
  }

  // Record model info
  const modelInfo = {
    model: "glm-5.1",
    provider: "glm",
    timestamp: new Date().toISOString(),
    task
  };
  writeFileSync(join(dir, "model-info.json"), JSON.stringify(modelInfo, null, 2));

  results.push(assert("Model info recorded", true, "glm-5.1"));
  return results;
}

// ─── Main ──────────────────────────────────────────────────────────
const allResults = [];

const t1 = tier1(resultDir);
const t2 = tier2(resultDir);
const t3 = tier3(resultDir);
const t4 = tier4(taskId, resultDir);

allResults.push(...t1, ...t2, ...t3, ...t4);

const pass = allResults.filter((r) => r.status === "PASS").length;
const fail = allResults.filter((r) => r.status === "FAIL").length;
const total = allResults.length;

console.log("\n════════════════════════════════════════");
console.log(`  TOTAL: ${pass}/${total} PASS (${fail} FAIL)`);
console.log("════════════════════════════════════════");

const score = {
  taskId,
  timestamp: new Date().toISOString(),
  model: "glm-5.1",
  total,
  pass,
  fail,
  passRate: total > 0 ? Math.round((pass / total) * 100) : 0,
  tier1: { pass: t1.filter((r) => r.status === "PASS").length, total: t1.length },
  tier2: { pass: t2.filter((r) => r.status === "PASS").length, total: t2.length },
  tier3: { pass: t3.filter((r) => r.status === "PASS").length, total: t3.length },
  tier4: { pass: t4.filter((r) => r.status === "PASS").length, total: t4.length },
  details: allResults
};

writeFileSync(join(resultDir, "score.json"), JSON.stringify(score, null, 2));
console.log(`\nScore written: ${join(resultDir, "score.json")}`);

process.exit(fail > 0 ? 1 : 0);
