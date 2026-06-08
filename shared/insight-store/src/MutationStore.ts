/**
 * MutationStore
 *
 * JSONL-backed persistence for Stryker mutation testing snapshots.
 * Appends one MutationSnapshot per run to reports/mutation-history.jsonl
 * so mutation score can be trended over time, exactly like CoverageStore
 * trends line/branch coverage.
 *
 * Implements IMutationStore from @wutangbanger/horus-contracts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { MutationSnapshot, MutationDelta, IMutationStore, HorusConfig } from '@wutangbanger/horus-contracts';

const DEFAULT_SCORE_THRESHOLD = 70;

export class MutationStore implements IMutationStore {
  private readonly filePath: string;
  private readonly scoreThreshold: number;

  constructor(config: HorusConfig | string, scoreThreshold = DEFAULT_SCORE_THRESHOLD) {
    const reportsDir = typeof config === 'string' ? config : config.reportsDir;
    const dir = path.resolve(reportsDir);
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, 'mutation-history.jsonl');
    this.scoreThreshold = scoreThreshold;
  }

  async append(snapshot: MutationSnapshot): Promise<void> {
    fs.appendFileSync(this.filePath, JSON.stringify(snapshot) + '\n', 'utf8');
  }

  async readAll(): Promise<MutationSnapshot[]> {
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, 'utf8');
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as MutationSnapshot)
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  }

  /** Returns the delta between the two most recent snapshots, or null if fewer than 2 exist. */
  async latestDelta(): Promise<MutationDelta | null> {
    const all = await this.readAll();
    if (all.length < 2) return null;
    const prev = all[all.length - 2];
    const curr = all[all.length - 1];
    return computeMutationDelta(prev, curr, this.scoreThreshold);
  }
}

export function computeMutationDelta(
  prev: MutationSnapshot,
  curr: MutationSnapshot,
  scoreThreshold = DEFAULT_SCORE_THRESHOLD,
): MutationDelta {
  return {
    score: round(curr.score - prev.score),
    killed: curr.killed - prev.killed,
    survived: curr.survived - prev.survived,
    belowThreshold: curr.score < scoreThreshold,
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
