# ADR-003: Test Pyramid Layer Counts and Thresholds

**Status:** Accepted  
**Date:** 2024  
**Deciders:** Staff SDET, Engineering Leads

---

## Context

Every test pyramid is a bet on where bugs actually live and what it costs to find them. Choosing the wrong distribution leads to one of two failure modes:

- **Ice cream cone** (heavy E2E, light unit): slow CI, high flake rate, poor developer feedback loops, expensive to maintain.
- **Inverted pyramid with no integration layer**: fast CI but blind to cross-service contract drift — bugs get caught in production instead of the pipeline.

We needed to define explicit counts and rationale for each layer so that future changes to the distribution are deliberate decisions, not drift.

---

## Decision

### Layer distribution

| Layer       | Current count | Target ceiling | Tool       |
|-------------|--------------|----------------|------------|
| Unit        | ~20          | Unbounded      | Vitest     |
| Integration | ~5           | ~20            | Vitest     |
| E2E         | ~3           | 10             | Playwright |

The pyramid is intentionally wide at unit and narrow at E2E. Integration tests occupy a deliberate middle band — enough to catch contract drift, few enough to stay fast.

### Coverage thresholds (unit + integration only)

| Metric     | Threshold | Rationale                                                    |
|------------|-----------|--------------------------------------------------------------|
| Lines      | 80%       | High enough to catch regressions; headroom for untestable paths (e.g. error handlers) |
| Functions  | 80%       | Matches lines — same rationale                               |
| Branches   | 75%       | Slightly lower; exhaustive branch coverage has diminishing returns in CRUD services |
| Statements | 80%       | Consistent with lines                                        |

Coverage is measured against `services/**` only. Horus platform code (insight-store, contracts, test-utils) is excluded — those modules have their own tests but are tooling, not the system under observation.

---

## Rationale

### Why so many unit tests?

Unit tests are the cheapest feedback loop: millisecond execution, no infrastructure, precise failure messages. Every business logic rule — state machine transitions, validation, error paths — has at least one unit test. The cost of adding a unit test is near zero; the cost of *not* having one is a production bug that takes hours to trace.

Rule: if a bug can be caught at the unit level, it must be caught there.

### Why a bounded integration layer?

Integration tests verify that two services communicate correctly through shared contracts. They are not a repetition of unit tests — they exist specifically to catch:

1. Event payload shape mismatches between publisher and subscriber
2. Repository interface drift (a save that unit tests assume succeeds, but fails against a real schema)
3. Handler registration bugs (a subscriber that never attaches)

The ceiling of ~20 is deliberate. Beyond that, the integration suite becomes a parallel unit suite — slower, harder to isolate failures, and redundant with what unit tests already cover.

### Why so few E2E tests?

E2E tests are the most expensive tests to write, run, and maintain:
- They require a running server (startup time)
- They are the most likely to flake (timing, port conflicts, test ordering)
- A failure tells you *something is broken* but rarely *what* — debugging requires dropping down to unit or integration

We use E2E tests for exactly one purpose: verifying that the HTTP surface works end-to-end. They are smoke tests, not regression tests. The ceiling of 10 forces prioritization: if you want to add an E2E test, something else must be retired or the scenario must be proven untestable at a lower level.

### What changes at scale?

At higher service counts (10+ services, 50+ engineers), the distribution shifts in two ways:

**More integration tests, not more E2E.** Cross-service surface area grows. Contract tests (Pact message pacts) replace integration tests that span team boundaries — each team owns consumer and provider verification independently. The integration suite stays bounded per service; total contract test count grows with service count.

**Mutation testing replaces coverage thresholds.** At scale, 80% line coverage is a weak signal — it tells you which lines ran, not which behaviors were verified. Mutation testing (e.g. Stryker) reveals tests that pass even when logic is broken. We would add a mutation score threshold (target: >70%) and relax the line coverage requirement in favour of it.

**Flakiness budget becomes a hard limit.** The nightly flakiness report currently surfaces issues for manual triage. At scale, a flakiness budget (e.g. zero flaky tests allowed in CI gate) would be enforced automatically, with automatic quarantine + issue creation on detection.

---

## Consequences

- New tests at the E2E layer require justification: why can't this be tested at integration or unit level?
- Coverage thresholds are enforced in CI (`vitest --coverage` with `thresholds` in `vitest.config.ts`) and block merges if not met.
- The integration ceiling is a soft target, not a hard gate — but the dashboard tracks integration test count over time so drift is visible.
- Any change to these thresholds or ceilings requires a new ADR superseding this one.

---

## References

- [ADR-001: Mock injection library over real infrastructure](./ADR-001-mock-injection.md)
- [ADR-002: Vitest over Jest](./ADR-002-vitest.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md) — operational detail for each layer
