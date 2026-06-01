# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (pnpm workspaces — run from root)
pnpm install

# Type check (root — covers shared/* only)
pnpm run typecheck

# Lint
pnpm run lint

# Run tests by layer (run from example/ or via filter from root)
pnpm run test:unit          # Vitest unit tests → example/reports/unit-results.json
pnpm run test:integration   # Vitest integration tests → example/reports/integration-results.json
pnpm run test:e2e           # Playwright E2E (auto-starts server on :3000)
pnpm run test:all           # All three layers in sequence

# Unit + integration with V8 coverage (80/80/75 thresholds)
pnpm run test:coverage      # → example/reports/coverage/

# Quality dashboard
pnpm run dashboard:generate
pnpm run dashboard:serve

# AI agents (requires ANTHROPIC_API_KEY)
pnpm run agents:felix       # Triage latest test failures
pnpm run agents:percy       # Review recent test-file diff
pnpm run agents:iris        # Enrich dashboard with insights
pnpm run agents:greta       # Analyze flakiness report
pnpm run agents:saxon       # Analyze coverage summary
```

Test/example scripts run from the `example/` workspace. You can run them from root with:
```bash
pnpm run test:unit --filter @horus/example
```

Or directly from `example/`:
```bash
cd example && pnpm run test:unit
```

To run a single Vitest test file:
```bash
cd example && pnpm exec vitest run tests/unit/OrderService.test.ts
```

## Architecture

Horus is a **pnpm workspaces monorepo** with two publishable packages (`shared/`) and a private reference implementation (`example/`):

```
shared/contracts      (@horus/contracts)    — pure TypeScript interfaces; publishable to npm
shared/insight-store  (@horus/insight-store) — JSONL stores + ingestion CLI; publishable to npm
shared/test-utils     (@horus/test-utils)   — mock implementations; private, domain-coupled
example/
  services/order-service        — Express REST API + OrderService business logic
  services/notification-service — event-driven service; listens to order domain events
  tests/{unit,integration,e2e,contract} — test pyramid layers (NOT inside service packages)
  agents/run-agent.ts           — thin Anthropic API client
  quality-dashboard/            — static HTML dashboard generator
docs/                 — ADRs and strategy docs (repo-wide)
```

### Dependency rule — strictly enforced

```
production code  →  @horus/contracts  (interfaces)
@horus/test-utils  →  @horus/contracts  (implements interfaces)
tests  →  @horus/test-utils + @horus/contracts
```

Production services (`OrderService`, `NotificationService`) **never import `@horus/test-utils`**. Services accept `IRepository<T>` and `IEventBus` via constructor injection; tests supply mocks, production wires real implementations.

### Key interfaces (`@horus/contracts`)

- `IRepository<T extends { id: string }>` — CRUD over any entity
- `IEventBus` — `publish` / `subscribe` / `unsubscribeAll`
- `EventPayload` — `{ topic, data, timestamp, correlationId }`
- `HorusConfig` — `{ reportsDir, commitSha?, coverage? }` passed to all stores

### Cross-service communication pattern

`OrderService` publishes events (`order.created`, `order.confirmed`, `order.cancelled`). `NotificationService` subscribes via `registerEventHandlers()`. In integration tests, both services share the same `MockEventBus` instance — this is how cross-service interaction is verified without a real broker.

### Test layers

| Layer | Location | Tool | What it tests |
|---|---|---|---|
| Unit | `example/tests/unit/` | Vitest | Single class in isolation — pure business logic |
| Integration | `example/tests/integration/` | Vitest | Cross-service flow via injected mocks; zero network |
| E2E | `example/tests/e2e/` | Playwright | HTTP API against a real running server |

E2E tests use a thin `OrderApiClient` class (not a full Page Object, since the surface is REST). Playwright config auto-starts `example/services/order-service` via `webServer`; `BASE_URL` env var overrides the target in CI.

### Test conventions

- **Naming:** `given [precondition] when [action] then [expected outcome]`
- **Structure:** AAA pattern with explicit `// Arrange`, `// Act`, `// Assert` comments
- **Fixtures:** Use builder pattern — `anOrder().withStatus(OrderStatus.PENDING).build()`. Never construct objects by hand in tests.
- `MockEventBus` exposes `assertPublished(topic, predicate)` and `assertPublishedCount(topic, n)` for event assertions.

### AI agents

`example/agents/run-agent.ts` is a thin CLI wrapper around the `claude-agents` npm package. Agent system prompts are bundled into the package — no `CLAUDE_AGENTS_DIR` or separate checkout needed. Set `ANTHROPIC_API_KEY` to use any agent command. To call an agent programmatically, import `runAgent` directly from `claude-agents`.

### Path aliases (example/vitest.config.ts)

```
@horus/contracts  →  ../shared/contracts/src/index.ts
@horus/test-utils →  ../shared/test-utils/src/index.ts
@horus/insight-store → ../shared/insight-store/src/index.ts
```

These aliases are resolved by Vitest only. The `example/tsconfig.json` uses `paths` for the TypeScript compiler.
