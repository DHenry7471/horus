/**
 * Configuration types for @wutangbanger/horus-dashboard
 */

/** Which reporter format produced the results file. */
export type LayerFormat = 'vitest' | 'playwright';

/**
 * One test layer in the quality pyramid.
 * Defaults to the standard three-layer setup when omitted from HorusDashboardConfig.
 */
export interface LayerConfig {
  /** Machine-readable key used in the snapshot payload (e.g. 'unit', 'integration', 'e2e'). */
  name: string;
  /** Human-readable label shown in the dashboard (defaults to name). */
  label?: string;
  /** Path to the results JSON file, relative to reportsDir. */
  resultsFile: string;
  /** Parser to apply to the results file. */
  format: LayerFormat;
}

/** Top-level config passed to generate(). All paths must be absolute. */
export interface HorusDashboardConfig {
  /** Directory containing test result JSON files and coverage/. */
  reportsDir: string;
  /** Directory where the static dashboard site will be written. */
  outputDir: string;
  /**
   * Test layers to include.  Defaults to the standard three-layer pyramid:
   *   unit (vitest)  →  integration (vitest)  →  e2e (playwright)
   */
  layers?: LayerConfig[];
  /**
   * Absolute path to a custom HTML template.
   * Defaults to the bundled dashboard.html shipped with this package.
   */
  templatePath?: string;
  /** Maximum number of historical runs to retain. Defaults to 30. */
  maxHistoryRuns?: number;
}

/** Normalised counts for a single test layer. */
export interface LayerResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

/** Coverage percentages parsed from a coverage-summary.json. */
export interface CoverageResult {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
}

/** One entry in history.json / latest.json. */
export interface DashboardSnapshot {
  generatedAt: string;
  commitSha: string;
  runNumber: number;
  repository: string;
  passRate: number;
  totalTests: number;
  layers: Record<string, LayerResult>;
  coverage: CoverageResult | null;
  coverageDelta?: Record<string, number | boolean>;
}
