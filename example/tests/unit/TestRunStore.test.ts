/**
 * Unit Tests: TestRunStore
 *
 * Scope: JSONL persistence per test layer — append, readAll, readSince, readByTest.
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
import { TestRunStore } from '@wutangbanger/horus-insight-store';
import { TestRunRecord } from '@wutangbanger/horus-contracts';

// ── Fixture builder ────────────────────────────────────────────────────────

function aRecord(overrides: Partial<TestRunRecord> = {}): TestRunRecord {
  return {
    id: crypto.randomUUID(),
    testName: 'OrderService > createOrder > given valid request then creates order',
    layer: 'unit',
    runAt: new Date().toISOString(),
    passed: true,
    durationMs: 12,
    retries: 0,
    commitSha: 'abc1234',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TestRunStore', () => {
  let tmpDir: string;
  let store: TestRunStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'horus-runs-'));
    store = new TestRunStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── append ────────────────────────────────────────────────────────────────

  describe('append', () => {
    it('given a new record when appended then it can be read back', async () => {
      // Arrange
      const record = aRecord({ testName: 'MyTest', passed: false });

      // Act
      await store.append(record);

      // Assert
      const results = await store.readAll();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(record.id);
      expect(results[0].passed).toBe(false);
    });

    it('given records from different layers when appended then each goes to its own file', async () => {
      // Arrange
      await store.append(aRecord({ layer: 'unit' }));
      await store.append(aRecord({ layer: 'integration' }));
      await store.append(aRecord({ layer: 'e2e' }));

      // Assert — three separate JSONL files
      const files = fs.readdirSync(path.join(tmpDir, 'test-runs'));
      expect(files).toContain('unit.jsonl');
      expect(files).toContain('integration.jsonl');
      expect(files).toContain('e2e.jsonl');
    });
  });

  // ── readAll ───────────────────────────────────────────────────────────────

  describe('readAll', () => {
    it('given empty store when reading all then returns empty array', async () => {
      // Arrange — store is empty

      // Act
      const results = await store.readAll();

      // Assert
      expect(results).toEqual([]);
    });

    it('given records across layers when reading all then all records are returned sorted by runAt', async () => {
      // Arrange
      const older = aRecord({ layer: 'unit', runAt: '2026-01-01T00:00:00.000Z' });
      const newer = aRecord({ layer: 'integration', runAt: '2026-06-01T00:00:00.000Z' });
      await store.append(newer);
      await store.append(older);

      // Act
      const results = await store.readAll();

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].runAt).toBe('2026-01-01T00:00:00.000Z');
      expect(results[1].runAt).toBe('2026-06-01T00:00:00.000Z');
    });
  });

  // ── readSince ─────────────────────────────────────────────────────────────

  describe('readSince', () => {
    it('given records at different times when reading since cutoff then only newer records are returned', async () => {
      // Arrange
      await store.append(aRecord({ runAt: '2026-01-01T00:00:00.000Z' }));
      await store.append(aRecord({ runAt: '2026-03-01T00:00:00.000Z' }));
      await store.append(aRecord({ runAt: '2026-06-01T00:00:00.000Z' }));

      // Act
      const results = await store.readSince('2026-02-01T00:00:00.000Z');

      // Assert
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.runAt >= '2026-02-01T00:00:00.000Z')).toBe(true);
    });

    it('given empty store when reading since cutoff then returns empty array', async () => {
      // Act
      const results = await store.readSince('2026-01-01T00:00:00.000Z');

      // Assert
      expect(results).toEqual([]);
    });
  });

  // ── readByTest ────────────────────────────────────────────────────────────

  describe('readByTest', () => {
    it('given multiple test names when reading by name then only matching records are returned', async () => {
      // Arrange
      await store.append(aRecord({ testName: 'TestA' }));
      await store.append(aRecord({ testName: 'TestA' }));
      await store.append(aRecord({ testName: 'TestB' }));

      // Act
      const results = await store.readByTest('TestA');

      // Assert
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.testName === 'TestA')).toBe(true);
    });

    it('given no records for a test name when reading by name then returns empty array', async () => {
      // Arrange
      await store.append(aRecord({ testName: 'TestA' }));

      // Act
      const results = await store.readByTest('TestB');

      // Assert
      expect(results).toEqual([]);
    });
  });
});
