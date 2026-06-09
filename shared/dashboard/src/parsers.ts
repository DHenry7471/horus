import type { LayerResult, CoverageResult, TestCase } from './types.js';

// ── Vitest JSON reporter output ───────────────────────────────────────────

interface VitestAssertion {
  fullName?: string;
  title?: string;
  status?: string;
  duration?: number;
  failureMessages?: string[];
}

interface VitestFile {
  name?: string;
  startTime?: number;
  endTime?: number;
  assertionResults?: VitestAssertion[];
}

interface VitestRaw {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  testResults?: VitestFile[];
}

export function parseVitestResults(raw: unknown): LayerResult {
  if (!raw) return { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 };
  const r = raw as VitestRaw;

  let duration = 0;
  const tests: TestCase[] = [];

  for (const file of r.testResults ?? []) {
    if (file.endTime && file.startTime) {
      duration += file.endTime - file.startTime;
    } else {
      for (const t of file.assertionResults ?? []) duration += t.duration ?? 0;
    }

    const fileName = (file.name ?? '').split('/').pop() ?? '';
    for (const t of file.assertionResults ?? []) {
      const status = t.status === 'passed' ? 'passed' : t.status === 'failed' ? 'failed' : 'skipped';
      tests.push({
        name: t.fullName ?? t.title ?? '',
        file: fileName,
        status,
        duration: t.duration ?? 0,
        error: t.failureMessages?.[0] || undefined,
      });
    }
  }

  return {
    total: r.numTotalTests ?? 0,
    passed: r.numPassedTests ?? 0,
    failed: r.numFailedTests ?? 0,
    skipped: r.numPendingTests ?? 0,
    duration,
    tests: tests.length ? tests : undefined,
  };
}

// ── Playwright JSON reporter output ──────────────────────────────────────

interface PlaywrightResult {
  status?: string;
  duration?: number;
}

interface PlaywrightTest {
  title?: string;
  results?: PlaywrightResult[];
}

interface PlaywrightSpec {
  title?: string;
  tests?: PlaywrightTest[];
}

interface PlaywrightSuite {
  title?: string;
  file?: string;
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
  const tests: TestCase[] = [];

  function walk(suite: PlaywrightSuite, fileHint: string): void {
    const file = suite.file ?? fileHint;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        total++;
        const result = test.results?.[0];
        const s = result?.status;
        if (s === 'passed') passed++;
        else if (s === 'failed' || s === 'timedOut') failed++;
        else skipped++;
        tests.push({
          name: spec.title ?? test.title ?? 'unnamed',
          file: file.split('/').pop() ?? file,
          status: s === 'passed' ? 'passed' : (s === 'failed' || s === 'timedOut') ? 'failed' : 'skipped',
          duration: result?.duration ?? 0,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, file);
  }

  for (const suite of r.suites ?? []) walk(suite, '');
  return {
    total, passed, failed, skipped,
    duration: r.stats?.duration ?? 0,
    tests: tests.length ? tests : undefined,
  };
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
