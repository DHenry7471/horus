/**
 * CoverageStore
 *
 * Appends CoverageSnapshots to reports/coverage-history.jsonl after each
 * test:coverage run. Provides helpers to compute deltas between runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { CoverageSnapshot, CoverageDelta, HorusConfig } from '@horus/contracts';

const DEFAULT_THRESHOLDS = { lines: 80, functions: 80, branches: 75, statements: 80 };

export class CoverageStore {
  private readonly filePath: string;
  private readonly thresholds: typeof DEFAULT_THRESHOLDS;

  constructor(config: HorusConfig | string) {
    const reportsDir = typeof config === 'string' ? config : config.reportsDir;
    this.thresholds = (typeof config !== 'string' ? config.coverage : undefined) ?? DEFAULT_THRESHOLDS;
    const dir = path.resolve(reportsDir);
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
    return computeDelta(prev, curr, this.thresholds);
  }
}

export function computeDelta(
  prev: CoverageSnapshot,
  curr: CoverageSnapshot,
  thresholds = DEFAULT_THRESHOLDS,
): CoverageDelta {
  const lines = round(curr.lines - prev.lines);
  const functions = round(curr.functions - prev.functions);
  const branches = round(curr.branches - prev.branches);
  const statements = round(curr.statements - prev.statements);

  const belowThreshold =
    curr.lines < thresholds.lines ||
    curr.functions < thresholds.functions ||
    curr.branches < thresholds.branches ||
    curr.statements < thresholds.statements;

  return { lines, functions, branches, statements, belowThreshold };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
