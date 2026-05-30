# ADR-002: Vitest Over Jest for Unit and Integration Tests

**Status:** Accepted  
**Date:** 2024  
**Deciders:** Staff SDET, Engineering Leads

---

## Context

Horus is a TypeScript/Node.js monorepo. We need a test runner for unit and integration tests. The main candidates are Jest (the incumbent in the Node ecosystem) and Vitest (the newer, Vite-native alternative).

---

## Decision

We use **Vitest**.

---

## Rationale

| Concern                  | Jest                              | Vitest                            |
|--------------------------|-----------------------------------|-----------------------------------|
| TypeScript support       | Requires Babel or ts-jest config  | Native — no transform config      |
| ESM support              | Requires `--experimental-vm-modules` workaround | Native ESM support   |
| Speed                    | Single-threaded by default        | Multi-threaded (Vite + workers)   |
| Config                   | `jest.config.ts` + `babel.config` | Single `vitest.config.ts`         |
| API compatibility        | —                                 | `describe/it/expect` compatible   |
| Watch mode               | Moderate                          | Instant HMR-style rerun           |
| Coverage                 | Istanbul                          | V8 (native, zero-overhead)        |

The most significant factor is **native TypeScript and ESM support**. Our codebase uses `"module": "NodeNext"` in `tsconfig.json`. Jest's ESM story requires workarounds that add complexity and maintenance burden. Vitest handles this transparently.

---

## Consequences

**Positive:**
- Zero transform configuration — TypeScript just works
- Faster test runs, especially in watch mode during development
- V8 coverage is more accurate than Istanbul transform-based coverage
- Same `describe/it/expect` API — no learning curve

**Negative:**
- Smaller ecosystem than Jest (fewer third-party matchers/reporters)
- Mitigation: Vitest supports Jest matchers; any Jest reporter adapter works
- Some Vitest-specific APIs differ from Jest (e.g. `vi.fn()` vs `jest.fn()`)

---

## Note on Playwright

Playwright is used separately for E2E tests and is not affected by this decision. Playwright has its own test runner (`@playwright/test`) which is the right tool for browser-based tests.

---

## Related

- [ADR-001: Mock injection](./ADR-001-mock-injection.md)
- [vitest.config.ts](../../vitest.config.ts)
