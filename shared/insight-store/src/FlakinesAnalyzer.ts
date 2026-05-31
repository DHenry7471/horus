/**
 * FlakinessAnalyzer
 *
 * Computes FlakeScore per test from a window of TestRunRecords.
 * Pure function — no I/O. Feed it records, get scores back.
 *
 * Flakiness definition:
 *   - flakeRate = failCount / totalRuns
 *   - isFlaky   = 0 < flakeRate < 1  (passes sometimes, fails sometimes)
 *   - isAlwaysFailing = flakeRate === 1
 *
 * A test with flakeRate === 0 is healthy and is excluded from the result
 * unless includeHealthy is true.
 */

import { TestRunRecord, FlakeScore } from '@horus/contracts';

export interface FlakinessAnalyzerOptions {
  /** Include tests with flakeRate === 0 in results (default: false) */
  includeHealthy?: boolean;
}

export function computeFlakeScores(
  records: TestRunRecord[],
  options: FlakinessAnalyzerOptions = {}
): FlakeScore[] {
  // Group records by test name
  const byTest = new Map<string, TestRunRecord[]>();
  for (const record of records) {
    const group = byTest.get(record.testName) ?? [];
    group.push(record);
    byTest.set(record.testName, group);
  }

  const scores: FlakeScore[] = [];

  for (const [testName, testRecords] of byTest) {
    const totalRuns = testRecords.length;
    const passCount = testRecords.filter((r) => r.passed).length;
    const failCount = totalRuns - passCount;
    const flakeRate = totalRuns > 0 ? failCount / totalRuns : 0;
    const avgDurationMs =
      totalRuns > 0
        ? Math.round(testRecords.reduce((sum, r) => sum + r.durationMs, 0) / totalRuns)
        : 0;

    const score: FlakeScore = {
      testName,
      layer: testRecords[0].layer,
      totalRuns,
      passCount,
      failCount,
      flakeRate: Math.round(flakeRate * 1000) / 1000,
      isFlaky: flakeRate > 0 && flakeRate < 1,
      isAlwaysFailing: flakeRate === 1,
      avgDurationMs,
    };

    if (options.includeHealthy || score.isFlaky || score.isAlwaysFailing) {
      scores.push(score);
    }
  }

  // Sort: always-failing first, then by flake rate descending
  return scores.sort((a, b) => {
    if (a.isAlwaysFailing !== b.isAlwaysFailing) return a.isAlwaysFailing ? -1 : 1;
    return b.flakeRate - a.flakeRate;
  });
}
