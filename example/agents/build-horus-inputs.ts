/**
 * build-horus-inputs
 *
 * Reads locally available reports and assembles a typed JSON input object
 * for the requested Horus agent. Prints to stdout for piping to run-horus-agent.ts.
 *
 * Usage:
 *   tsx agents/build-horus-inputs.ts felix  > /tmp/felix-input.json
 *   tsx agents/build-horus-inputs.ts greta  > /tmp/greta-input.json
 *   tsx agents/build-horus-inputs.ts iris   > /tmp/iris-input.json
 *   tsx agents/build-horus-inputs.ts percy  > /tmp/percy-input.json
 *   tsx agents/build-horus-inputs.ts kurt   > /tmp/kurt-input.json
 *
 * Compose with run-horus-agent.ts:
 *   tsx agents/build-horus-inputs.ts felix > /tmp/in.json && \
 *     tsx agents/run-horus-agent.ts horus-felix --input-file /tmp/in.json
 *
 * Environment variables:
 *   HORUS_REPORTS_DIR  — path to reports/ directory (default: ./reports)
 *   HORUS_BRANCH       — branch name for context fields (default: current git branch)
 *   HORUS_RUN_ID       — CI run ID for context fields (default: 'local')
 *   HORUS_PR_URL       — PR URL for percy input
 *   HORUS_PR_TITLE     — PR title for percy input
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { TestRunStore, CoverageStore, computeFlakeScores } from '@wutangbanger/horus-insight-store';
import type {
  FelixInput,
  GretaInput,
  IrisInput,
  PercyInput,
  KurtInput,
  TestRunRecord,
} from '@wutangbanger/horus-contracts';

const agent = process.argv[2];
if (!['felix', 'greta', 'iris', 'percy', 'kurt'].includes(agent)) {
  console.error('Usage: tsx agents/build-horus-inputs.ts <felix|greta|iris|percy|kurt>');
  process.exit(1);
}

const reportsDir = path.resolve(process.env.HORUS_REPORTS_DIR ?? './reports');

function readJsonFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function gitOutput(cmd: string): string {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}

const currentBranch = process.env.HORUS_BRANCH ?? gitOutput('git branch --show-current') ?? 'main';
const runId = process.env.HORUS_RUN_ID ?? 'local';

// ── Felix ─────────────────────────────────────────────────────────────────

async function buildFelix(): Promise<FelixInput> {
  // Merge unit + integration + e2e reports into a combined CI report object
  const unit = readJsonFile(path.join(reportsDir, 'unit-results.json'));
  const integration = readJsonFile(path.join(reportsDir, 'integration-results.json'));
  const e2e = readJsonFile(path.join(reportsDir, 'e2e-results.json'));

  // Git diff — file-level signal for regression correlation
  const gitDiff = gitOutput('git diff origin/main...HEAD --name-only') ||
                  gitOutput('git diff HEAD~1 --name-only');

  // Flakiness history — derive pass rates from TestRunStore
  const store = new TestRunStore(reportsDir);
  const allRecords = await store.readAll();
  let flakinessHistory: Record<string, number> | undefined;
  if (allRecords.length > 0) {
    const scores = computeFlakeScores(allRecords, { includeHealthy: true });
    flakinessHistory = Object.fromEntries(
      scores.map(s => [s.testName, Math.round((1 - s.flakeRate) * 100)])
    );
  }

  return {
    ciReport: { unit, integration, e2e },
    gitDiff,
    flakinessHistory,
    branch: currentBranch,
    runId,
  };
}

// ── Greta ─────────────────────────────────────────────────────────────────

async function buildGreta(): Promise<GretaInput> {
  // Prefer the Istanbul summary format; fall back to coverage-final.json
  const coverageSummary = readJsonFile(path.join(reportsDir, 'coverage', 'coverage-summary.json'));
  const coverageFinal = readJsonFile(path.join(reportsDir, 'coverage', 'coverage-final.json'));
  const coverageReport = coverageSummary ?? coverageFinal;

  if (!coverageReport) {
    console.error('[build-horus-inputs] No coverage report found — run pnpm test:coverage first');
    process.exit(1);
  }

  return {
    coverageReport,
    highRiskModules: ['src/payments', 'src/auth', 'src/orders'],
  };
}

// ── Iris ──────────────────────────────────────────────────────────────────

async function buildIris(): Promise<IrisInput> {
  // Aggregate per-test TestRunRecords into per-commit CI run summaries
  const testStore = new TestRunStore(reportsDir);
  const coverageStore = new CoverageStore(reportsDir);
  const [allRecords, coverageSnapshots] = await Promise.all([
    testStore.readAll(),
    coverageStore.readAll(),
  ]);

  // Build a map of commitSha → coverage snapshot
  const coverageBySha = new Map(coverageSnapshots.map(s => [s.commitSha, s]));

  // Group test records by commitSha to reconstruct per-run aggregates
  const byCommit = new Map<string, TestRunRecord[]>();
  for (const record of allRecords) {
    const group = byCommit.get(record.commitSha) ?? [];
    group.push(record);
    byCommit.set(record.commitSha, group);
  }

  const runs: IrisInput['runs'] = [...byCommit.entries()]
    .sort(([, a], [, b]) => a[0].runAt.localeCompare(b[0].runAt))
    .map(([commitSha, records]) => {
      const passed = records.filter(r => r.passed).length;
      const failed = records.filter(r => !r.passed).length;
      const durationMs = records.reduce((sum, r) => sum + r.durationMs, 0);
      const timestamp = records.map(r => r.runAt).sort()[0];
      const coverage = coverageBySha.get(commitSha);

      return {
        runId: commitSha,
        timestamp,
        branch: currentBranch,
        passed,
        failed,
        skipped: 0,
        durationMs,
        coverageLines:    coverage?.lines,
        coverageBranches: coverage?.branches,
        unitCount:        records.filter(r => r.layer === 'unit').length,
        integrationCount: records.filter(r => r.layer === 'integration').length,
        e2eCount:         records.filter(r => r.layer === 'e2e').length,
      };
    });

  if (runs.length === 0) {
    console.error('[build-horus-inputs] No test run records found — run pnpm ingest first');
    process.exit(1);
  }

  return { runs, windowDays: 30 };
}

// ── Percy ─────────────────────────────────────────────────────────────────

async function buildPercy(): Promise<PercyInput> {
  // Full unified diff scoped to test files
  const diff =
    gitOutput("git diff origin/main...HEAD -- 'tests/**' '**/*.test.ts' '**/*.spec.ts'") ||
    gitOutput("git diff HEAD~1 -- 'tests/**' '**/*.test.ts' '**/*.spec.ts'");

  if (!diff) {
    console.error('[build-horus-inputs] No test file diff found (nothing changed or no prior commit)');
    process.exit(1);
  }

  return {
    diff,
    prUrl:   process.env.HORUS_PR_URL,
    prTitle: process.env.HORUS_PR_TITLE,
  };
}

// ── Kurt ──────────────────────────────────────────────────────────────────

async function buildKurt(): Promise<KurtInput> {
  // Stryker produces reports/mutation/mutation.json by default
  const reportPaths = [
    path.join(reportsDir, 'mutation', 'mutation.json'),
    path.join(reportsDir, 'mutation-report.json'),
    path.join('reports', 'mutation', 'mutation.json'),
  ];

  let strykerReport: unknown = null;
  for (const p of reportPaths) {
    strykerReport = readJsonFile(p);
    if (strykerReport) break;
  }

  if (!strykerReport) {
    console.error(
      '[build-horus-inputs] No Stryker report found. Run Stryker first:\n' +
      '  npx stryker run'
    );
    process.exit(1);
  }

  return {
    strykerReport: strykerReport as KurtInput['strykerReport'],
    highRiskModules: ['src/payments', 'src/auth', 'src/orders'],
  };
}

// ── Dispatch ──────────────────────────────────────────────────────────────

const builders: Record<string, () => Promise<unknown>> = {
  felix: buildFelix,
  greta: buildGreta,
  iris:  buildIris,
  percy: buildPercy,
  kurt:  buildKurt,
};

const input = await builders[agent]!();
process.stdout.write(JSON.stringify(input, null, 2));
process.stdout.write('\n');
