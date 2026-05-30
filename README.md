# 🔭 Horus — Quality Observatory

> *"The all-seeing eye over your test suite."*

Horus is a Staff SDET reference implementation demonstrating production-grade quality engineering across a TypeScript/Node.js microservice system. It is both a working system under test **and** the quality infrastructure around it.

[![CI](https://github.com/YOUR_USERNAME/horus/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/horus/actions/workflows/ci.yml)
[![Quality Dashboard](https://img.shields.io/badge/dashboard-live-orange)](https://YOUR_USERNAME.github.io/horus/)

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
├── quality-dashboard/          ← Dashboard generator + HTML observatory
├── shared/
│   └── test-utils/             ← Reusable mock injection library (@horus/test-utils)
├── .github/
│   └── workflows/
│       ├── ci.yml              ← Main quality gate pipeline
│       └── nightly-flakiness.yml ← Automated flakiness detection
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

# Generate quality dashboard
npm run dashboard:generate
npm run dashboard:serve
```

---

## CI Pipeline

```
Push / PR
  ├── [Parallel] Lint + TypeCheck  → blocks merge if fails
  ├── [Parallel] Unit Tests        → blocks merge if fails
  │        └── Integration Tests  → blocks merge if fails
  │                 └── E2E Tests → blocks deploy if fails
  └── (main only) Dashboard       → publishes to GitHub Pages
```

**Nightly:** The flakiness scan runs the full suite 3× and opens a GitHub issue for any non-deterministic tests.

---

## Quality Dashboard

The live dashboard is published to GitHub Pages on every merge to `main`.

**[View Dashboard →](https://dhenry7471.github.io/horus/)**

Tracks:
- Overall pass rate trend (last 30 runs)
- Per-layer pass rates (unit / integration / E2E)
- Code coverage vs thresholds
- Test pyramid distribution health
- Flakiness report from nightly scans

---

## @horus/test-utils

The shared mock injection library is the infrastructure investment that makes clean integration tests possible.

| Export                  | Replaces                          |
|-------------------------|-----------------------------------|
| `MockEventBus`          | Redis pub/sub, SQS, Kafka         |
| `MockRepository<T>`     | Postgres, MongoDB, DynamoDB       |
| `MockNotificationSender`| Email/SMS providers               |
| `OrderBuilder`          | Manual fixture construction       |
| `NotificationBuilder`   | Manual fixture construction       |

---

## Documentation

- [Test Strategy](./docs/TEST_STRATEGY.md) — testing philosophy, layer definitions, quality gates
- [ADR-001: Mock injection over real infrastructure](./docs/decisions/ADR-001-mock-injection.md)
- [ADR-002: Vitest over Jest](./docs/decisions/ADR-002-vitest.md)

---

## Tech Stack

| Layer       | Tool                     |
|-------------|--------------------------|
| Language    | TypeScript 5             |
| Unit/Intg   | Vitest                   |
| E2E         | Playwright               |
| Coverage    | V8 (via Vitest)          |
| CI/CD       | GitHub Actions           |
| Dashboard   | Vanilla HTML/JS (static) |
| Monorepo    | npm workspaces           |
