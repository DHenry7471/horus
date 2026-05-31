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
import { randomUUID as crypto_randomUUID } from 'crypto';
const crypto = { randomUUID: crypto_randomUUID };

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

async function generate() {
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

  // Append coverage snapshot to history for drift tracking
  if (coverage) {
    const coverageHistoryPath = path.join(REPORTS_DIR, 'coverage-history.jsonl');
    const coverageRecord = {
      id: crypto.randomUUID(),
      capturedAt: snapshot.generatedAt,
      commitSha: snapshot.commitSha,
      lines: coverage.lines,
      functions: coverage.functions,
      branches: coverage.branches,
      statements: coverage.statements,
    };
    fs.appendFileSync(coverageHistoryPath, JSON.stringify(coverageRecord) + '\n', 'utf8');

    // Compute delta vs previous snapshot and include in latest.json
    const allSnapshots = fs.readFileSync(coverageHistoryPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));

    if (allSnapshots.length >= 2) {
      const prev = allSnapshots[allSnapshots.length - 2];
      const curr = allSnapshots[allSnapshots.length - 1];
      const delta = {
        lines: Math.round((curr.lines - prev.lines) * 10) / 10,
        functions: Math.round((curr.functions - prev.functions) * 10) / 10,
        branches: Math.round((curr.branches - prev.branches) * 10) / 10,
        statements: Math.round((curr.statements - prev.statements) * 10) / 10,
      };
      snapshot.coverageDelta = delta;
      // Re-write latest.json with delta included
      fs.writeFileSync(path.join(DIST_DIR, 'latest.json'), JSON.stringify(snapshot, null, 2));
      const anyDrop = Object.values(delta).some((v) => v < 0);
      if (anyDrop) {
        console.warn(`   Coverage drift detected: ${JSON.stringify(delta)}`);
      } else {
        console.info(`   Coverage delta: ${JSON.stringify(delta)}`);
      }
    }

    // Publish last 30 snapshots for dashboard trend
    const recentSnapshots = allSnapshots.slice(-30);
    fs.writeFileSync(
      path.join(DIST_DIR, 'coverage-history.json'),
      JSON.stringify(recentSnapshots, null, 2)
    );
  }

  // Compute flakiness from TestRunStore history (reports/test-runs/*.jsonl)
  // Falls back to copying a pre-existing flakiness-report.json if no run history exists yet.
  const testRunsDir = path.join(REPORTS_DIR, 'test-runs');
  if (fs.existsSync(testRunsDir)) {
    const runFiles = fs.readdirSync(testRunsDir).filter((f) => f.endsWith('.jsonl'));
    if (runFiles.length > 0) {
      const allRecords = [];
      for (const file of runFiles) {
        const raw = fs.readFileSync(path.join(testRunsDir, file), 'utf8');
        const records = raw
          .split('\n')
          .filter((line) => line.trim().length > 0)
          .map((line) => JSON.parse(line));
        allRecords.push(...records);
      }

      // Group by testName → compute flake rate
      const byTest = new Map();
      for (const record of allRecords) {
        const group = byTest.get(record.testName) ?? [];
        group.push(record);
        byTest.set(record.testName, group);
      }

      const flakyTests = [];
      const consistentlyFailing = [];
      let healthy = 0;

      for (const [testName, records] of byTest) {
        const total = records.length;
        const passCount = records.filter((r) => r.passed).length;
        const failCount = total - passCount;
        const flakeRate = total > 0 ? failCount / total : 0;

        if (flakeRate === 1) {
          consistentlyFailing.push({ name: testName, failCount: total, total });
        } else if (flakeRate > 0) {
          flakyTests.push({ name: testName, passCount, failCount, total, flakeRate });
        } else {
          healthy++;
        }
      }

      flakyTests.sort((a, b) => b.flakeRate - a.flakeRate);

      const flakinessReport = {
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

      fs.writeFileSync(
        path.join(DIST_DIR, 'flakiness-report.json'),
        JSON.stringify(flakinessReport, null, 2)
      );
      console.info(`   Flakiness report computed: ${flakyTests.length} flaky, ${consistentlyFailing.length} always-failing, ${healthy} healthy.`);
    }
  } else {
    // Legacy fallback — copy a pre-existing static report if present
    const flakinessReportSrc = path.join(REPORTS_DIR, 'flakiness-report.json');
    if (fs.existsSync(flakinessReportSrc)) {
      fs.copyFileSync(flakinessReportSrc, path.join(DIST_DIR, 'flakiness-report.json'));
      console.info('   Flakiness report copied (legacy).');
    }
  }

  // Aggregate agent insights from JSONL files into a single insights.json
  const insightsDir = path.join(REPORTS_DIR, 'agent-insights');
  if (fs.existsSync(insightsDir)) {
    const jsonlFiles = fs.readdirSync(insightsDir).filter((f) => f.endsWith('.jsonl'));
    const allInsights = [];
    for (const file of jsonlFiles) {
      const raw = fs.readFileSync(path.join(insightsDir, file), 'utf8');
      const records = raw
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
      allInsights.push(...records);
    }
    // Sort newest-first, keep last 200
    allInsights.sort((a, b) => b.runAt.localeCompare(a.runAt));
    const trimmed = allInsights.slice(0, 200);
    fs.writeFileSync(path.join(DIST_DIR, 'insights.json'), JSON.stringify(trimmed, null, 2));
    console.info(`   Agent insights aggregated: ${trimmed.length} records from ${jsonlFiles.length} agent(s).`);
  }

  // ── Iris enrichment ──────────────────────────────────────────────────────
  // Call the Iris agent with the history JSON. It returns an HTML snippet
  // (Output A) that we inject into the dashboard just before </body>.
  // If Iris is unavailable or disabled, we fall back to the plain HTML.
  let irisSnippet = '';
  const irisEnabled =
    process.env.CLAUDE_AGENTS_MCP_URL !== undefined ||
    process.env.IRIS_ENABLED === 'true';

  if (irisEnabled) {
    try {
      // Dynamic import so the file is still usable without tsx in prod
      const { runAgent } = await import('../../agents/run-agent.js');
      const { output } = await runAgent('iris', JSON.stringify(history));
      // Iris returns an HTML snippet — extract it if wrapped in a code block
      const snippetMatch = output.match(/```html\s*([\s\S]*?)```/) ??
                           output.match(/```\s*([\s\S]*?)```/);
      irisSnippet = snippetMatch ? snippetMatch[1].trim() : output.trim();
      console.info('   Iris enrichment applied.');
    } catch (err) {
      console.warn(`   Iris enrichment skipped: ${err.message}`);
    }
  }

  // Copy and (optionally) enrich the dashboard HTML
  const dashboardSrc = path.resolve(__dirname, 'dashboard.html');
  if (fs.existsSync(dashboardSrc)) {
    let html = fs.readFileSync(dashboardSrc, 'utf8');
    if (irisSnippet) {
      html = html.replace('</body>', `${irisSnippet}\n</body>`);
    }
    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html);
  }

  console.info(`✅ Dashboard generated → ${DIST_DIR}`);
  console.info(`   Pass rate: ${passRate}% (${totalPassed}/${totalTests} tests)`);
  if (coverage) {
    console.info(`   Coverage:  Lines ${coverage.lines}% | Branches ${coverage.branches}%`);
  }
}

generate();
