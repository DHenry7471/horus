/**
 * @wutangbanger/horus-contracts
 *
 * Pure interface definitions shared between production services and test infrastructure.
 * No implementations here — just contracts. Production code depends on this;
 * test-utils implements these interfaces.
 *
 * This separation ensures production services never depend on test code.
 */
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
/**
 * Categories map to the five AI agents:
 *   failure    → Felix  (triage latest test failures)
 *   diff       → Percy  (review recent test-file diffs)
 *   dashboard  → Iris   (enrich dashboard with insights)
 *   flakiness  → Greta  (analyze flakiness report)
 *   coverage   → Saxon  (analyze coverage summary)
 */
export type AgentInsightCategory = 'failure' | 'diff' | 'dashboard' | 'flakiness' | 'coverage';
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
}
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
export interface IRepository<T extends {
    id: string;
}> {
    findById(id: string): Promise<T | null>;
    findAll(): Promise<T[]>;
    findWhere(predicate: (item: T) => boolean): Promise<T[]>;
    save(entity: T): Promise<T>;
    update(id: string, patch: Partial<T>): Promise<T | null>;
    delete(id: string): Promise<boolean>;
}
//# sourceMappingURL=index.d.ts.map