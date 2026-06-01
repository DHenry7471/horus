# ADR-001: Mock Injection Library Over Real Infrastructure for Integration Tests

**Status:** Accepted  
**Date:** 2024  
**Deciders:** Staff SDET, Engineering Leads

---

## Context

Integration tests for Horus need to verify cross-service interactions between OrderService and NotificationService through an event bus. The question was whether integration tests should:

**Option A:** Spin up real infrastructure (Redis, Postgres) via Docker Compose / Testcontainers  
**Option B:** Inject in-memory mocks that implement the same interfaces

---

## Decision

We use **Option B — injected in-memory mocks** via the `@wutangbanger/horus-test-utils` shared library.

Production services depend on interfaces (`IEventBus`, `IRepository<T>`, `INotificationSender`), not concrete implementations. Tests inject mock implementations of those interfaces.

---

## Rationale

| Concern            | Real Infrastructure             | Injected Mocks                  |
|--------------------|---------------------------------|---------------------------------|
| Speed              | 10–60s (container startup)      | < 500ms                         |
| Reliability        | Docker daemon, port conflicts   | Zero — pure in-memory           |
| CI complexity      | Docker-in-Docker, networking    | None                            |
| Feedback loop      | Slow                            | Instant                         |
| What it tests      | Infrastructure + logic          | Logic only                      |
| Appropriate layer  | Infra/contract tests            | Integration tests                |

The integration test layer is not the right place to test that Redis pub/sub works — that is Redis's job. Our job is to test that `OrderService` and `NotificationService` interact correctly through the event bus contract.

Real infrastructure testing belongs in:
- Infrastructure-specific tests (e.g. testing the real Redis adapter in isolation)
- E2E tests (which hit a real running server)

---

## Consequences

**Positive:**
- Integration tests run in < 1s — developers get instant feedback
- Zero flakiness from Docker networking, port conflicts, or container startup races
- Tests clearly document the interface contracts between services
- `@wutangbanger/horus-test-utils` becomes a force multiplier — new services adopt the same mocks

**Negative:**
- We need to maintain the mock implementations in sync with real adapters
- Bugs in the real adapter (e.g. Redis serialization edge cases) won't be caught at this layer
- Mitigation: real adapter implementations are tested in isolation against their specific infrastructure

---

## Related

- [ADR-002: Vitest over Jest](./ADR-002-vitest.md)
- [TEST_STRATEGY.md — Integration Tests](../TEST_STRATEGY.md#integration-tests)
