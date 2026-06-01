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
import { TestRunStore, CoverageStore, computeFlakeScores, AgentInsightStore } from '../../../shared/insight-store/src/index.js';
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
    const coverageStore = new CoverageStore(REPORTS_DIR);
    await coverageStore.append({
      id: crypto.randomUUID(),
      capturedAt: snapshot.generatedAt,
      commitSha: snapshot.commitSha,
      ...coverage,
    });

    const delta = await coverageStore.latestDelta();
    if (delta) {
      snapshot.coverageDelta = delta;
      fs.writeFileSync(path.join(DIST_DIR, 'latest.json'), JSON.stringify(snapshot, null, 2));
      if (delta.belowThreshold || Object.values(delta).some((v) => typeof v === 'number' && v < 0)) {
        console.warn(`   Coverage drift detected: ${JSON.stringify(delta)}`);
      } else {
        console.info(`   Coverage delta: ${JSON.stringify(delta)}`);
      }
    }

    // Publish last 30 snapshots for dashboard trend
    const allSnapshots = await coverageStore.readAll();
    fs.writeFileSync(
      path.join(DIST_DIR, 'coverage-history.json'),
      JSON.stringify(allSnapshots.slice(-30), null, 2)
    );
  }

  // Compute flakiness from TestRunStore history (reports/test-runs/*.jsonl)
  // Falls back to copying a pre-existing flakiness-report.json if no run history exists yet.
  const testRunStore = new TestRunStore(REPORTS_DIR);
  const allRecords = await testRunStore.readAll();
  if (allRecords.length > 0) {
    const scores = computeFlakeScores(allRecords, { includeHealthy: true });
    const flakyTests = scores.filter((s) => s.isFlaky);
    const consistentlyFailing = scores.filter((s) => s.isAlwaysFailing);
    const healthy = scores.filter((s) => !s.isFlaky && !s.isAlwaysFailing).length;

    const flakinessReport = {
      analyzedAt: new Date().toISOString(),
      runsAnalyzed: new Set(allRecords.map((r) => r.runAt.slice(0, 10))).size,
      flakyTests,
      consistentlyFailing,
      summary: { flaky: flakyTests.length, alwaysFailing: consistentlyFailing.length, healthy },
    };

    fs.writeFileSync(
      path.join(DIST_DIR, 'flakiness-report.json'),
      JSON.stringify(flakinessReport, null, 2)
    );
    // Also write to reports/ so agents:greta can pick it up without a full dashboard generation
    fs.writeFileSync(
      path.join(REPORTS_DIR, 'flakiness-report.json'),
      JSON.stringify(flakinessReport, null, 2)
    );
    console.info(`   Flakiness report computed: ${flakyTests.length} flaky, ${consistentlyFailing.length} always-failing, ${healthy} healthy.`);
  } else {
    // Legacy fallback — copy a pre-existing static report if present
    const flakinessReportSrc = path.join(REPORTS_DIR, 'flakiness-report.json');
    if (fs.existsSync(flakinessReportSrc)) {
      fs.copyFileSync(flakinessReportSrc, path.join(DIST_DIR, 'flakiness-report.json'));
      console.info('   Flakiness report copied (legacy).');
    }
  }

  // Aggregate agent insights via AgentInsightStore → insights.json
  const insightStore = new AgentInsightStore(REPORTS_DIR);
  const allInsights = await insightStore.readAll();
  if (allInsights.length > 0) {
    // Sort newest-first, keep last 200
    const trimmed = allInsights.reverse().slice(0, 200);
    fs.writeFileSync(path.join(DIST_DIR, 'insights.json'), JSON.stringify(trimmed, null, 2));
    console.info(`   Agent insights aggregated: ${trimmed.length} records.`);
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
