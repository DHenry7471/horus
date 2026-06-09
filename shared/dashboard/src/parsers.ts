import type { LayerResult, CoverageResult } from './types.js';

// ── Vitest JSON reporter output ───────────────────────────────────────────

interface VitestRaw {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  startTime?: number;
}

export function parseVitestResults(raw: unknown): LayerResult {
  if (!raw) return { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 };
  const r = raw as VitestRaw;
  return {
    total: r.numTotalTests ?? 0,
    passed: r.numPassedTests ?? 0,
    failed: r.numFailedTests ?? 0,
    skipped: r.numPendingTests ?? 0,
    duration: r.startTime ? Date.now() - r.startTime : 0,
  };
}

// ── Playwright JSON reporter output ──────────────────────────────────────

interface PlaywrightSpec {
  tests?: Array<{ results?: Array<{ status?: string }> }>;
}

interface PlaywrightSuite {
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightRaw {
  suites?: PlaywrightSuite[];
  stats?: { duration?: number };
}

export function parsePlaywrightResults(raw: unknown): LayerResult {
  if (!raw) return { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 };
  const r = raw as PlaywrightRaw;

  let total = 0, passed = 0, failed = 0, skipped = 0;

  function walk(suite: PlaywrightSuite): void {
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

  for (const suite of r.suites ?? []) walk(suite);
  return { total, passed, failed, skipped, duration: r.stats?.duration ?? 0 };
}

// ── Istanbul/V8 coverage-summary.json ────────────────────────────────────

interface CoverageSummaryRaw {
  total?: {
    lines?: { pct?: number };
    functions?: { pct?: number };
    branches?: { pct?: number };
    statements?: { pct?: number };
  };
}

export function parseCoverage(raw: unknown): CoverageResult | null {
  if (!raw) return null;
  const r = raw as CoverageSummaryRaw;
  if (!r.total) return null;
  return {
    lines: r.total.lines?.pct ?? 0,
    functions: r.total.functions?.pct ?? 0,
    branches: r.total.branches?.pct ?? 0,
    statements: r.total.statements?.pct ?? 0,
  };
}
