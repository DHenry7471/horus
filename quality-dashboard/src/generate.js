#!/usr/bin/env node
/**
 * Horus Quality Dashboard Generator
 *
 * Aggregates test results from all layers (unit, integration, E2E),
 * computes quality metrics, and produces the static dashboard site.
 *
 * Run: node quality-dashboard/src/generate.js
 * Output: quality-dashboard/dist/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(process.cwd(), 'reports');
const DIST_DIR = path.resolve(__dirname, '../dist');
const HISTORY_FILE = path.join(DIST_DIR, 'history.json');

// ── Helpers ────────────────────────────────────────────────────────────────

function safeReadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    console.warn(`Could not read: ${filePath}`);
  }
  return null;
}

function parseVitestResults(raw) {
  if (!raw) return { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 };
  return {
    total: raw.numTotalTests ?? 0,
    passed: raw.numPassedTests ?? 0,
    failed: raw.numFailedTests ?? 0,
    skipped: raw.numPendingTests ?? 0,
    duration: raw.startTime ? Date.now() - raw.startTime : 0,
  };
}

function parsePlaywrightResults(raw) {
  if (!raw) return { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 };
  const suites = raw.suites ?? [];
  let total = 0, passed = 0, failed = 0, skipped = 0;

  function walk(suite) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        total++;
        const status = test.results?.[0]?.status;
        if (status === 'passed') passed++;
        else if (status === 'failed') failed++;
        else skipped++;
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  }

  for (const suite of suites) walk(suite);
  return { total, passed, failed, skipped, duration: raw.stats?.duration ?? 0 };
}

function parseCoverage(raw) {
  if (!raw?.total) return null;
  return {
    lines: raw.total.lines?.pct ?? 0,
    functions: raw.total.functions?.pct ?? 0,
    branches: raw.total.branches?.pct ?? 0,
    statements: raw.total.statements?.pct ?? 0,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

function generate() {
  console.info('🔭 Horus Dashboard Generator starting...');

  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Load raw results
  const unitRaw = safeReadJson(path.join(REPORTS_DIR, 'unit-results.json'));
  const integrationRaw = safeReadJson(path.join(REPORTS_DIR, 'integration-results.json'));
  const e2eRaw = safeReadJson(path.join(REPORTS_DIR, 'e2e-results.json'));
  const coverageRaw = safeReadJson(path.join(REPORTS_DIR, 'coverage', 'coverage-summary.json'));

  // Parse into normalized shape
  const unit = parseVitestResults(unitRaw);
  const integration = parseVitestResults(integrationRaw);
  const e2e = parsePlaywrightResults(e2eRaw);
  const coverage = parseCoverage(coverageRaw);

  const totalTests = unit.total + integration.total + e2e.total;
  const totalPassed = unit.passed + integration.passed + e2e.passed;
  const passRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

  // Build snapshot
  const snapshot = {
    generatedAt: new Date().toISOString(),
    commitSha: process.env.GITHUB_SHA ?? 'local',
    runNumber: parseInt(process.env.GITHUB_RUN_NUMBER ?? '0', 10),
    repository: process.env.GITHUB_REPOSITORY ?? 'local/horus',
    passRate,
    totalTests,
    layers: { unit, integration, e2e },
    coverage,
  };

  // Load and update history
  let history = safeReadJson(HISTORY_FILE) ?? { runs: [] };
  history.runs.push(snapshot);
  // Keep last 30 runs
  if (history.runs.length > 30) {
    history.runs = history.runs.slice(-30);
  }

  // Write data files
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  fs.writeFileSync(
    path.join(DIST_DIR, 'latest.json'),
    JSON.stringify(snapshot, null, 2)
  );

  // Copy the dashboard HTML
  const dashboardSrc = path.resolve(__dirname, 'dashboard.html');
  if (fs.existsSync(dashboardSrc)) {
    fs.copyFileSync(dashboardSrc, path.join(DIST_DIR, 'index.html'));
  }

  console.info(`✅ Dashboard generated → ${DIST_DIR}`);
  console.info(`   Pass rate: ${passRate}% (${totalPassed}/${totalTests} tests)`);
  if (coverage) {
    console.info(`   Coverage:  Lines ${coverage.lines}% | Branches ${coverage.branches}%`);
  }
}

generate();
