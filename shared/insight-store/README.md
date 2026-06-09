# @wutangbanger/horus-insight-store

JSONL-backed persistence and analysis utilities for the Horus quality platform. Implements the store interfaces from `@wutangbanger/horus-contracts` and re-exports `runAgent` from `@wutangbanger/claude-agents`.

## Exports

### Stores

| Export | Interface | Backing file |
|---|---|---|
| `AgentInsightStore` | `IAgentInsightStore` | `agent-insights.jsonl` |
| `TestRunStore` | `ITestRunStore` | `test-runs.jsonl` |
| `CoverageStore` | — | `coverage-snapshots.jsonl` |
| `MutationStore` | `IMutationStore` | `mutation-snapshots.jsonl` |

All stores accept a `HorusConfig` and write append-only JSONL to `reportsDir`.

### Analysis

| Export | Description |
|---|---|
| `computeFlakeScores(records, options?)` | Derives `FlakeScore[]` from a window of `TestRunRecord`s |
| `computeDelta(prev, curr, thresholds)` | Returns a `CoverageDelta` with `belowThreshold` flag |
| `computeMutationDelta(prev, curr, threshold)` | Returns a `MutationDelta` with `belowThreshold` flag |
| `analyzeEventContracts(publishedTopics, subscribedTopics)` | Returns an `EventContractReport` identifying gaps between publishers and subscribers |

### Vitest integration

`HorusVitestReporter` is a custom Vitest reporter that appends a `TestRunRecord` for each test result. Wire it into `vitest.config.ts`:

```ts
import { HorusVitestReporter } from '@wutangbanger/horus-insight-store';

export default defineConfig({
  test: {
    reporters: [new HorusVitestReporter({ reportsDir: './reports' })],
  },
});
```

### CLI ingest

```bash
horus-ingest --file path/to/results.json --agent felix --category failure
```

Reads a structured JSON file and appends an `AgentInsight` record to `agent-insights.jsonl`.

### Agent runner

```ts
import { runAgent } from '@wutangbanger/horus-insight-store';

await runAgent('felix', { reportsDir: './reports' });
```

Re-exported from `@wutangbanger/claude-agents`. Requires `ANTHROPIC_API_KEY`.

## Dependencies

- `@wutangbanger/horus-contracts` — interface definitions (workspace dep)
- `@wutangbanger/claude-agents` — agent runner

Vitest is a peer dependency (optional) — only needed when using `HorusVitestReporter`.

## Version

`1.5.0` — publishable to npm (`publishConfig.access: public`).
