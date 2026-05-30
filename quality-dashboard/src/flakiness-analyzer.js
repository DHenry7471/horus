#!/usr/bin/env node
/**
 * Horus Flakiness Analyzer
 *
 * Compares N runs of the test suite (from nightly-flakiness.yml) and
 * identifies tests that did not pass consistently across all runs.
 *
 * A test is "flaky" if it passed at least once but failed at least once.
 * A test that failed every run is a genuine failure, not flakiness.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(process.cwd(), 'reports');

function safeReadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    return null;
  }
  return null;
}

function extractTestResults(vitestJson) {
  if (!vitestJson?.testResults) return new Map();

  const results = new Map();
  for (const suite of vitestJson.testResults) {
    for (const test of suite.assertionResults ?? []) {
      const key = `${suite.testFilePath}::${test.fullName}`;
      results.set(key, test.status === 'passed');
    }
  }
  return results;
}

function analyze() {
  console.info('🔬 Horus Flakiness Analyzer starting...');

  const runResults = [];

  for (let i = 1; i <= 3; i++) {
    const unitPath = path.join(REPORTS_DIR, `flakiness-run-${i}`, `unit-run-${i}.json`);
    const integPath = path.join(REPORTS_DIR, `flakiness-run-${i}`, `integration-run-${i}.json`);

    const unitResults = extractTestResults(safeReadJson(unitPath));
    const integResults = extractTestResults(safeReadJson(integPath));

    const combined = new Map([...unitResults, ...integResults]);
    runResults.push(combined);
  }

  if (runResults.length === 0) {
    console.warn('No run results found. Skipping analysis.');
    return;
  }

  // Find all test names across all runs
  const allTests = new Set();
  for (const run of runResults) {
    for (const key of run.keys()) allTests.add(key);
  }

  const flakyTests = [];
  const consistentlyFailing = [];

  for (const testName of allTests) {
    const statuses = runResults.map((run) => run.get(testName));
    const definedStatuses = statuses.filter((s) => s !== undefined);

    if (definedStatuses.length < 2) continue; // Can't determine flakiness from one run

    const passCount = definedStatuses.filter(Boolean).length;
    const failCount = definedStatuses.filter((s) => !s).length;

    if (passCount > 0 && failCount > 0) {
      flakyTests.push({ name: testName, passCount, failCount, total: definedStatuses.length });
    } else if (failCount === definedStatuses.length) {
      consistentlyFailing.push({ name: testName, failCount });
    }
  }

  const report = {
    analyzedAt: new Date().toISOString(),
    runsAnalyzed: runResults.length,
    flakyTests,
    consistentlyFailing,
    summary: {
      flaky: flakyTests.length,
      alwaysFailing: consistentlyFailing.length,
      healthy: allTests.size - flakyTests.length - consistentlyFailing.length,
    },
  };

  const reportPath = path.join(REPORTS_DIR, 'flakiness-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.info(`✅ Flakiness analysis complete`);
  console.info(`   Flaky: ${report.summary.flaky}`);
  console.info(`   Always failing: ${report.summary.alwaysFailing}`);
  console.info(`   Healthy: ${report.summary.healthy}`);

  if (flakyTests.length > 0) {
    console.warn('\n⚠️  Flaky tests detected:');
    for (const t of flakyTests) {
      console.warn(`   ${t.name} (${t.passCount}/${t.total} passes)`);
    }
  }
}

analyze();
