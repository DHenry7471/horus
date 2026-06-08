/**
 * Unit Tests: AgentInsightStore
 *
 * Scope: JSONL persistence — append, read, filter.
 * Covers both standard agent insights (freeform details) and
 * Horus agent insights (typed structured details from FelixOutput, PercyOutput, etc.).
 * Dependencies: Node fs (real), temp directory per test.
 * External services: NONE.
 *
 * Pattern: AAA (Arrange → Act → Assert)
 * Naming: "given [context] when [action] then [expected outcome]"
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentInsightStore } from '@wutangbanger/horus-insight-store';
import type {
  AgentInsight,
  FelixOutput,
  PercyOutput,
} from '@wutangbanger/horus-contracts';

// ── Fixture builders ───────────────────────────────────────────────────────

/** Standard agent insight — freeform prose output. */
function anInsight(overrides: Partial<AgentInsight> = {}): AgentInsight {
  return {
    id: crypto.randomUUID(),
    agentId: 'felix',
    runAt: new Date().toISOString(),
    category: 'failure',
    severity: 'info',
    summary: 'All tests passed',
    details: { output: 'ok' },
    ...overrides,
  };
}

/**
 * Horus agent insight — structured typed output stored directly in `details`.
 * Mirrors what run-horus-agent.ts persists after calling runHorusAgent<T>().
 */
function aHorusFelixInsight(overrides: Partial<AgentInsight> = {}): AgentInsight {
  const details: FelixOutput = {
    branch: 'feat/payment-refactor',
    runId: 'ci-run-42',
    totalFailures: 1,
    failures: [
      {
        testName: 'given valid order when payment fails then throws PaymentError',
        filePath: 'tests/unit/OrderService.test.ts',
        classification: 'REGRESSION',
        confidence: 'HIGH',
        rootCauseHypothesis: 'PaymentService.charge() error path not handled in new refactor',
        evidence: 'src/payments/chargeService.ts is in the git diff',
        recommendedOwner: 'payments-team',
        suggestedAction: 'Block merge — fix error handling in chargeService',
      },
    ],
    mergeRecommendation: 'BLOCK',
    mergeReason: 'One REGRESSION failure with HIGH confidence linked to the diff',
    quarantineStubs: [],
  };

  return {
    id: crypto.randomUUID(),
    agentId: 'horus-felix-failure-triage',
    runAt: new Date().toISOString(),
    category: 'failure',
    severity: 'critical',
    summary: 'BLOCK: One REGRESSION failure with HIGH confidence linked to the diff',
    details,
    ...overrides,
  };
}

function aHorusPercyInsight(overrides: Partial<AgentInsight> = {}): AgentInsight {
  const details: PercyOutput = {
    prUrl: 'https://github.com/org/repo/pull/42',
    prTitle: 'feat: refactor payment flow',
    overallVerdict: 'REQUEST_CHANGES',
    mustFix: [
      {
        file: 'tests/unit/OrderService.test.ts',
        line: 34,
        standard: 'AAA_PATTERN',
        comment: 'Missing // Arrange, // Act, // Assert comments — restructure the test body.',
      },
    ],
    recommended: [],
    summary: 'One must-fix violation: AAA_PATTERN missing on OrderService test.',
    standardsChecked: ['AAA_PATTERN', 'GIVEN_WHEN_THEN_NAMING', 'TEST_ISOLATION'],
  };

  return {
    id: crypto.randomUUID(),
    agentId: 'horus-percy-pr-reviewer',
    runAt: new Date().toISOString(),
    category: 'diff',
    severity: 'critical',
    summary: 'REQUEST_CHANGES: One must-fix violation: AAA_PATTERN missing.',
    details,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AgentInsightStore', () => {
  let tmpDir: string;
  let store: AgentInsightStore;

  beforeEach(() => {
    // Arrange — isolated temp directory per test, no shared state
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'horus-insights-'));
    store = new AgentInsightStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── append ───────────────────────────────────────────────────────────────

  describe('append', () => {
    it('given a new insight when appended then it can be read back', async () => {
      // Arrange
      const insight = anInsight({ agentId: 'felix', summary: 'Test failure in OrderService' });

      // Act
      await store.append(insight);

      // Assert
      const results = await store.readAll();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(insight.id);
      expect(results[0].summary).toBe('Test failure in OrderService');
    });

    it('given multiple appends when reading then all records are returned in runAt order', async () => {
      // Arrange
      const older = anInsight({ agentId: 'felix', runAt: '2026-01-01T00:00:00.000Z' });
      const newer = anInsight({ agentId: 'saxon', runAt: '2026-06-01T00:00:00.000Z' });

      // Act — append out of chronological order
      await store.append(newer);
      await store.append(older);

      // Assert — readAll returns sorted by runAt ascending
      const results = await store.readAll();
      expect(results).toHaveLength(2);
      expect(results[0].runAt).toBe('2026-01-01T00:00:00.000Z');
      expect(results[1].runAt).toBe('2026-06-01T00:00:00.000Z');
    });

    it('given insights from two agents when appended then each lands in its own file', async () => {
      // Arrange
      await store.append(anInsight({ agentId: 'felix' }));
      await store.append(anInsight({ agentId: 'saxon' }));

      // Assert — two separate JSONL files created
      const files = fs.readdirSync(path.join(tmpDir, 'agent-insights'));
      expect(files).toContain('felix.jsonl');
      expect(files).toContain('saxon.jsonl');
    });
  });

  // ── readAll ───────────────────────────────────────────────────────────────

  describe('readAll', () => {
    it('given empty store when reading all then returns empty array', async () => {
      // Arrange — store has no records

      // Act
      const results = await store.readAll();

      // Assert
      expect(results).toEqual([]);
    });

    it('given multiple agents with multiple insights when reading all then all records are returned', async () => {
      // Arrange
      await store.append(anInsight({ agentId: 'felix' }));
      await store.append(anInsight({ agentId: 'felix' }));
      await store.append(anInsight({ agentId: 'greta' }));

      // Act
      const results = await store.readAll();

      // Assert
      expect(results).toHaveLength(3);
    });
  });

  // ── readSince ─────────────────────────────────────────────────────────────

  describe('readSince', () => {
    it('given insights at different times when reading since a cutoff then only newer records are returned', async () => {
      // Arrange
      await store.append(anInsight({ runAt: '2026-01-01T00:00:00.000Z' }));
      await store.append(anInsight({ runAt: '2026-03-01T00:00:00.000Z' }));
      await store.append(anInsight({ runAt: '2026-06-01T00:00:00.000Z' }));

      // Act
      const results = await store.readSince('2026-02-01T00:00:00.000Z');

      // Assert
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.runAt >= '2026-02-01T00:00:00.000Z')).toBe(true);
    });

    it('given empty store when reading since a cutoff then returns empty array', async () => {
      // Act
      const results = await store.readSince('2026-01-01T00:00:00.000Z');

      // Assert
      expect(results).toEqual([]);
    });
  });

  // ── readByAgent ───────────────────────────────────────────────────────────

  describe('readByAgent', () => {
    it('given insights from multiple agents when reading by agent then only that agents records are returned', async () => {
      // Arrange
      await store.append(anInsight({ agentId: 'felix' }));
      await store.append(anInsight({ agentId: 'felix' }));
      await store.append(anInsight({ agentId: 'greta' }));

      // Act
      const results = await store.readByAgent('felix');

      // Assert
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.agentId === 'felix')).toBe(true);
    });

    it('given no insights for an agent when reading by that agent then returns empty array', async () => {
      // Arrange
      await store.append(anInsight({ agentId: 'felix' }));

      // Act
      const results = await store.readByAgent('percy');

      // Assert
      expect(results).toEqual([]);
    });
  });

  // ── Horus agent insights — typed structured details ───────────────────────
  //
  // Horus agents store typed JSON output (FelixOutput, PercyOutput, etc.)
  // directly in `details` rather than wrapping prose in { output: string }.
  // These tests verify that structured payloads round-trip through JSONL intact.

  describe('horus agent insights', () => {
    it('given a horus-felix insight when appended then typed details are preserved verbatim', async () => {
      // Arrange
      const insight = aHorusFelixInsight();

      // Act
      await store.append(insight);

      // Assert
      const [result] = await store.readByAgent('horus-felix-failure-triage');
      expect(result.agentId).toBe('horus-felix-failure-triage');
      expect(result.severity).toBe('critical');
      // Typed FelixOutput fields must survive the JSONL round-trip
      const details = result.details as import('@wutangbanger/horus-contracts').FelixOutput;
      expect(details.mergeRecommendation).toBe('BLOCK');
      expect(details.failures).toHaveLength(1);
      expect(details.failures[0].classification).toBe('REGRESSION');
      expect(details.failures[0].confidence).toBe('HIGH');
    });

    it('given a horus-percy insight when appended then typed verdict and violations are preserved', async () => {
      // Arrange
      const insight = aHorusPercyInsight();

      // Act
      await store.append(insight);

      // Assert
      const [result] = await store.readByAgent('horus-percy-pr-reviewer');
      const details = result.details as import('@wutangbanger/horus-contracts').PercyOutput;
      expect(details.overallVerdict).toBe('REQUEST_CHANGES');
      expect(details.mustFix).toHaveLength(1);
      expect(details.mustFix[0].standard).toBe('AAA_PATTERN');
    });

    it('given horus and standard agent insights when querying by category then each category is isolated', async () => {
      // Arrange — standard felix (category: failure) + horus-felix (category: failure) + horus-percy (category: diff)
      await store.append(anInsight({ agentId: 'felix', category: 'failure' }));
      await store.append(aHorusFelixInsight());
      await store.append(aHorusPercyInsight());

      // Act
      const failures = await store.readByCategory('failure');
      const diffs = await store.readByCategory('diff');

      // Assert
      expect(failures).toHaveLength(2);
      expect(diffs).toHaveLength(1);
      expect(diffs[0].agentId).toBe('horus-percy-pr-reviewer');
    });

    it('given mixed standard and horus insights when reading all then all are returned together', async () => {
      // Arrange
      await store.append(anInsight({ agentId: 'felix' }));
      await store.append(aHorusFelixInsight());
      await store.append(aHorusPercyInsight());

      // Act
      const all = await store.readAll();

      // Assert
      expect(all).toHaveLength(3);
      const agentIds = all.map((r) => r.agentId);
      expect(agentIds).toContain('felix');
      expect(agentIds).toContain('horus-felix-failure-triage');
      expect(agentIds).toContain('horus-percy-pr-reviewer');
    });

    it('given a horus insight with ALLOW verdict when severity is info', async () => {
      // Arrange — ALLOW verdict should produce an info-severity insight
      const insight = aHorusFelixInsight({
        severity: 'info',
        summary: 'ALLOW: No regressions detected',
        details: {
          branch: 'feat/safe-refactor',
          runId: 'ci-run-99',
          totalFailures: 0,
          failures: [],
          mergeRecommendation: 'ALLOW',
          mergeReason: 'No failures linked to the diff',
          quarantineStubs: [],
        } satisfies import('@wutangbanger/horus-contracts').FelixOutput,
      });

      // Act
      await store.append(insight);

      // Assert
      const [result] = await store.readByAgent('horus-felix-failure-triage');
      expect(result.severity).toBe('info');
      const details = result.details as import('@wutangbanger/horus-contracts').FelixOutput;
      expect(details.mergeRecommendation).toBe('ALLOW');
      expect(details.totalFailures).toBe(0);
    });
  });
});
