/**
 * Unit Tests: EventContractAnalyzer
 *
 * Scope: Static analysis of source + test files to detect event contract gaps.
 *        Uses real temp directories with fixture source files — no network, no mocks.
 * External services: NONE.
 *
 * Pattern: AAA (Arrange → Act → Assert)
 * Naming: "given [context] when [action] then [expected outcome]"
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeEventContracts } from '@wutangbanger/horus-insight-store';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Write a file, creating parent dirs as needed */
function writeFile(root: string, relPath: string, content: string): void {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('analyzeEventContracts', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'horus-contracts-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── no topics ─────────────────────────────────────────────────────────────

  it('given source files with no event topics when analyzed then report has zero topics', async () => {
    // Arrange
    writeFile(tmpDir, 'services/order-service/src/index.ts', `
      export function doSomething() { return 42; }
    `);
    writeFile(tmpDir, 'tests/unit/example.test.ts', `
      it('works', () => {});
    `);

    // Act
    const report = await analyzeEventContracts(tmpDir);

    // Assert
    expect(report.totalTopics).toBe(0);
    expect(report.gaps).toHaveLength(0);
  });

  // ── fully uncovered topic ─────────────────────────────────────────────────

  it('given a declared topic with no test coverage when analyzed then it is fully uncovered', async () => {
    // Arrange — source declares a topic; no tests reference it
    writeFile(tmpDir, 'services/order-service/src/events.ts', `
      export const ORDER_EVENTS = { CREATED: 'order.created' };
    `);
    writeFile(tmpDir, 'tests/unit/other.test.ts', `
      it('unrelated test', () => {});
    `);

    // Act
    const report = await analyzeEventContracts(tmpDir);

    // Assert
    expect(report.totalTopics).toBeGreaterThanOrEqual(1);
    const gap = report.gaps.find((g) => g.topic === 'order.created');
    expect(gap).toBeDefined();
    expect(gap!.publishCovered).toBe(false);
    expect(gap!.subscribeCovered).toBe(false);
    expect(report.fullyUncovered).toBeGreaterThanOrEqual(1);
  });

  // ── publish covered ───────────────────────────────────────────────────────

  it('given a topic covered on publish side when analyzed then publishCovered is true', async () => {
    // Arrange
    writeFile(tmpDir, 'services/order-service/src/events.ts', `
      export const ORDER_EVENTS = { CREATED: 'order.created' };
    `);
    writeFile(tmpDir, 'tests/integration/order.test.ts', `
      eventBus.assertPublished('order.created', (p) => p.data.id === '123');
    `);

    // Act
    const report = await analyzeEventContracts(tmpDir);

    // Assert
    const gap = report.gaps.find((g) => g.topic === 'order.created');
    expect(gap!.publishCovered).toBe(true);
    expect(gap!.publishCoveredBy).toContain('tests/integration/order.test.ts');
  });

  // ── subscribe covered ─────────────────────────────────────────────────────

  it('given a topic covered on subscribe side when analyzed then subscribeCovered is true', async () => {
    // Arrange
    writeFile(tmpDir, 'shared/contracts/src/events.ts', `
      export const NOTIFY_EVENTS = { SENT: 'notification.sent' };
    `);
    writeFile(tmpDir, 'tests/integration/notification.test.ts', `
      notificationService.registerEventHandlers();
      eventBus.publish('notification.sent', {});
    `);

    // Act
    const report = await analyzeEventContracts(tmpDir);

    // Assert
    const gap = report.gaps.find((g) => g.topic === 'notification.sent');
    expect(gap!.subscribeCovered).toBe(true);
  });

  // ── fully covered ─────────────────────────────────────────────────────────

  it('given a topic covered on both sides when analyzed then fullyCovered count increments', async () => {
    // Arrange
    writeFile(tmpDir, 'services/order-service/src/events.ts', `
      export const ORDER_EVENTS = { CONFIRMED: 'order.confirmed' };
    `);
    writeFile(tmpDir, 'tests/integration/flow.test.ts', `
      eventBus.assertPublished('order.confirmed', () => true);
      notificationService.registerEventHandlers();
    `);

    // Act
    const report = await analyzeEventContracts(tmpDir);

    // Assert
    const gap = report.gaps.find((g) => g.topic === 'order.confirmed');
    expect(gap!.publishCovered).toBe(true);
    expect(gap!.subscribeCovered).toBe(true);
    expect(report.fullyCovered).toBeGreaterThanOrEqual(1);
  });

  // ── sorting ───────────────────────────────────────────────────────────────

  it('given mixed coverage when analyzed then fully uncovered gaps sort first', async () => {
    // Arrange — two topics: one fully covered, one fully uncovered
    writeFile(tmpDir, 'services/order-service/src/events.ts', `
      export const EVENTS = { A: 'order.created', B: 'order.cancelled' };
    `);
    // Only cover order.created on both sides
    writeFile(tmpDir, 'tests/integration/covered.test.ts', `
      eventBus.assertPublished('order.created', () => true);
      service.registerEventHandlers();
    `);

    // Act
    const report = await analyzeEventContracts(tmpDir);

    // Assert — uncovered topic appears before covered one
    const uncoveredIdx = report.gaps.findIndex((g) => !g.publishCovered && !g.subscribeCovered);
    const coveredIdx = report.gaps.findIndex((g) => g.publishCovered && g.subscribeCovered);
    if (uncoveredIdx !== -1 && coveredIdx !== -1) {
      expect(uncoveredIdx).toBeLessThan(coveredIdx);
    }
  });

  // ── report metadata ───────────────────────────────────────────────────────

  it('given any analysis when completed then report includes analyzedAt timestamp', async () => {
    // Arrange — empty project
    writeFile(tmpDir, 'services/order-service/src/placeholder.ts', `export {};`);

    // Act
    const report = await analyzeEventContracts(tmpDir);

    // Assert
    expect(report.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // ── node_modules excluded ─────────────────────────────────────────────────

  it('given topics inside node_modules when analyzed then they are excluded', async () => {
    // Arrange
    writeFile(tmpDir, 'node_modules/some-lib/src/events.ts', `
      export const LIB_EVENTS = { READY: 'lib.ready' };
    `);

    // Act
    const report = await analyzeEventContracts(tmpDir);

    // Assert
    expect(report.gaps.find((g) => g.topic === 'lib.ready')).toBeUndefined();
  });
});
