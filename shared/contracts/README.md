# @wutangbanger/horus-contracts

Pure TypeScript interfaces shared across Horus services and test infrastructure. No implementations — just contracts.

## Why this package exists

Production services depend on this package. `@wutangbanger/horus-test-utils` implements these interfaces. This separation ensures production code never imports test code.

## Interfaces

### `IRepository<T>`
Generic CRUD interface injected into services. `findById`, `findAll`, `findWhere`, `save`, `update`, `delete`.

### `IEventBus` / `EventPayload`
Async pub/sub contract. `OrderService` publishes; `NotificationService` subscribes. In integration tests, both share a `MockEventBus`.

### `IAgentInsightStore`
Persistence contract for AI agent outputs. Supports `append`, `readAll`, `readSince`, `readByAgent`, `readByCategory`.

### `ITestRunStore`
Accumulates per-test run records over time. Powers flakiness analysis.

### `IMutationStore`
Accumulates Stryker mutation snapshots. Exposes `latestDelta()` for score drift detection.

### `AgentInsight` / `AgentInsightCategory` / `AgentInsightSeverity`
Typed shape for AI agent outputs. Categories map 1:1 to agents (Felix → `failure`, Saxon → `coverage`, Kurt → `mutation`, etc.).

### `CoverageSnapshot` / `CoverageDelta`
Per-run coverage snapshots and threshold-aware deltas.

### `MutationSnapshot` / `MutationDelta`
Per-run Stryker snapshots and threshold-aware deltas.

### `HorusConfig`
Top-level config passed to all stores: `reportsDir`, `commitSha`, and coverage thresholds.

## Dependency rule

```
production services  →  @wutangbanger/horus-contracts
test-utils           →  @wutangbanger/horus-contracts  (implements interfaces)
tests                →  @wutangbanger/horus-contracts + @wutangbanger/horus-test-utils
```

Production services **never** import `@wutangbanger/horus-test-utils`.

## Version

`1.3.0` — publishable to npm (`publishConfig.access: public`).
