/**
 * @wutangbanger/horus-contracts
 *
 * Pure interface definitions shared between production services and test infrastructure.
 * No implementations here — just contracts. Production code depends on this;
 * test-utils implements these interfaces.
 *
 * This separation ensures production services never depend on test code.
 */

// ── Event Bus ─────────────────────────────────────────────────────────────

export interface EventPayload {
  topic: string;
  data: unknown;
  timestamp: number;
  correlationId: string;
}

export interface IEventBus {
  publish(topic: string, data: unknown, correlationId?: string): Promise<void>;
  subscribe(topic: string, handler: (payload: EventPayload) => void | Promise<void>): void;
  unsubscribeAll(): void;
}

// ── Agent Insights ────────────────────────────────────────────────────────

/**
 * Categories map to AI agents:
 *   failure    → Felix     (triage latest test failures)
 *   diff       → Percy     (review recent test-file diffs)
 *   dashboard  → Iris      (enrich dashboard with insights)
 *   flakiness  → Greta     (analyze flakiness report)
 *   coverage   → Saxon     (analyze coverage summary)
 *   pipeline   → Clint     (audit CI/CD quality gate changes)
 *   api-test   → Ambrosine (generate/audit API test suites)
 *   e2e        → Ernie     (write missing Playwright E2E specs)
 *   fixtures   → Furio     (generate typed test data builders)
 *   mutation   → Kurt      (interpret Stryker mutation reports)
 *   contract   → Pat       (design/implement Pact contract tests)
 *   strategy   → Tessa     (audit coverage & produce test strategy)
 */
export type AgentInsightCategory =
  | 'failure'
  | 'diff'
  | 'dashboard'
  | 'flakiness'
  | 'coverage'
  | 'pipeline'
  | 'api-test'
  | 'e2e'
  | 'fixtures'
  | 'mutation'
  | 'contract'
  | 'strategy';

export type AgentInsightSeverity = 'info' | 'warning' | 'critical';

export interface AgentInsight {
  /** Unique ID for this insight record */
  id: string;
  /** Which agent produced this insight (e.g. "felix", "saxon") */
  agentId: string;
  /** ISO 8601 timestamp of when the agent ran */
  runAt: string;
  category: AgentInsightCategory;
  severity: AgentInsightSeverity;
  /** One-line human-readable summary shown in the dashboard */
  summary: string;
  /** Full structured output from the agent — shape varies by agent */
  details: unknown;
}

export interface IAgentInsightStore {
  append(insight: AgentInsight): Promise<void>;
  readAll(): Promise<AgentInsight[]>;
  readSince(isoTimestamp: string): Promise<AgentInsight[]>;
  readByAgent(agentId: string): Promise<AgentInsight[]>;
  readByCategory(category: AgentInsightCategory): Promise<AgentInsight[]>;
}

// ── Test Run History ──────────────────────────────────────────────────────

/**
 * One record per individual test per CI run.
 * Accumulated over time to compute flakiness scores.
 */
export interface TestRunRecord {
  /** Unique ID for this record */
  id: string;
  /** Full test name, e.g. "OrderService > createOrder > given valid request..." */
  testName: string;
  /** Layer: unit | integration | e2e */
  layer: 'unit' | 'integration' | 'e2e';
  /** ISO 8601 timestamp of the run */
  runAt: string;
  /** Whether this test passed in this run */
  passed: boolean;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Number of retries before this result (0 = first attempt) */
  retries: number;
  /** Git commit SHA or 'local' */
  commitSha: string;
}

/**
 * Computed flakiness summary for a single test.
 * Derived from a window of TestRunRecords.
 */
export interface FlakeScore {
  testName: string;
  layer: TestRunRecord['layer'];
  /** Total runs in the analysis window */
  totalRuns: number;
  passCount: number;
  failCount: number;
  /** 0.0 = always passes, 1.0 = always fails */
  flakeRate: number;
  /** Whether the test is considered flaky (0 < flakeRate < 1) */
  isFlaky: boolean;
  /** Whether the test consistently fails (flakeRate === 1) */
  isAlwaysFailing: boolean;
  /** Average duration in ms */
  avgDurationMs: number;
}

export interface ITestRunStore {
  append(record: TestRunRecord): Promise<void>;
  readAll(): Promise<TestRunRecord[]>;
  readSince(isoTimestamp: string): Promise<TestRunRecord[]>;
  readByTest(testName: string): Promise<TestRunRecord[]>;
}

// ── Coverage History ──────────────────────────────────────────────────────

/**
 * One snapshot per test:coverage run. Accumulated over time to detect drift.
 */
export interface CoverageSnapshot {
  id: string;
  capturedAt: string;
  commitSha: string;
  /** Percentage values 0–100 */
  lines: number;
  functions: number;
  branches: number;
  statements: number;
}

/**
 * Delta between two consecutive CoverageSnapshots.
 * Negative values mean coverage degraded.
 */
export interface CoverageDelta {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
  /** True if any metric dropped below its configured threshold */
  belowThreshold: boolean;
}

// ── Horus Configuration ───────────────────────────────────────────────────

export interface HorusConfig {
  /** Directory where all JSONL report files are written. Default: './reports' */
  reportsDir: string;
  /** Git SHA for test run records. Default: process.env.GITHUB_SHA ?? 'local' */
  commitSha?: string;
  /** Coverage thresholds for delta/belowThreshold calculation */
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
}

// ── Mutation Testing ──────────────────────────────────────────────────────

/**
 * One snapshot per Stryker run. Accumulated over time to detect mutation
 * score drift, analogous to CoverageSnapshot for line/branch coverage.
 */
export interface MutationSnapshot {
  id: string;
  capturedAt: string;
  commitSha: string;
  /** Total mutants generated by Stryker */
  totalMutants: number;
  /** Mutants killed by the test suite */
  killed: number;
  /** Mutants that survived (weak or missing tests) */
  survived: number;
  /** Mutants Stryker timed out on */
  timedOut: number;
  /** Mutation score: killed / (killed + survived + timedOut) × 100 */
  score: number;
}

/**
 * Delta between two consecutive MutationSnapshots.
 * Negative score means mutation effectiveness degraded.
 */
export interface MutationDelta {
  score: number;
  killed: number;
  survived: number;
  /** True if score dropped below the configured threshold */
  belowThreshold: boolean;
}

export interface IMutationStore {
  append(snapshot: MutationSnapshot): Promise<void>;
  readAll(): Promise<MutationSnapshot[]>;
  /** Returns the delta between the two most recent snapshots, or null if fewer than 2 exist */
  latestDelta(): Promise<MutationDelta | null>;
}

// ── Repository ────────────────────────────────────────────────────────────

export interface IRepository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  findWhere(predicate: (item: T) => boolean): Promise<T[]>;
  save(entity: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

// ── Horus Agent I/O contracts ─────────────────────────────────────────────
//
// These types define the structured input and output contracts for the five
// Horus API agent variants (agents/horus/ in the claude_agents repo).
// The caller is responsible for pre-fetching all data before invocation.
// Each agent always returns a single JSON code block parsed into the Output type.

// ── Felix — failure triage ────────────────────────────────────────────────

export interface FelixInput {
  /** Full Vitest JSON report (--reporter=json) OR Playwright JSON report object. */
  ciReport: unknown;
  /**
   * Output of `git diff origin/main...HEAD --name-only` — newline-separated paths.
   * Pass an empty string if unavailable.
   */
  gitDiff: string;
  /**
   * Optional map of test name → historical pass rate (0–100).
   * Use FlakinessAnalyzer / TestRunStore to compute this before calling the agent.
   */
  flakinessHistory?: Record<string, number>;
  branch?: string;
  runId?: string;
}

export type FailureClassification = 'REGRESSION' | 'FLAKY' | 'ENV_NOISE' | 'TEST_BUG' | 'UNKNOWN';
export type MergeRecommendation = 'BLOCK' | 'ALLOW';

export interface FelixOutput {
  branch: string;
  runId: string;
  totalFailures: number;
  failures: Array<{
    testName: string;
    filePath: string;
    classification: FailureClassification;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    rootCauseHypothesis: string;
    evidence: string;
    recommendedOwner: string;
    suggestedAction: string;
  }>;
  mergeRecommendation: MergeRecommendation;
  mergeReason: string;
  quarantineStubs: Array<{ testName: string; stub: string }>;
}

// ── Greta — coverage gap analyst ─────────────────────────────────────────

export interface GretaInput {
  /** Istanbul coverage-summary.json OR V8 JSON coverage report (parsed object). */
  coverageReport: unknown;
  /** Optional: one-sentence description per file path. */
  sourceSummaries?: Record<string, string>;
  /** Optional: path substrings treated as high-risk (elevated one risk level). */
  highRiskModules?: string[];
}

export type CoverageRiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type CoverageGapType =
  | 'error_path'
  | 'state_transition'
  | 'validation_branch'
  | 'business_logic'
  | 'auth_check'
  | 'other';

export interface GretaOutput {
  overallCoverage: {
    linesPct: number;
    branchesPct: number;
    functionsPct: number;
    statementsPct: number;
  };
  gaps: Array<{
    filePath: string;
    riskLevel: CoverageRiskLevel;
    gapType: CoverageGapType;
    description: string;
    uncoveredLines: number[];
    branchCoveragePct: number;
    testStub: string;
  }>;
  summary: string;
  investmentOrder: string[];
}

// ── Iris — quality health reporter ───────────────────────────────────────

export interface IrisInput {
  runs: Array<{
    runId: string;
    timestamp: string;
    branch: string;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
    coverageLines?: number;
    coverageBranches?: number;
    unitCount?: number;
    integrationCount?: number;
    e2eCount?: number;
  }>;
  windowDays?: number;
  thresholds?: {
    minPassRate?: number;
    minLineCoverage?: number;
    maxE2ePct?: number;
  };
}

export type QualityTrend = 'IMPROVING' | 'STABLE' | 'DEGRADING';

export interface IrisOutput {
  generatedAt: string;
  windowDays: number;
  passRate: { current: number; avg7d: number; avg30d: number; trend: QualityTrend };
  coverage: { lines: number; branches: number; linesDelta7d: number; branchesDelta7d: number; trend: QualityTrend };
  pyramid: { unitPct: number; integrationPct: number; e2ePct: number; status: 'BALANCED' | 'IMBALANCED' | 'UNKNOWN' };
  anomalies: Array<{
    type: 'SUDDEN_DROP' | 'DURATION_SPIKE' | 'CONSECUTIVE_FAILURES' | 'COVERAGE_DRIFT' | 'PYRAMID_IMBALANCE';
    detail: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  topInsight: string;
  actionItems: string[];
  slackSummary: string;
  htmlSnippet: string;
}

// ── Percy — PR test reviewer ──────────────────────────────────────────────

export type PercyVerdict = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

export type PercyStandard =
  | 'AAA_PATTERN'
  | 'GIVEN_WHEN_THEN_NAMING'
  | 'PYRAMID_LAYER_COMPLIANCE'
  | 'MOCK_INJECTION'
  | 'TEST_ISOLATION'
  | 'NO_LOGIC_IN_TESTS'
  | 'NO_HARDCODED_WAITS'
  | 'BEHAVIOR_NOT_IMPLEMENTATION'
  | 'ASSERTION_COMPLETENESS'
  | 'TEST_COUNT_REGRESSION';

export interface PercyInput {
  /** Unified diff string from `git diff` or GitHub Compare API. */
  diff: string;
  prUrl?: string;
  prTitle?: string;
}

export interface PercyOutput {
  prUrl: string;
  prTitle: string;
  overallVerdict: PercyVerdict;
  mustFix: Array<{ file: string; line: number; standard: PercyStandard; comment: string }>;
  recommended: Array<{ file: string; line: number; standard: PercyStandard; comment: string }>;
  summary: string;
  standardsChecked: PercyStandard[];
}

// ── Kurt — mutation analyst ───────────────────────────────────────────────

export interface KurtInput {
  strykerReport: {
    schemaVersion: string;
    thresholds: { high: number; low: number; break?: number };
    projectRoot: string;
    files: Record<string, {
      language: string;
      source: string;
      mutants: Array<{
        id: string;
        mutatorName: string;
        replacement: string;
        location: { start: { line: number; column: number }; end: { line: number; column: number } };
        status: 'Survived' | 'Killed' | 'NoCoverage' | 'Ignored' | 'Timeout' | 'CompileError';
        statusReason?: string;
        coveredBy?: string[];
        killedBy?: string[];
        static?: boolean;
      }>;
    }>;
  };
  highRiskModules?: string[];
}

export type KurtRiskLevel = 'CRITICAL' | 'HIGH' | 'LOW';

export interface KurtOutput {
  mutationScore: number;
  projectedScoreAfterKills: number;
  totalSurvivors: number;
  kills: Array<{
    mutantId: string;
    filePath: string;
    line: number;
    mutatorName: string;
    replacement: string;
    riskLevel: KurtRiskLevel;
    rationale: string;
    testStub: string;
  }>;
  acceptableSurvivors: Array<{
    mutantId: string;
    filePath: string;
    line: number;
    mutatorName: string;
    rationale: string;
  }>;
  summary: string;
}
