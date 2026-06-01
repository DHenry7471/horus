/**
 * Unit Tests: CoverageStore
 *
 * Scope: JSONL persistence and delta computation.
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
import { CoverageStore, computeDelta } from '@wutangbanger/horus-insight-store';
import { CoverageSnapshot } from '@wutangbanger/horus-contracts';

// ── Fixture builder ────────────────────────────────────────────────────────

function aSnapshot(overrides: Partial<CoverageSnapshot> = {}): CoverageSnapshot {
  return {
    id: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
    commitSha: 'abc1234',
    lines: 85,
    functions: 82,
    branches: 78,
    statements: 84,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CoverageStore', () => {
  let tmpDir: string;
  let store: CoverageStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'horus-coverage-'));
    store = new CoverageStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── append / readAll ──────────────────────────────────────────────────────

  describe('append', () => {
    it('given a new snapshot when appended then it can be read back', async () => {
      // Arrange
      const snapshot = aSnapshot({ commitSha: 'deadbeef', lines: 90 });

      // Act
      await store.append(snapshot);

      // Assert
      const results = await store.readAll();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(snapshot.id);
      expect(results[0].lines).toBe(90);
    });

    it('given multiple snapshots when reading then all are returned sorted by capturedAt ascending', async () => {
      // Arrange
      const older = aSnapshot({ capturedAt: '2026-01-01T00:00:00.000Z' });
      const newer = aSnapshot({ capturedAt: '2026-06-01T00:00:00.000Z' });

      // Act — append out of order
      await store.append(newer);
      await store.append(older);

      // Assert
      const results = await store.readAll();
      expect(results[0].capturedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(results[1].capturedAt).toBe('2026-06-01T00:00:00.000Z');
    });
  });

  describe('readAll', () => {
    it('given empty store when reading then returns empty array', async () => {
      // Arrange — store has no records

      // Act
      const results = await store.readAll();

      // Assert
      expect(results).toEqual([]);
    });
  });

  // ── latestDelta ───────────────────────────────────────────────────────────

  describe('latestDelta', () => {
    it('given fewer than two snapshots when computing delta then returns null', async () => {
      // Arrange
      await store.append(aSnapshot());

      // Act
      const delta = await store.latestDelta();

      // Assert
      expect(delta).toBeNull();
    });

    it('given empty store when computing delta then returns null', async () => {
      // Arrange — empty store

      // Act
      const delta = await store.latestDelta();

      // Assert
      expect(delta).toBeNull();
    });

    it('given two snapshots when computing delta then returns diff between last two', async () => {
      // Arrange
      const prev = aSnapshot({ capturedAt: '2026-01-01T00:00:00.000Z', lines: 80, functions: 80, branches: 75, statements: 80 });
      const curr = aSnapshot({ capturedAt: '2026-06-01T00:00:00.000Z', lines: 85, functions: 82, branches: 77, statements: 83 });
      await store.append(prev);
      await store.append(curr);

      // Act
      const delta = await store.latestDelta();

      // Assert
      expect(delta).not.toBeNull();
      expect(delta!.lines).toBe(5);
      expect(delta!.functions).toBe(2);
      expect(delta!.branches).toBe(2);
      expect(delta!.belowThreshold).toBe(false);
    });

    it('given three snapshots when computing delta then uses only the two most recent', async () => {
      // Arrange
      await store.append(aSnapshot({ capturedAt: '2026-01-01T00:00:00.000Z', lines: 70 }));
      await store.append(aSnapshot({ capturedAt: '2026-03-01T00:00:00.000Z', lines: 80 }));
      await store.append(aSnapshot({ capturedAt: '2026-06-01T00:00:00.000Z', lines: 85 }));

      // Act
      const delta = await store.latestDelta();

      // Assert — delta is between run 2 (80) and run 3 (85), not run 1
      expect(delta!.lines).toBe(5);
    });
  });
});

// ── computeDelta (pure function) ───────────────────────────────────────────

describe('computeDelta', () => {
  it('given coverage that improved when computing delta then returns positive deltas and belowThreshold false', () => {
    // Arrange
    const prev = aSnapshot({ lines: 78, functions: 78, branches: 73, statements: 78 });
    const curr = aSnapshot({ lines: 85, functions: 83, branches: 78, statements: 84 });

    // Act
    const delta = computeDelta(prev, curr);

    // Assert
    expect(delta.lines).toBe(7);
    expect(delta.functions).toBe(5);
    expect(delta.branches).toBe(5);
    expect(delta.statements).toBe(6);
    expect(delta.belowThreshold).toBe(false);
  });

  it('given coverage below threshold when computing delta then belowThreshold is true', () => {
    // Arrange
    const prev = aSnapshot({ lines: 85, functions: 85, branches: 80, statements: 85 });
    const curr = aSnapshot({ lines: 75, functions: 85, branches: 80, statements: 85 }); // lines below 80

    // Act
    const delta = computeDelta(prev, curr);

    // Assert
    expect(delta.belowThreshold).toBe(true);
    expect(delta.lines).toBe(-10);
  });

  it('given coverage exactly at threshold when computing delta then belowThreshold is false', () => {
    // Arrange
    const prev = aSnapshot({ lines: 80, functions: 80, branches: 75, statements: 80 });
    const curr = aSnapshot({ lines: 80, functions: 80, branches: 75, statements: 80 });

    // Act
    const delta = computeDelta(prev, curr);

    // Assert
    expect(delta.belowThreshold).toBe(false);
    expect(delta.lines).toBe(0);
  });

  it('given fractional coverage values when computing delta then rounds to one decimal place', () => {
    // Arrange
    const prev = aSnapshot({ lines: 80.1, functions: 80, branches: 75, statements: 80 });
    const curr = aSnapshot({ lines: 82.6, functions: 80, branches: 75, statements: 80 });

    // Act
    const delta = computeDelta(prev, curr);

    // Assert
    expect(delta.lines).toBe(2.5);
  });
});
