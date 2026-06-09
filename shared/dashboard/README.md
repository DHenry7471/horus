# @wutangbanger/horus-dashboard

Static dashboard generator for the Horus quality observatory. Reads test results, coverage snapshots, flakiness data, and agent insights from a `reportsDir`, then writes a self-contained HTML dashboard plus supporting JSON files to an `outputDir`.

## Installation

```bash
pnpm add @wutangbanger/horus-dashboard
```

## CLI

```bash
horus-dashboard [options]

Options:
  --reportsDir  <path>   Path to reports directory  (default: ./reports)
  --outputDir   <path>   Output directory            (default: ./quality-dashboard/dist)
  --template    <path>   Custom HTML template
  --maxRuns     <n>      Max history runs to keep    (default: 30)
  --help                 Print this help
```

The CLI expects the following files inside `reportsDir` (all optional — missing files are skipped):

| File | Format |
|---|---|
| `unit-results.json` | Vitest JSON reporter |
| `integration-results.json` | Vitest JSON reporter |
| `e2e-results.json` | Playwright JSON reporter |
| `coverage/coverage-summary.json` | Istanbul / V8 coverage-summary |
| `flakiness-report.json` | Pre-existing static report (legacy fallback) |
| `agent-insights.jsonl` | `AgentInsightStore` output |

## Programmatic API

```ts
import { generate } from '@wutangbanger/horus-dashboard';

await generate({
  reportsDir: '/absolute/path/to/reports',
  outputDir:  '/absolute/path/to/site',
});
```

### `HorusDashboardConfig`

| Field | Type | Default | Description |
|---|---|---|---|
| `reportsDir` | `string` | — | Directory containing test result files |
| `outputDir` | `string` | — | Directory where the dashboard site is written |
| `layers` | `LayerConfig[]` | unit / integration / e2e | Test layers to include |
| `templatePath` | `string` | bundled `dashboard.html` | Custom HTML template path |
| `maxHistoryRuns` | `number` | `30` | Max runs retained in `history.json` |

### `LayerConfig`

```ts
interface LayerConfig {
  name: string;           // key in the snapshot payload
  label?: string;         // human-readable label (defaults to name)
  resultsFile: string;    // path relative to reportsDir
  format: 'vitest' | 'playwright';
}
```

## Output files

| File | Contents |
|---|---|
| `index.html` | Self-contained dashboard (rendered from template) |
| `latest.json` | Current `DashboardSnapshot` (aggregates only — no individual test data) |
| `history.json` | Array of up to `maxHistoryRuns` snapshots |
| `{layer}-tests.json` | Per-test detail for each layer (`unit-tests.json`, `integration-tests.json`, `e2e-tests.json`) |
| `coverage-history.json` | Coverage snapshots from `CoverageStore` |
| `flakiness-report.json` | Flakiness analysis from `TestRunStore` |
| `insights.json` | Latest 200 agent insight records |

The per-layer test files are written when the results JSON contains individual test data (Vitest JSON reporter always does; Playwright JSON reporter does too). They are loaded client-side to populate the layer detail pages.

## Dashboard features

- **Pass rate trend** — Chart.js line chart with hover tooltips and colour-coded points (green ≥ 95%, amber ≥ 80%, red below)
- **Layer detail pages** — aggregate metrics plus a filterable table of every test case, failed tests first with inline error messages
- **Coverage page** — per-metric cards vs. thresholds, drift delta banner, and a coverage history trend chart
- **Flakiness report** — ranked table of flaky and always-failing tests with pass/fail counts
- **Event contract coverage** — topic-level publish/subscribe test gap analysis
- **Agent insights timeline** — Markdown-rendered findings from all agents, sorted by severity
- **Test pyramid** — distribution visualisation with an `!` warning badge on the nav item and a landing-page callout when unit tests fall below 60% of the suite

## Exports

```ts
export { generate } from './generate.js';
export type {
  HorusDashboardConfig,
  LayerConfig,
  LayerFormat,
  LayerResult,
  TestCase,
  CoverageResult,
  DashboardSnapshot,
} from './types.js';
```

`TestCase` describes a single test result inside a layer: `{ name, file, status, duration, error? }`. It is populated by the parsers and written to the per-layer test files — it does not appear in `DashboardSnapshot.layers`.

## Iris enrichment (optional)

When `CLAUDE_AGENTS_MCP_URL` or `IRIS_ENABLED=true` is set, the generator calls the Iris agent to produce an AI-generated HTML commentary snippet and injects it into the dashboard before `</body>`. Requires `ANTHROPIC_API_KEY`.

## Dependencies

- `@wutangbanger/horus-contracts` — `CoverageDelta`, `FlakeScore`, `TestRunRecord` types
- `@wutangbanger/horus-insight-store` — `CoverageStore`, `TestRunStore`, `AgentInsightStore`, `computeFlakeScores`

## Version

`1.1.0` — publishable to npm (`publishConfig.access: public`).
