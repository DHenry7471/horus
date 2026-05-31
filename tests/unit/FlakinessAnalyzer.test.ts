/**
 * Unit Tests: FlakinessAnalyzer (computeFlakeScores)
 *
 * Scope: Pure function — no I/O. Verifies flake rate computation,
 *        isFlaky/isAlwaysFailing flags, sorting, and includeHealthy option.
 * External services: NONE.
 *
 * Pattern: AAA (Arrange → Act → Assert)
 * Naming: "given [context] when [action] then [expected outcome]"
 */

import { describe, it, expect } from 'vitest';
import { computeFlakeScores } from '@horus/insight-store';
import { TestRunRecord } from '@horus/contracts';

// ── Fixture builder ────────────────────────────────────────────────────────

function aRecord(overrides: Partial<TestRunRecord> = {}): TestRunRecord {
  return {
    id: crypto.randomUUID(),
    testName: 'SomeTest',
    layer: 'unit',
    runAt: new Date().toISOString(),
    passed: true,
    durationMs: 10,
    retries: 0,
    commitSha: 'abc1234',
    ...overrides,
  };
}

function records(testName: string, outcomes: boolean[]): TestRunRecord[] {
  return outcomes.map((passed) => aRecord({ testName, passed }));
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('computeFlakeScores', () => {
  // ── empty input ───────────────────────────────────────────────────────────

  it('given no records when computing scores then returns empty array', () => {
    // Arrange / Act
    const scores = computeFlakeScores([]);

    // Assert
    expect(scores).toEqual([]);
  });

  // ── healthy tests ─────────────────────────────────────────────────────────

  it('given a test that always passes when computing scores then it is excluded by default', () => {
    // Arrange
    const input = records('AlwaysPasses', [true, true, true]);

    // Act
    const scores = computeFlakeScores(input);

    // Assert — healthy tests are filtered out unless includeHealthy is set
    expect(scores).toHaveLength(0);
  });

  it('given a healthy test when includeHealthy is true then it is included with flakeRate 0', () => {
    // Arrange
    const input = records('AlwaysPasses', [true, true, true]);

    // Act
    const scores = computeFlakeScores(input, { includeHealthy: true });

    // Assert
    expect(scores).toHaveLength(1);
    expect(scores[0].flakeRate).toBe(0);
    expect(scores[0].isFlaky).toBe(false);
    expect(scores[0].isAlwaysFailing).toBe(false);
  });

  // ── flaky tests ───────────────────────────────────────────────────────────

  it('given a test that sometimes fails when computing scores then isFlaky is true', () => {
    // Arrange
    const input = records('FlakyTest', [true, false, true, false]);

    // Act
    const scores = computeFlakeScores(input);

    // Assert
    expect(scores).toHaveLength(1);
    expect(scores[0].isFlaky).toBe(true);
    expect(scores[0].isAlwaysFailing).toBe(false);
    expect(scores[0].flakeRate).toBe(0.5);
    expect(scores[0].passCount).toBe(2);
    expect(scores[0].failCount).toBe(2);
    expect(scores[0].totalRuns).toBe(4);
  });

  it('given a test that always fails when computing scores then isAlwaysFailing is true', () => {
    // Arrange
    const input = records('BrokenTest', [false, false, false]);

    // Act
    const scores = computeFlakeScores(input);

    // Assert
    expect(scores).toHaveLength(1);
    expect(scores[0].isAlwaysFailing).toBe(true);
    expect(scores[0].isFlaky).toBe(false);
    expect(scores[0].flakeRate).toBe(1);
  });

  // ── flake rate precision ──────────────────────────────────────────────────

  it('given 1 failure in 3 runs when computing scores then flakeRate rounds to 3 decimal places', () => {
    // Arrange
    const input = records('SporadicTest', [true, true, false]);

    // Act
    const scores = computeFlakeScores(input);

    // Assert
    expect(scores[0].flakeRate).toBe(0.333);
  });

  // ── average duration ──────────────────────────────────────────────────────

  it('given records with varying durations when computing scores then avgDurationMs is rounded mean', () => {
    // Arrange
    const input = [
      aRecord({ testName: 'SlowTest', passed: false, durationMs: 100 }),
      aRecord({ testName: 'SlowTest', passed: true,  durationMs: 200 }),
      aRecord({ testName: 'SlowTest', passed: false, durationMs: 300 }),
    ];

    // Act
    const scores = computeFlakeScores(input);

    // Assert
    expect(scores[0].avgDurationMs).toBe(200);
  });

  // ── sorting ───────────────────────────────────────────────────────────────

  it('given always-failing and flaky tests when computing scores then always-failing sorts first', () => {
    // Arrange
    const input = [
      ...records('FlakyTest', [true, false]),           // flakeRate 0.5
      ...records('BrokenTest', [false, false, false]),   // always failing
    ];

    // Act
    const scores = computeFlakeScores(input);

    // Assert
    expect(scores[0].testName).toBe('BrokenTest');
    expect(scores[1].testName).toBe('FlakyTest');
  });

  it('given two flaky tests when computing scores then higher flake rate sorts first', () => {
    // Arrange
    const input = [
      ...records('MildlyFlaky', [true, true, false]),   // flakeRate ~0.333
      ...records('VeryFlaky',   [true, false, false]),  // flakeRate ~0.667
    ];

    // Act
    const scores = computeFlakeScores(input);

    // Assert
    expect(scores[0].testName).toBe('VeryFlaky');
    expect(scores[1].testName).toBe('MildlyFlaky');
  });

  // ── layer ─────────────────────────────────────────────────────────────────

  it('given records from different layers when computing scores then each score uses layer of its records', () => {
    // Arrange
    const input = [
      aRecord({ testName: 'E2ETest', layer: 'e2e', passed: false }),
      aRecord({ testName: 'E2ETest', layer: 'e2e', passed: true }),
    ];

    // Act
    const scores = computeFlakeScores(input);

    // Assert
    expect(scores[0].layer).toBe('e2e');
  });

  // ── multiple tests ────────────────────────────────────────────────────────

  it('given records for multiple tests when computing scores then each test gets its own score', () => {
    // Arrange
    const input = [
      ...records('TestA', [true, false]),
      ...records('TestB', [false, false]),
      ...records('TestC', [true, true]),   // healthy — excluded
    ];

    // Act
    const scores = computeFlakeScores(input);

    // Assert
    expect(scores).toHaveLength(2);
    expect(scores.map((s) => s.testName)).toContain('TestA');
    expect(scores.map((s) => s.testName)).toContain('TestB');
  });
});
