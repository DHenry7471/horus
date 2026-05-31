# 🔭 Horus — Quality Observatory

> *"The all-seeing eye over your test suite."*

Horus is a Staff SDET reference implementation demonstrating production-grade quality engineering across a TypeScript/Node.js microservice system. It is both a working system under test **and** the quality infrastructure around it.

[![CI](https://github.com/YOUR_USERNAME/horus/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/horus/actions/workflows/ci.yml)
[![Quality Dashboard](https://img.shields.io/badge/dashboard-live-orange)](https://dhenry7471.github.io/horus/dashboard/)

---

## What's Inside

```
horus/
├── services/
│   ├── order-service/          ← Order domain service (Express + business logic)
│   └── notification-service/  ← Notification service (event-driven)
├── tests/
│   ├── unit/                   ← Pure business logic tests (Vitest)
│   ├── integration/            ← Cross-service tests with injected mocks (Vitest)
│   └── e2e/                    ← Critical path smoke tests (Playwright)
├── agents/
│   ├── run-agent.ts            ← CLI wrapper for @wutangbanger/claude-agents
│   └── check-event-contracts.ts ← Static event contract coverage analyzer
├── quality-dashboard/          ← Dashboard generator + HTML observatory
├── shared/
│   ├── contracts/              ← Pure TypeScript interfaces (@horus/contracts)
│   ├── test-utils/             ← Reusable mock injection library (@horus/test-utils)
│   └── insight-store/          ← Observability persistence layer (@horus/insight-store)
├── reports/
│   ├── agent-insights/         ← JSONL: one file per agent, persistent findings
│   ├── test-runs/              ← JSONL: per-test run history for flakiness tracking
│   └── coverage-history.jsonl  ← Coverage snapshots for drift detection
├── .github/
│   └── workflows/
│       ├── ci.yml                  ← Main quality gate pipeline
│       ├── nightly-flakiness.yml   ← Automated flakiness detection
│       ├── percy-pr-review.yml     ← AI test-change review on PRs
│       └── felix-triage.yml        ← AI failure triage on CI failure
└── docs/
    ├── TEST_STRATEGY.md        ← Org-wide testing standards
    └── decisions/              ← Architecture Decision Records (ADRs)
```

---

## Core Principles

### 1. The Test Pyramid
Tests are distributed correctly — not the "ice cream cone" anti-pattern:
- **Unit tests** (majority) — pure business logic, zero I/O, < 60s suite
- **Integration tests** — cross-service interaction via injected mocks
- **E2E tests** (minimal) — critical paths only via Playwright

### 2. No External Dependencies in Integration Tests
The `@horus/test-utils` library provides injectable mocks for all infrastructure:

```typescript
import { MockEventBus, MockRepository, anOrder } from '@horus/test-utils';

const eventBus = new MockEventBus();
const repo = new MockRepository<Order>();
const service = new OrderService(repo, eventBus); // ← inject, never instantiate internally
```

### 3. AAA Pattern + Descriptive Naming
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

### 4. Quality as a Time Series, Not a Snapshot
Pass/fail at a point in time is not enough. Horus tracks quality signals over time:
- **Flakiness rate** — computed from run history, not just the last run
- **Coverage drift** — delta between runs surfaces degradation that thresholds miss
- **Agent insights** — AI findings are persisted to JSONL, not lost to stdout
- **Event contract gaps** — statically detected before they reach production

---

## Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm run test:all

# Unit tests only (fastest feedback)
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests (requires running server)
npm run test:e2e

# Check event contract coverage (exits 1 if gaps found — CI-gateable)
npm run check:event-contracts

# Generate quality dashboard
npm run dashboard:generate
npm run dashboard:serve
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

PR touches tests/**
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

## @horus/insight-store

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
│   ├── unit.jsonl        ← per-test run history (written by HorusVitestReporter)
│   └── integration.jsonl
└── coverage-history.jsonl ← coverage snapshots per run
```

Key exports:

| Export | Purpose |
|---|---|
| `AgentInsightStore` | Append/query agent findings by agent, severity, or time window |
| `TestRunStore` | Per-test run history; feeds flakiness computation |
| `HorusVitestReporter` | Vitest reporter plugin — auto-writes `TestRunRecord` after each test |
| `CoverageStore` | Coverage snapshots + delta between runs |
| `computeFlakeScores` | Pure function: `TestRunRecord[]` → `FlakeScore[]` ranked by flake rate |
| `analyzeEventContracts` | Static analyzer: scans source and tests for publish/subscribe gaps |

---

## @horus/test-utils

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
npm run check:event-contracts         # print report, exit 1 if gaps found
npm run check:event-contracts:persist # same + write to AgentInsightStore
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
| Percy | Reviews test file changes on PRs | PR touches `tests/**` or `*.test.ts` |
| Felix | Triages CI failures, issues BLOCK verdict | CI workflow fails |
| Iris | Enriches quality dashboard with insights | `npm run dashboard:generate` |
| Greta | Analyzes flakiness reports | `npm run agents:greta` |
| Saxon | Analyzes coverage summary | `npm run agents:saxon` |

**Required:** `ANTHROPIC_API_KEY` environment variable.

```bash
npm run agents:felix    # triage latest test failures
npm run agents:percy    # review recent test-file diff
npm run agents:iris     # enrich the dashboard
npm run agents:greta    # analyze flakiness report
npm run agents:saxon    # analyze coverage
```

Agent findings are persisted as `AgentInsight` records — severity (`info` / `warning` / `critical`) is extracted from the output and the full structured result is stored alongside the summary.

---

## Documentation

- [Test Strategy](./docs/TEST_STRATEGY.md) — testing philosophy, layer definitions, quality gates
- [ADR-001: Mock injection over real infrastructure](./docs/decisions/ADR-001-mock-injection.md)
- [ADR-002: Vitest over Jest](./docs/decisions/ADR-002-vitest.md)

---

## Tech Stack

| Layer | Tool |
|---|---|
| Language | TypeScript 5 |
| Unit/Integration | Vitest |
| E2E | Playwright |
| Coverage | V8 (via Vitest) |
| CI/CD | GitHub Actions |
| Dashboard | Vanilla HTML/JS (static) |
| AI Agents | @wutangbanger/claude-agents |
| Monorepo | npm workspaces |
