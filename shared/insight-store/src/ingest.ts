#!/usr/bin/env node
/**
 * horus-ingest
 *
 * Reads a Vitest or Jest JSON reporter output file and appends a TestRunRecord
 * to the TestRunStore for each test result.
 *
 * Usage:
 *   horus-ingest --file reports/unit-results.json --layer unit
 *   horus-ingest --file reports/integration-results.json --layer integration
 *
 * Compatible with: Vitest (--reporter=json), Jest (--json)
 */

import { TestRunStore } from './TestRunStore.js';
import { TestRunRecord } from '@wutangbanger/horus-contracts';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import crypto from 'node:crypto';

const { values } = parseArgs({
  options: {
    file:       { type: 'string' },
    layer:      { type: 'string' },
    reportsDir: { type: 'string', default: './reports' },
  },
});

if (!values.file) {
  console.error('Error: --file is required');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(values.file, 'utf8'));
const store = new TestRunStore({ reportsDir: values.reportsDir! });
const commitSha = process.env.GITHUB_SHA ?? 'local';
const layer = (values.layer ?? 'unit') as TestRunRecord['layer'];

// Normalize Vitest and Jest JSON shapes to TestRunRecord
const tests: Array<{ fullName?: string; name?: string; status?: string; state?: string; duration?: number; retryCount?: number }> =
  raw.testResults               // Jest shape
  ?? raw.files?.flatMap((f: { tests?: unknown[] }) => f.tests ?? []) // Vitest shape
  ?? [];

for (const t of tests) {
  const record: TestRunRecord = {
    id:         crypto.randomUUID(),
    testName:   t.fullName ?? t.name ?? 'unknown',
    layer,
    runAt:      new Date().toISOString(),
    passed:     (t.status ?? t.state) === 'passed',
    durationMs: Math.round(t.duration ?? 0),
    retries:    t.retryCount ?? 0,
    commitSha,
  };
  await store.append(record);
}

console.log(`Ingested ${tests.length} test records → ${values.reportsDir}/test-runs/${layer}.jsonl`);
