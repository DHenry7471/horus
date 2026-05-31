/**
 * HorusVitestReporter
 *
 * A custom Vitest reporter that writes a TestRunRecord to the TestRunStore
 * for every test result. Plugs into vitest.config.ts via the `reporters` array.
 *
 * Usage in vitest.config.ts:
 *   import { HorusVitestReporter } from '@horus/insight-store';
 *   reporters: ['default', new HorusVitestReporter('./reports')]
 *
 * Records land in: reports/test-runs/<layer>.jsonl
 */

import type { Reporter, TestCase } from 'vitest/node';
import { TestRunStore } from './TestRunStore.js';
import { TestRunRecord } from '@horus/contracts';
import crypto from 'node:crypto';
import path from 'node:path';

/** Infer layer from the test file path */
function inferLayer(filepath: string): TestRunRecord['layer'] {
  const normalized = filepath.replace(/\\/g, '/');
  if (normalized.includes('/e2e/')) return 'e2e';
  if (normalized.includes('/integration/')) return 'integration';
  return 'unit';
}

export class HorusVitestReporter implements Reporter {
  private readonly store: TestRunStore;
  private readonly commitSha: string;

  constructor(reportsDir: string) {
    this.store = new TestRunStore(path.resolve(reportsDir));
    this.commitSha = process.env.GITHUB_SHA ?? 'local';
  }

  async onTestCaseResult(testCase: TestCase): Promise<void> {
    const result = testCase.result();
    if (!result) return;

    const diagnostic = testCase.diagnostic();

    const record: TestRunRecord = {
      id: crypto.randomUUID(),
      testName: testCase.fullName,
      layer: inferLayer(testCase.module.moduleId),
      runAt: new Date().toISOString(),
      passed: result.state === 'passed',
      durationMs: Math.round(diagnostic?.duration ?? 0),
      retries: diagnostic?.retryCount ?? 0,
      commitSha: this.commitSha,
    };

    await this.store.append(record);
  }
}
