import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import {
  TestRunStore,
  CoverageStore,
  computeFlakeScores,
  AgentInsightStore,
} from '@wutangbanger/horus-insight-store';
import type { FlakeScore, TestRunRecord } from '@wutangbanger/horus-contracts';
import { parseVitestResults, parsePlaywrightResults, parseCoverage } from './parsers.js';
import type {
  HorusDashboardConfig,
  LayerConfig,
  LayerResult,
  DashboardSnapshot,
} from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Default layer pyramid ─────────────────────────────────────────────────

const DEFAULT_LAYERS: LayerConfig[] = [
  { name: 'unit',        resultsFile: 'unit-results.json',        format: 'vitest' },
  { name: 'integration', resultsFile: 'integration-results.json', format: 'vitest' },
  { name: 'e2e',         resultsFile: 'e2e-results.json',         format: 'playwright' },
];

// ── Helpers ───────────────────────────────────────────────────────────────

function safeReadJson(filePath: string): unknown {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    console.warn(`Could not read: ${filePath}`);
  }
  return null;
}

function parseLayer(raw: unknown, format: LayerConfig['format']): LayerResult {
  return format === 'playwright'
    ? parsePlaywrightResults(raw)
    : parseVitestResults(raw);
}

// ── Public API ────────────────────────────────────────────────────────────

export async function generate(config: HorusDashboardConfig): Promise<void> {
  const {
    reportsDir,
    outputDir,
    layers = DEFAULT_LAYERS,
    templatePath,
    maxHistoryRuns = 30,
  } = config;

  console.info('🔭 Horus Dashboard Generator starting...');
  fs.mkdirSync(outputDir, { recursive: true });

  // ── Parse each layer ───────────────────────────────────────────────────
  const layerResults: Record<string, LayerResult> = {};
  for (const layer of layers) {
    const raw = safeReadJson(path.join(reportsDir, layer.resultsFile));
    layerResults[layer.name] = parseLayer(raw, layer.format);
  }

  // Write per-layer test detail files (before stripping from snapshot)
  for (const [name, result] of Object.entries(layerResults)) {
    if (result.tests?.length) {
      fs.writeFileSync(
        path.join(outputDir, `${name}-tests.json`),
        JSON.stringify(result.tests, null, 2),
      );
    }
  }

  // Strip tests from snapshot layers — latest.json stays lean
  const snapshotLayers: Record<string, LayerResult> = Object.fromEntries(
    Object.entries(layerResults).map(([k, { tests: _t, ...rest }]) => [k, rest]),
  );

  const totalTests = Object.values(layerResults).reduce((s, l) => s + l.total, 0);
  const totalPassed = Object.values(layerResults).reduce((s, l) => s + l.passed, 0);
  const passRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

  // ── Coverage ───────────────────────────────────────────────────────────
  const coverageRaw = safeReadJson(path.join(reportsDir, 'coverage', 'coverage-summary.json'));
  const coverage = parseCoverage(coverageRaw);

  // ── Build snapshot ─────────────────────────────────────────────────────
  const snapshot: DashboardSnapshot = {
    generatedAt: new Date().toISOString(),
    commitSha: process.env['GITHUB_SHA'] ?? 'local',
    runNumber: parseInt(process.env['GITHUB_RUN_NUMBER'] ?? '0', 10),
    repository: process.env['GITHUB_REPOSITORY'] ?? 'local',
    passRate,
    totalTests,
    layers: snapshotLayers,
    coverage,
  };

  // ── Update run history ─────────────────────────────────────────────────
  const historyFile = path.join(outputDir, 'history.json');
  const history: { runs: DashboardSnapshot[] } =
    (safeReadJson(historyFile) as { runs: DashboardSnapshot[] } | null) ?? { runs: [] };

  history.runs.push(snapshot);
  if (history.runs.length > maxHistoryRuns) {
    history.runs = history.runs.slice(-maxHistoryRuns);
  }

  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
  fs.writeFileSync(path.join(outputDir, 'latest.json'), JSON.stringify(snapshot, null, 2));

  // ── Coverage drift via CoverageStore ─────────────────────────────────
  if (coverage) {
    const coverageStore = new CoverageStore(reportsDir);
    await coverageStore.append({
      id: randomUUID(),
      capturedAt: snapshot.generatedAt,
      commitSha: snapshot.commitSha,
      ...coverage,
    });

    const delta = await coverageStore.latestDelta();
    if (delta) {
      snapshot.coverageDelta = delta as unknown as Record<string, number | boolean>;
      fs.writeFileSync(path.join(outputDir, 'latest.json'), JSON.stringify(snapshot, null, 2));

      const hasDrift = Object.values(delta).some((v) => typeof v === 'number' && v < 0);
      if (delta.belowThreshold || hasDrift) {
        console.warn(`   Coverage drift detected: ${JSON.stringify(delta)}`);
      } else {
        console.info(`   Coverage delta: ${JSON.stringify(delta)}`);
      }
    }

    const allSnapshots = await coverageStore.readAll();
    fs.writeFileSync(
      path.join(outputDir, 'coverage-history.json'),
      JSON.stringify(allSnapshots.slice(-maxHistoryRuns), null, 2),
    );
  }

  // ── Flakiness report via TestRunStore ─────────────────────────────────
  const testRunStore = new TestRunStore(reportsDir);
  const allRecords = await testRunStore.readAll();

  if (allRecords.length > 0) {
    const scores = computeFlakeScores(allRecords, { includeHealthy: true });
    const flakyTests = scores.filter((s: FlakeScore) => s.isFlaky);
    const consistentlyFailing = scores.filter((s: FlakeScore) => s.isAlwaysFailing);
    const healthy = scores.filter((s: FlakeScore) => !s.isFlaky && !s.isAlwaysFailing).length;

    const flakinessReport = {
      analyzedAt: new Date().toISOString(),
      runsAnalyzed: new Set(allRecords.map((r: TestRunRecord) => r.runAt.slice(0, 10))).size,
      flakyTests,
      consistentlyFailing,
      summary: { flaky: flakyTests.length, alwaysFailing: consistentlyFailing.length, healthy },
    };

    const flakinessJson = JSON.stringify(flakinessReport, null, 2);
    fs.writeFileSync(path.join(outputDir, 'flakiness-report.json'), flakinessJson);
    // Mirror to reportsDir so agents (greta etc.) can pick it up directly
    fs.writeFileSync(path.join(reportsDir, 'flakiness-report.json'), flakinessJson);
    console.info(
      `   Flakiness: ${flakyTests.length} flaky, ${consistentlyFailing.length} always-failing, ${healthy} healthy.`,
    );
  } else {
    // Legacy fallback — copy a pre-existing static report if present
    const legacySrc = path.join(reportsDir, 'flakiness-report.json');
    if (fs.existsSync(legacySrc)) {
      fs.copyFileSync(legacySrc, path.join(outputDir, 'flakiness-report.json'));
      console.info('   Flakiness report copied (legacy fallback).');
    }
  }

  // ── Agent insights via AgentInsightStore ─────────────────────────────
  const insightStore = new AgentInsightStore(reportsDir);
  const allInsights = await insightStore.readAll();
  if (allInsights.length > 0) {
    const trimmed = allInsights.reverse().slice(0, 200);
    fs.writeFileSync(path.join(outputDir, 'insights.json'), JSON.stringify(trimmed, null, 2));
    console.info(`   Agent insights: ${trimmed.length} records.`);
  }

  // ── Iris enrichment (optional) ────────────────────────────────────────
  let irisSnippet = '';
  const irisEnabled =
    process.env['CLAUDE_AGENTS_MCP_URL'] !== undefined ||
    process.env['IRIS_ENABLED'] === 'true';

  if (irisEnabled) {
    try {
      const { runAgent } = await import('@wutangbanger/horus-insight-store');
      const { output } = await runAgent('iris', JSON.stringify(history));
      const match =
        output.match(/```html\s*([\s\S]*?)```/) ?? output.match(/```\s*([\s\S]*?)```/);
      irisSnippet = match ? match[1].trim() : output.trim();
      console.info('   Iris enrichment applied.');
    } catch (err) {
      console.warn(`   Iris enrichment skipped: ${(err as Error).message}`);
    }
  }

  // ── Write dashboard HTML ──────────────────────────────────────────────
  const resolvedTemplate =
    templatePath ?? path.resolve(__dirname, 'dashboard.html');

  if (fs.existsSync(resolvedTemplate)) {
    let html = fs.readFileSync(resolvedTemplate, 'utf8');
    if (irisSnippet) {
      html = html.replace('</body>', `${irisSnippet}\n</body>`);
    }
    fs.writeFileSync(path.join(outputDir, 'index.html'), html);
  } else {
    console.warn(`   Template not found at ${resolvedTemplate} — skipping HTML output.`);
  }

  console.info(`✅ Dashboard generated → ${outputDir}`);
  console.info(`   Pass rate: ${passRate}% (${totalPassed}/${totalTests})`);
  if (coverage) {
    console.info(`   Coverage: Lines ${coverage.lines}% | Branches ${coverage.branches}%`);
  }
}
