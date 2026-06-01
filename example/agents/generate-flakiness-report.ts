/**
 * Standalone flakiness report generator.
 *
 * Reads TestRunStore history, computes FlakeScores via computeFlakeScores,
 * and writes reports/flakiness-report.json — allowing agents:greta to run
 * independently of a full dashboard generation.
 *
 * Usage:
 *   tsx agents/generate-flakiness-report.ts
 *
 * Environment variables:
 *   HORUS_REPORTS_DIR  — path to reports/ directory (default: ./reports)
 */

import path from 'node:path';
import fs from 'node:fs';
import { TestRunStore, computeFlakeScores } from '@wutangbanger/horus-insight-store';

const reportsDir = path.resolve(process.env.HORUS_REPORTS_DIR ?? './reports');
const store = new TestRunStore(reportsDir);
const allRecords = await store.readAll();

if (allRecords.length === 0) {
  console.warn('[flakiness] No test run records found in reports/test-runs/. Run tests first.');
  process.exit(0);
}

const scores = computeFlakeScores(allRecords, { includeHealthy: true });
const flakyTests = scores.filter((s) => s.isFlaky);
const consistentlyFailing = scores.filter((s) => s.isAlwaysFailing);
const healthy = scores.filter((s) => !s.isFlaky && !s.isAlwaysFailing).length;

const report = {
  analyzedAt: new Date().toISOString(),
  runsAnalyzed: new Set(allRecords.map((r) => r.runAt.slice(0, 10))).size,
  flakyTests,
  consistentlyFailing,
  summary: {
    flaky: flakyTests.length,
    alwaysFailing: consistentlyFailing.length,
    healthy,
  },
};

const outPath = path.join(reportsDir, 'flakiness-report.json');
fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(`[flakiness] Report written → ${outPath}`);
console.log(`            ${flakyTests.length} flaky · ${consistentlyFailing.length} always-failing · ${healthy} healthy`);
console.log(`            ${allRecords.length} records across ${report.runsAnalyzed} day(s)`);

if (flakyTests.length > 0) {
  console.log('\n  Top flaky tests:');
  for (const t of flakyTests.slice(0, 5)) {
    const pct = Math.round(t.flakeRate * 100);
    console.log(`    [${pct}%] ${t.testName}`);
  }
}
