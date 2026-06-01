/**
 * TestRunStore
 *
 * JSONL-backed persistence for individual test run records.
 * Files: reports/test-runs/<layer>.jsonl — one record per line per test per CI run.
 *
 * Keeping records by layer (unit/integration/e2e) keeps files small and allows
 * layer-specific queries without scanning everything.
 */

import fs from 'node:fs';
import path from 'node:path';
import { TestRunRecord, ITestRunStore, HorusConfig } from '@horus/contracts';

export class TestRunStore implements ITestRunStore {
  private readonly dir: string;

  constructor(config: HorusConfig | string) {
    const reportsDir = typeof config === 'string' ? config : config.reportsDir;
    this.dir = path.resolve(reportsDir, 'test-runs');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async append(record: TestRunRecord): Promise<void> {
    const filePath = path.join(this.dir, `${record.layer}.jsonl`);
    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
  }

  async readAll(): Promise<TestRunRecord[]> {
    const files = fs.existsSync(this.dir)
      ? fs.readdirSync(this.dir).filter((f) => f.endsWith('.jsonl'))
      : [];

    const all: TestRunRecord[] = [];
    for (const file of files) {
      all.push(...this.readFile(path.join(this.dir, file)));
    }
    return all.sort((a, b) => a.runAt.localeCompare(b.runAt));
  }

  async readSince(isoTimestamp: string): Promise<TestRunRecord[]> {
    const all = await this.readAll();
    return all.filter((r) => r.runAt >= isoTimestamp);
  }

  async readByTest(testName: string): Promise<TestRunRecord[]> {
    const all = await this.readAll();
    return all.filter((r) => r.testName === testName);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private readFile(filePath: string): TestRunRecord[] {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as TestRunRecord);
  }
}
