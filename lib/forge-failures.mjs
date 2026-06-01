#!/usr/bin/env node
// forge-failures.mjs — Analyze failure patterns from runs/*.jsonl
// Usage: node lib/forge-failures.mjs [--days N] [--suggest]
//
// Reads all run logs, classifies failures, identifies patterns, and suggests fixes.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const ROOT = resolve(HERE, "..");
const RUNS_DIR = join(ROOT, "runs");

import { resolve } from "node:path";

const args = process.argv.slice(2);
const daysArg = args.indexOf("--days");
const days = daysArg >= 0 ? parseInt(args[daysArg + 1]) || 30 : 30;
const suggest = args.includes("--suggest");
const verbose = args.includes("--verbose");

// ─── Load logs ─────────────────────────────────────────────────────
function loadLogs(days) {
  if (!existsSync(RUNS_DIR)) return [];

  const files = readdirSync(RUNS_DIR)
    .filter(f => f.endsWith(".jsonl"))
    .sort()
    .reverse();  // Most recent first

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const entries = [];
  for (const file of files) {
    const date = file.replace(".jsonl", "");
    const fileDate = new Date(date);
    if (fileDate < cutoff) continue;

    const content = readFileSync(join(RUNS_DIR, file), "utf8");
    for (const line of content.split("\n").filter(Boolean)) {
      try { entries.push(JSON.parse(line)); }
      catch { /* skip malformed */ }
    }
  }
  return entries;
}

// ─── Analysis ──────────────────────────────────────────────────────
function analyze(entries) {
  const failures = entries.filter(e => e.error || e.error_type || (e.exit && e.exit !== 0));
  const retries = entries.filter(e => e.succeeded_after_retries);

  // Group by error type
  const byType = {};
  for (const f of failures) {
    const type = f.error_type || "unknown";
    if (!byType[type]) byType[type] = { count: 0, examples: [], stages: new Set(), batches: new Set() };
    byType[type].count++;
    byType[type].stages.add(f.stage || "?");
    byType[type].batches.add(f.batch || "?");
    if (byType[type].examples.length < 3) byType[type].examples.push(f);
  }

  // Group by stage
  const byStage = {};
  for (const f of failures) {
    const stage = f.stage || "?";
    if (!byStage[stage]) byStage[stage] = { count: 0, types: new Set() };
    byStage[stage].count++;
    byStage[stage].types.add(f.error_type || "unknown");
  }

  // Time pattern: failures per day
  const byDay = {};
  for (const f of failures) {
    const day = (f.ts || "").split("T")[0];
    if (!byDay[day]) byDay[day] = 0;
    byDay[day]++;
  }

  // Timeout distribution
  const timeouts = failures
    .filter(f => f.error_type === "spawn_timeout")
    .map(f => ({ stage: f.stage, timeout: f.timeout_used, batch: f.batch }));

  return { failures, retries, byType, byStage, byDay, timeouts };
}

// ─── Suggestions ───────────────────────────────────────────────────
function getSuggestions(analysis) {
  const suggestions = [];

  for (const [type, data] of Object.entries(analysis.byType)) {
    switch (type) {
      case "spawn_timeout":
        suggestions.push({
          priority: "P1",
          issue: `${data.count} stage timeout(s) detected`,
          affected: `stages: ${[...data.stages].join(", ")}, batches: ${[...data.batches].join(", ")}`,
          fix: "Timeouts too aggressive for current API latency. Increase base timeouts or reduce prompt complexity.",
          auto_fix: "Already fixed: progressive timeouts (1.5× per retry) with retry logic added to executor.mjs"
        });
        break;
      case "rate_limited":
        suggestions.push({
          priority: "P1",
          issue: `${data.count} rate limit hit(s)`,
          affected: `stages: ${[...data.stages].join(", ")}`,
          fix: "Add delay between batches, or use a different model/account for load balancing.",
          auto_fix: "Retry with exponential backoff handles transient rate limits. If persistent, reduce concurrency."
        });
        break;
      case "oom":
        suggestions.push({
          priority: "P0",
          issue: `${data.count} OOM error(s) detected`,
          affected: `stages: ${[...data.stages].join(", ")}`,
          fix: "Reduce input context size, use --max-old-space-size, or split large modules.",
          auto_fix: "Scanner already uses child process isolation. Check if modules are too large."
        });
        break;
      case "connection_refused":
        suggestions.push({
          priority: "P0",
          issue: `${data.count} connection refused error(s)`,
          affected: `stages: ${[...data.stages].join(", ")}`,
          fix: "Check if the API endpoint is up. Check network/proxy settings.",
          auto_fix: "Retry with backoff handles transient connection issues."
        });
        break;
      case "dns_failure":
        suggestions.push({
          priority: "P0",
          issue: `${data.count} DNS failure(s)`,
          affected: `stages: ${[...data.stages].join(", ")}`,
          fix: "Check DNS resolution. Consider adding fallback DNS or /etc/hosts entry.",
          auto_fix: "Retry handles transient DNS blips."
        });
        break;
    }
  }

  // Check for repeated failures on same batch
  const batchFailCounts = {};
  for (const f of analysis.failures) {
    if (f.batch) {
      batchFailCounts[f.batch] = (batchFailCounts[f.batch] || 0) + 1;
    }
  }
  for (const [batch, count] of Object.entries(batchFailCounts)) {
    if (count >= 2) {
      suggestions.push({
        priority: "P2",
        issue: `Batch ${batch} failed ${count} times — may need manual review`,
        affected: `batch: ${batch}`,
        fix: "Check if the task is too complex for the model, or if there's a systematic issue.",
        auto_fix: "Retry logic handles transient failures. Persistent failures indicate a deeper issue."
      });
    }
  }

  return suggestions.sort((a, b) => a.priority.localeCompare(b.priority));
}

// ─── Output ────────────────────────────────────────────────────────
function printReport(analysis, suggest) {
  const { failures, retries, byType, byStage, byDay, timeouts } = analysis;

  console.log("\n📊 Forge Failure Analysis");
  console.log(`   Period: last ${days} days`);
  console.log(`   Total entries: ${failures.length + retries.length} (${failures.length} failures, ${retries.length} retry recoveries)`);
  console.log();

  if (failures.length === 0 && retries.length === 0) {
    console.log("  ✅ No failures recorded in the analysis period.");
    return;
  }

  // Error types
  if (Object.keys(byType).length > 0) {
    console.log("## Failure Types");
    for (const [type, data] of Object.entries(byType)) {
      console.log(`  ${type}: ${data.count} occurrences`);
      console.log(`    stages: ${[...data.stages].join(", ")}`);
      console.log(`    batches: ${[...data.batches].join(", ")}`);
    }
    console.log();
  }

  // Stage breakdown
  if (Object.keys(byStage).length > 0) {
    console.log("## Failures by Stage");
    for (const [stage, data] of Object.entries(byStage)) {
      console.log(`  ${stage}: ${data.count} failures (${[...data.types].join(", ")})`);
    }
    console.log();
  }

  // Timeout details
  if (timeouts.length > 0) {
    console.log("## Timeout Details");
    for (const t of timeouts) {
      console.log(`  ${t.stage} (${t.batch}): ${t.timeout}s timeout`);
    }
    console.log();
  }

  // Retry recoveries
  if (retries.length > 0) {
    console.log("## Retry Recoveries (self-healed)");
    for (const r of retries) {
      console.log(`  ✅ ${r.stage} (${r.batch}): succeeded on attempt ${r.attempt}`);
    }
    console.log();
  }

  // Daily trend
  if (Object.keys(byDay).length > 0) {
    console.log("## Daily Failure Trend");
    for (const [day, count] of Object.entries(byDay).sort()) {
      const bar = "█".repeat(Math.min(count, 40));
      console.log(`  ${day}: ${bar} ${count}`);
    }
    console.log();
  }

  // Suggestions
  if (suggest) {
    const suggestions = getSuggestions(analysis);
    if (suggestions.length > 0) {
      console.log("## 🔧 Suggested Fixes");
      for (const s of suggestions) {
        console.log(`  [${s.priority}] ${s.issue}`);
        console.log(`    Affected: ${s.affected}`);
        console.log(`    Fix: ${s.fix}`);
        if (s.auto_fix) console.log(`    Auto-fix: ${s.auto_fix}`);
        console.log();
      }
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────
const entries = loadLogs(days);
const analysis = analyze(entries);
printReport(analysis, suggest);
