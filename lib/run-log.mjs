#!/usr/bin/env node
/**
 * run-log.mjs — JSONL logger for forge pipeline stages
 * Appends one record per stage to runs/<YYYY-MM-DD>.jsonl
 *
 * Usage:
 *   node lib/run-log.mjs --pipeline <name> --agent <name> --stage <name> --start
 *   node lib/run-log.mjs --pipeline <name> --agent <name> --stage <name> --end <exit_status>
 *
 * Record format:
 *   { ts, pipeline, agent, stage, exit, duration_ms, cost_usd? }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { pipeline: null, agent: null, stage: null, action: null, exit: null };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pipeline': result.pipeline = args[++i]; break;
      case '--agent': result.agent = args[++i]; break;
      case '--stage': result.stage = args[++i]; break;
      case '--start': result.action = 'start'; break;
      case '--end': result.action = 'end'; result.exit = parseInt(args[++i], 10); break;
    }
  }

  if (!result.pipeline || !result.agent || !result.stage || !result.action) {
    console.error('Usage: node run-log.mjs --pipeline <name> --agent <name> --stage <name> --start|--end <exit>');
    process.exit(1);
  }

  return result;
}

function getTimestamp() {
  return new Date().toISOString();
}

function getDate() {
  return new Date().toISOString().split('T')[0];
}

function getStateFilePath(pipeline, agent, stage) {
  const runsDir = path.join(ROOT, 'runs');
  return path.join(runsDir, `.${pipeline}.${agent}.${stage}.state`);
}

function writeStart(pipeline, agent, stage) {
  const runsDir = path.join(ROOT, 'runs');
  if (!fs.existsSync(runsDir)) {
    fs.mkdirSync(runsDir, { recursive: true });
  }

  const startTs = getTimestamp();
  const stateFile = getStateFilePath(pipeline, agent, stage);
  fs.writeFileSync(stateFile, startTs);
}

function readStart(pipeline, agent, stage) {
  const stateFile = getStateFilePath(pipeline, agent, stage);
  if (!fs.existsSync(stateFile)) {
    return null;
  }
  const startTs = fs.readFileSync(stateFile, 'utf8').trim();
  fs.unlinkSync(stateFile);
  return startTs;
}

function calculateDurationMs(startTs, endTs) {
  const start = new Date(startTs).getTime();
  const end = new Date(endTs).getTime();
  return end - start;
}

function findUsageFile() {
  // Look for usage file with --mode json
  const possiblePaths = [
    path.join(ROOT, '.pi', 'usage.json'),
    path.join(ROOT, 'usage.json'),
    path.join(ROOT, 'spike', 'usage.json'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        const data = JSON.parse(content);
        return data.cost_usd || null;
      } catch (e) {
        // Not valid JSON or no cost field
      }
    }
  }
  return null;
}

function appendRecord(record) {
  const runsDir = path.join(ROOT, 'runs');
  if (!fs.existsSync(runsDir)) {
    fs.mkdirSync(runsDir, { recursive: true });
  }

  const date = getDate();
  const logFile = path.join(runsDir, `${date}.jsonl`);
  const jsonLine = JSON.stringify(record) + '\n';

  fs.appendFileSync(logFile, jsonLine);
}

function main() {
  const args = parseArgs();

  if (args.action === 'start') {
    writeStart(args.pipeline, args.agent, args.stage);
  } else if (args.action === 'end') {
    const startTs = readStart(args.pipeline, args.agent, args.stage);
    if (!startTs) {
      console.error(`No start state found for ${args.pipeline}/${args.agent}/${args.stage}`);
      process.exit(1);
    }

    const endTs = getTimestamp();
    const durationMs = calculateDurationMs(startTs, endTs);
    const costUsd = findUsageFile();

    const record = {
      ts: endTs,
      pipeline: args.pipeline,
      agent: args.agent,
      stage: args.stage,
      exit: args.exit,
      duration_ms: durationMs,
    };

    if (costUsd !== null) {
      record.cost_usd = costUsd;
    }

    appendRecord(record);
  }
}

main();