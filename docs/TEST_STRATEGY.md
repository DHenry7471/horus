# Horus — Test Strategy

**Author:** Staff SDET  
**Last Updated:** 2024  
**Status:** Active

---

## 1. Purpose

This document defines the quality engineering strategy for the Horus platform. It establishes the testing philosophy, layer boundaries, tooling decisions, and quality gates that apply to all engineers contributing to this codebase.

---

## 2. Testing Philosophy

### Shift Left
Quality is not a gate at the end of the pipeline — it is embedded at every stage:
- Requirements review includes testability analysis
- PRs cannot merge without tests at the appropriate layer
- Developers own unit tests; SDETs own integration and E2E strategy

### The Test Pyramid
We follow the classic test pyramid to maximize coverage while minimizing cost:

```
        /\
       /E2\      ← Minimal. Critical paths only. Playwright.
      /----\
     / Intg \    ← Service interaction tests. All mocks injected.
    /--------\
   /   Unit   \  ← Business logic. Pure functions. Fast feedback.
  /____________\
```

**Anti-pattern we avoid:** The Ice Cream Cone — heavy E2E, light unit tests. This leads to slow, flaky, expensive CI and poor developer feedback loops.

### No External Dependencies in Integration Tests
Integration tests in Horus use injected mocks for all external services. The `@horus/test-utils` library provides:
- `MockEventBus` — replaces Redis pub/sub, SQS, Kafka
- `MockRepository<T>` — replaces Postgres, MongoDB, DynamoDB
- `MockNotificationSender` — replaces email/SMS providers

This means integration tests run in milliseconds with zero infrastructure.

---

## 3. Layer Definitions

### Unit Tests (`tests/unit/`)
| Property       | Value                                          |
|----------------|------------------------------------------------|
| Scope          | Single class/function in isolation             |
| Dependencies   | None (pure functions) or mocked via vitest     |
| Speed          | < 500ms for entire suite                       |
| Written by     | Developer (with SDET review)                   |
| CI gate        | Blocks all merges                              |
| Coverage req.  | 80% line, 80% function, 75% branch             |

### Integration Tests (`tests/integration/`)
| Property       | Value                                          |
|----------------|------------------------------------------------|
| Scope          | Cross-service interaction via shared contracts |
| Dependencies   | All injected mocks from `@horus/test-utils`    |
| Speed          | < 5s for entire suite                          |
| Written by     | SDET                                           |
| CI gate        | Blocks merge if integration gate fails         |
| Coverage req.  | Scenario-based; tracked in dashboard           |

### E2E Tests (`tests/e2e/`)
| Property       | Value                                          |
|----------------|------------------------------------------------|
| Scope          | Critical user-facing paths only                |
| Dependencies   | Real running server; no external 3rd parties   |
| Speed          | < 2 minutes                                    |
| Written by     | SDET                                           |
| CI gate        | Required to pass before deploy                 |
| Rule           | If it can be tested at a lower level, it must  |

---

## 4. Naming Conventions

All tests follow the pattern:

```
given [precondition] when [action] then [expected outcome]
```

Examples:
- ✅ `given PENDING order when confirming then transitions to CONFIRMED`
- ✅ `given empty customerId when creating order then throws validation error`
- ❌ `test order creation` — too vague, doesn't communicate intent

---

## 5. AAA Pattern

Every test must follow Arrange → Act → Assert with inline comments:

```typescript
it('given valid request when creating order then persists with PENDING status', async () => {
  // Arrange
  const request = { customerId: 'c-001', items: [...] };

  // Act
  const result = await orderService.createOrder(request);

  // Assert
  expect(result.status).toBe(OrderStatus.PENDING);
});
```

Tests that combine multiple unrelated assertions are split into separate tests.

---

## 6. Quality Gates (CI Pipeline)

```
PR Opens
  └─► [Parallel] Lint + TypeCheck  (fail → block merge immediately)
  └─► [Parallel] Unit Tests        (fail → block merge)
       └─► Integration Tests       (fail → block merge)
            └─► E2E Tests          (fail → block deploy)
                 └─► Dashboard     (always → publish to GitHub Pages)
```

**Fast feedback target:** Unit + lint feedback within 60 seconds of push.

---

## 7. Flakiness Policy

A test is **flaky** if it passes on some runs and fails on others with the same code.

- Flaky tests are detected by the nightly scan (`.github/workflows/nightly-flakiness.yml`)
- A GitHub issue is automatically opened for any flaky test detected
- Flaky tests must be fixed or quarantined within 2 sprints
- A quarantined test is tagged `@flaky` and excluded from the CI gate while being fixed

**Root causes to investigate first:**
1. Shared mutable state between tests (fix: `beforeEach` reset)
2. Timing assumptions (fix: explicit awaits or event-driven assertions)
3. Order-dependent tests (fix: test isolation)

---

## 8. What We Don't Automate

Not everything should be automated. We apply cost/benefit analysis:

| Test type                         | Decision      | Reason                                     |
|-----------------------------------|---------------|--------------------------------------------|
| Visual regression (pixel-perfect) | Manual QA     | High maintenance cost, low failure signal  |
| Exploratory / edge-case discovery | Manual QA     | Requires human creativity                  |
| Smoke test after deploy           | E2E (2-3 max) | Highest confidence, lowest count           |
| Business logic validation         | Unit tests    | Cheapest, fastest, most precise            |
| Cross-service contract            | Integration   | Catches interface drift early              |

---

## 9. Metrics Tracked (Quality Dashboard)

| Metric             | Target     | Alert threshold |
|--------------------|------------|-----------------|
| Pass rate          | ≥ 97%      | < 90%           |
| Line coverage      | ≥ 80%      | < 70%           |
| Branch coverage    | ≥ 75%      | < 65%           |
| Flaky test count   | 0          | > 2             |
| Unit test duration | < 60s      | > 120s          |
| E2E duration       | < 2 min    | > 5 min         |

Dashboard is published to GitHub Pages on every merge to `main`.

---

## 10. References

- [ADR-001: Mock injection library over real infrastructure](./decisions/ADR-001-mock-injection.md)
- [ADR-002: Vitest over Jest for unit and integration tests](./decisions/ADR-002-vitest.md)
- Dunelm: [5 Habits of an Effective SDET](https://engineering.dunelm.com/5-habits-of-an-effective-sdet-0d5bdda63a9c)
