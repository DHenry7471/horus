# 🔭 Horus — Quality Observatory

> *"The all-seeing eye over your test suite."*

Horus is a quality observability platform for TypeScript/Node.js microservice systems. It tracks quality signals over time — flakiness rates, coverage drift, event contract gaps, and AI agent findings — and surfaces them in a persistent dashboard.

The `order-service` and `notification-service` in `example/` are **reference subjects**: realistic microservices used to demonstrate Horus's observability capabilities. They are not the product. Horus is.

[![CI](https://github.com/YOUR_USERNAME/horus/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/horus/actions/workflows/ci.yml)
[![Quality Dashboard](https://img.shields.io/badge/dashboard-live-orange)](https://dhenry7471.github.io/horus/dashboard/)

---

## What Horus Provides

**`@wutangbanger/horus-insight-store`** — the observability persistence layer. Stores agent findings, per-test run history, and coverage snapshots as JSONL. Everything the dashboard reads comes from here. Includes the `horus-ingest` CLI for ingesting any test runner's JSON output.

**`@wutangbanger/horus-contracts`** — shared interfaces (`IAgentInsightStore`, `ITestRunStore`, `IEventBus`, `IRepository`, `HorusConfig`) that keep the platform's boundaries clean and swappable.

**`@wutangbanger/horus-test-utils`** — injectable mock implementations of those interfaces, so the reference subjects can be exercised at the integration layer without real infrastructure. Private — not published to npm.

**Quality Dashboard** — a static HTML observatory that renders pass rate trends, flakiness reports computed from run history, coverage drift between runs, event contract coverage, and an AI agent insights timeline.

**AI Agent pipeline** — five Claude agents (Felix, Percy, Iris, Greta, Saxon) whose findings are persisted as structured `AgentInsight` records rather than ephemeral stdout.

**Event contract analyzer** — static analysis that detects which event topics lack publish or subscribe test coverage, runnable as a CI gate.

---

## Installing from npm

### Primary path: post-run ingestion (any test runner)

Works with Vitest, Jest, Mocha, Pytest — any runner that emits JSON output.

```bash
pnpm add @wutangbanger/horus-contracts @wutangbanger/horus-insight-store
```

```yaml
# .github/workflows/ci.yml
- name: Run tests
  run: pnpm exec vitest run --reporter=json --outputFile=reports/results.json

- name: Ingest results into Horus
  run: |
    pnpm exec horus-ingest --file reports/unit-results.json --layer unit
    pnpm exec horus-ingest --file reports/integration-results.json --layer integration
```

Records land in `reports/test-runs/<layer>.jsonl` and feed the flakiness dashboard.

### Secondary path: Vitest inline reporter (opt-in)

If you prefer zero-config capture within Vitest, `HorusVitestReporter` writes records automatically after each test. Note the Vitest Reporter API can break between major versions.

```ts
// vitest.config.ts
import { HorusVitestReporter } from '@wutangbanger/horus-insight-store';

export default defineConfig({
  test: {
    reporters: ['default', new HorusVitestReporter({ reportsDir: './reports' })],
  },
});
```

---

## Structure

```
horus/
├── shared/                         ← Publishable packages
│   ├── contracts/                  ← Interfaces only (@wutangbanger/horus-contracts)
│   ├── test-utils/                 ← Mock implementations (private, domain-coupled)
│   └── insight-store/              ← Observability persistence (@wutangbanger/horus-insight-store)
├── example/                        ← Reference implementation (private)
│   ├── services/
│   │   ├── order-service/          ← Express REST API
│   │   └── notification-service/   ← Event-driven service
│   ├── tests/
│   │   ├── unit/                   ← Pure business logic (Vitest)
│   │   ├── integration/            ← Cross-service via injected mocks (Vitest)
│   │   ├── contract/               ← Consumer/provider contract tests (Vitest)
│   │   └── e2e/                    ← HTTP smoke tests (Playwright)
│   ├── agents/                     ← AI agent CLI wrappers
│   ├── quality-dashboard/          ← Dashboard generator + static HTML
│   ├── reports/                    ← Generated observability data
│   │   ├── agent-insights/         ← JSONL: AI agent findings
│   │   ├── test-runs/              ← JSONL: per-test history
│   │   └── coverage-history.jsonl  ← Coverage snapshots
│   ├── vitest.config.ts
│   ├── playwright.config.ts
│   └── package.json
├── docs/
│   ├── TEST_STRATEGY.md
│   └── decisions/                  ← Architecture Decision Records
├── pnpm-workspace.yaml
└── .github/workflows/
    ├── ci.yml
    ├── nightly-flakiness.yml
    ├── percy-pr-review.yml
    └── felix-triage.yml
```

---

## Design Principles

### Quality as a time series, not a snapshot
Pass/fail on the last run answers the wrong question. Horus tracks signals over time:
- **Flakiness rate** — computed from run history across multiple runs, not just the latest result
- **Coverage drift** — delta between runs surfaces degradation that static thresholds miss
- **Agent insights** — AI findings are persisted as structured records, queryable by agent, severity, and time window
- **Event contract gaps** — statically detected before they become production incidents

### No external dependencies in integration tests
`@wutangbanger/horus-test-utils` provides injectable mocks for all infrastructure. The reference services never touch a real database, broker, or email provider in tests:

```typescript
import { MockEventBus, MockRepository, anOrder } from '@wutangbanger/horus-test-utils';

const eventBus = new MockEventBus();
const repo = new MockRepository<Order>();
const service = new OrderService(repo, eventBus);
```

### Interfaces first
Production code depends only on `@wutangbanger/horus-contracts` interfaces. Test utilities implement those interfaces. This is what makes integration tests possible without real infrastructure — and what would let Horus be adapted to any domain by swapping the reference subjects.

### AAA + descriptive naming
```typescript
it('given PENDING order when confirming then transitions to CONFIRMED', async () => {
  // Arrange
  const order = anOrder().withStatus(OrderStatus.PENDING).build();
  await repo.save(order);

  // Act
  const result = await service.confirmOrder(order.id);

  // Assert
  expect(result.status).toBe(OrderStatus.CONFIRMED);
});
```

---

## Quick Start (reference implementation)

> **Requires Node.js ≥ 22.5.0** and **pnpm ≥ 9.0.0**.

```bash
# Install dependencies (pnpm workspaces)
pnpm install

# Run all tests (from example/)
cd example && pnpm run test:all

# Unit tests only (fastest feedback)
pnpm run test:unit

# Integration tests
pnpm run test:integration

# E2E tests (auto-starts order-service on :3000)
pnpm run test:e2e

# Ingest test results into JSONL stores
pnpm run ingest

# Check event contract coverage (exits 1 if gaps found — CI-gateable)
pnpm run check:event-contracts

# Generate quality dashboard
pnpm run dashboard:generate
pnpm run dashboard:serve
```

---

## CI Pipeline

```
Push / PR
  ├── [Parallel] Lint + TypeCheck       → blocks merge if fails
  ├── [Parallel] Unit Tests             → blocks merge if fails
  │        └── Integration Tests       → blocks merge if fails
  │                 └── E2E Tests      → blocks deploy if fails
  ├── [Parallel] Event Contract Check  → blocks merge if uncovered topics found
  └── (main only) Dashboard            → publishes to GitHub Pages (Iris-enriched)

PR touches example/tests/**
  └── Percy review → posts AI test-change analysis as PR comment

CI fails on PR
  └── Felix triage → posts root-cause verdict, adds merge-block label if BLOCK
```

**Nightly:** The flakiness scan runs the full suite 3× and opens a GitHub issue for any non-deterministic tests.

---

## Quality Dashboard

The live dashboard is published to GitHub Pages on every merge to `main`.

**[View Dashboard →](https://dhenry7471.github.io/horus/dashboard/)**

Tracks:
- Overall pass rate trend (last 30 runs)
- Per-layer pass rates (unit / integration / E2E)
- Code coverage vs thresholds + **drift delta** between runs
- Test pyramid distribution health
- Flakiness report computed from run history (not a static file)
- **Event contract coverage** — publish and subscribe test gaps per topic
- **Agent insights timeline** — persistent findings from all five AI agents

---

## @wutangbanger/horus-insight-store

The observability persistence layer. All quality signals write here; the dashboard reads from here.

```
reports/
├── agent-insights/
│   ├── felix.jsonl       ← failure triage findings
│   ├── percy.jsonl       ← diff review findings
│   ├── iris.jsonl        ← dashboard enrichment
│   ├── greta.jsonl       ← flakiness findings
│   ├── saxon.jsonl       ← coverage findings
│   └── event-contracts.jsonl ← contract gap findings
├── test-runs/
│   ├── unit.jsonl        ← per-test run history
│   └── integration.jsonl
└── coverage-history.jsonl ← coverage snapshots per run
```

Key exports:

| Export | Purpose |
|---|---|
| `AgentInsightStore` | Append/query agent findings by agent, severity, or time window |
| `TestRunStore` | Per-test run history; feeds flakiness computation |
| `HorusVitestReporter` | Vitest reporter plugin — inline capture (opt-in secondary path) |
| `CoverageStore` | Coverage snapshots + delta between runs |
| `computeFlakeScores` | Pure function: `TestRunRecord[]` → `FlakeScore[]` ranked by flake rate |
| `analyzeEventContracts` | Static analyzer: scans source and tests for publish/subscribe gaps |

CLI bin (installed with the package):

```bash
horus-ingest --file reports/unit-results.json --layer unit
horus-ingest --file reports/integration-results.json --layer integration
```

---

## @wutangbanger/horus-test-utils

The shared mock injection library that makes clean integration tests possible.

| Export | Replaces |
|---|---|
| `MockEventBus` | Redis pub/sub, SQS, Kafka |
| `MockRepository<T>` | Postgres, MongoDB, DynamoDB |
| `MockNotificationSender` | Email/SMS providers |
| `OrderBuilder` | Manual fixture construction |
| `NotificationBuilder` | Manual fixture construction |

---

## Event Contract Coverage

The `check-event-contracts` analyzer statically verifies that every event topic has tests on both sides of the contract:

```bash
pnpm run check:event-contracts         # print report, exit 1 if gaps found
pnpm run check:event-contracts:persist # same + write to AgentInsightStore
```

Example output:
```
🔎 Event Contract Coverage — 2026-05-31T12:00:00.000Z
   Topics found:     4
   Fully covered:    3
   Publish only:     1
   Subscribe only:   0
   Fully uncovered:  0

   ✅ publish  ✅ subscribe  →  order.created
   ✅ publish  ✅ subscribe  →  order.confirmed
   ✅ publish  ✅ subscribe  →  order.cancelled
   ✅ publish  ❌ subscribe  →  order.shipped
      ⚠  No test exercises handler for "order.shipped"
```

---

## AI Agents

Horus integrates with agents from the [`@wutangbanger/claude-agents`](https://www.npmjs.com/package/@wutangbanger/claude-agents) npm package. All agent output is automatically persisted to `reports/agent-insights/` via `AgentInsightStore` and surfaced in the dashboard.

| Agent | Role | Trigger |
|---|---|---|
| Percy | Reviews test file changes on PRs | PR touches `example/tests/**` or `*.test.ts` |
| Felix | Triages CI failures, issues BLOCK verdict | CI workflow fails |
| Iris | Enriches quality dashboard with insights | `pnpm run dashboard:generate` |
| Greta | Analyzes flakiness reports | `pnpm run agents:greta` |
| Saxon | Analyzes coverage summary | `pnpm run agents:saxon` |

**Required:** `ANTHROPIC_API_KEY` environment variable.

```bash
pnpm run agents:felix    # triage latest test failures
pnpm run agents:percy    # review recent test-file diff
pnpm run agents:iris     # enrich the dashboard
pnpm run agents:greta    # analyze flakiness report
pnpm run agents:saxon    # analyze coverage
```

Agent findings are persisted as `AgentInsight` records — severity (`info` / `warning` / `critical`) is extracted from the output and the full structured result is stored alongside the summary.

---

## Documentation

- [Test Strategy](./docs/TEST_STRATEGY.md) — testing philosophy, layer definitions, quality gates
- [ADR-001: Mock injection over real infrastructure](./docs/decisions/ADR-001-mock-injection.md)
- [ADR-002: Vitest over Jest](./docs/decisions/ADR-002-vitest.md)
- [ADR-004: Publishable packages + pnpm migration](./docs/decisions/ADR-004-publishable-packages.md)

---

## Tech Stack

| Layer | Tool |
|---|---|
| Runtime | Node.js ≥ 22.5.0 |
| Language | TypeScript 5 |
| Unit/Integration | Vitest |
| E2E | Playwright |
| Coverage | V8 (via Vitest) |
| CI/CD | GitHub Actions |
| Dashboard | Vanilla HTML/JS (static) |
| AI Agents | @wutangbanger/claude-agents |
| Monorepo | pnpm workspaces |
