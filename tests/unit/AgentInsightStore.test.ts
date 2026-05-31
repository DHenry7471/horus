/**
 * Unit Tests: AgentInsightStore
 *
 * Scope: JSONL persistence — append, read, filter.
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
import { AgentInsightStore } from '@horus/insight-store';
import { AgentInsight } from '@horus/contracts';

// ── Fixture builder ────────────────────────────────────────────────────────

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
});
