/**
 * CoverageStore
 *
 * Appends CoverageSnapshots to reports/coverage-history.jsonl after each
 * test:coverage run. Provides helpers to compute deltas between runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { CoverageSnapshot, CoverageDelta } from '@horus/contracts';

/** Thresholds from vitest.config.ts — kept in sync manually */
const THRESHOLDS = { lines: 80, functions: 80, branches: 75, statements: 80 };

export class CoverageStore {
  private readonly filePath: string;

  constructor(baseDir: string) {
    const dir = path.resolve(baseDir);
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, 'coverage-history.jsonl');
  }

  async append(snapshot: CoverageSnapshot): Promise<void> {
    fs.appendFileSync(this.filePath, JSON.stringify(snapshot) + '\n', 'utf8');
  }

  async readAll(): Promise<CoverageSnapshot[]> {
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, 'utf8');
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as CoverageSnapshot)
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  }

  /** Returns the delta between the two most recent snapshots, or null if fewer than 2 exist. */
  async latestDelta(): Promise<CoverageDelta | null> {
    const all = await this.readAll();
    if (all.length < 2) return null;
    const prev = all[all.length - 2];
    const curr = all[all.length - 1];
    return computeDelta(prev, curr);
  }
}

export function computeDelta(prev: CoverageSnapshot, curr: CoverageSnapshot): CoverageDelta {
  const lines = round(curr.lines - prev.lines);
  const functions = round(curr.functions - prev.functions);
  const branches = round(curr.branches - prev.branches);
  const statements = round(curr.statements - prev.statements);

  const belowThreshold =
    curr.lines < THRESHOLDS.lines ||
    curr.functions < THRESHOLDS.functions ||
    curr.branches < THRESHOLDS.branches ||
    curr.statements < THRESHOLDS.statements;

  return { lines, functions, branches, statements, belowThreshold };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
