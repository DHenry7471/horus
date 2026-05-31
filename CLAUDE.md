# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (npm workspaces — run from root)
npm install

# Type check
npm run typecheck

# Lint
npm run lint

# Run tests by layer
npm run test:unit          # Vitest unit tests → reports/unit-results.json
npm run test:integration   # Vitest integration tests → reports/integration-results.json
npm run test:e2e           # Playwright E2E (auto-starts server on :3000)
npm run test:all           # All three layers in sequence

# Unit + integration with V8 coverage (80/80/75 thresholds)
npm run test:coverage      # → reports/coverage/

# Quality dashboard
npm run dashboard:generate
npm run dashboard:serve

# AI agents (requires ANTHROPIC_API_KEY + CLAUDE_AGENTS_DIR)
npm run agents:felix       # Triage latest test failures
npm run agents:percy       # Review recent test-file diff
npm run agents:iris        # Enrich dashboard with insights
npm run agents:greta       # Analyze flakiness report
npm run agents:saxon       # Analyze coverage summary
```

To run a single Vitest test file:
```bash
npx vitest run tests/unit/OrderService.test.ts
```

## Architecture

Horus is an **npm workspaces monorepo** with two production services and a shared library layer:

```
shared/contracts   (@horus/contracts)   — pure TypeScript interfaces only; no implementations
shared/test-utils  (@horus/test-utils)  — mock implementations of those interfaces, for tests only
services/order-service                  — Express REST API + OrderService business logic
services/notification-service           — event-driven service; listens to order domain events
tests/{unit,integration,e2e}            — test pyramid layers (NOT inside service packages)
agents/run-agent.ts                     — thin Anthropic API client; loads agent prompts from CLAUDE_AGENTS_DIR
quality-dashboard/                      — static HTML dashboard generator
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

### Cross-service communication pattern

`OrderService` publishes events (`order.created`, `order.confirmed`, `order.cancelled`). `NotificationService` subscribes via `registerEventHandlers()`. In integration tests, both services share the same `MockEventBus` instance — this is how cross-service interaction is verified without a real broker.

### Test layers

| Layer | Location | Tool | What it tests |
|---|---|---|---|
| Unit | `tests/unit/` | Vitest | Single class in isolation — pure business logic |
| Integration | `tests/integration/` | Vitest | Cross-service flow via injected mocks; zero network |
| E2E | `tests/e2e/` | Playwright | HTTP API against a real running server |

E2E tests use a thin `OrderApiClient` class (not a full Page Object, since the surface is REST). Playwright config auto-starts `services/order-service` via `webServer`; `BASE_URL` env var overrides the target in CI.

### Test conventions

- **Naming:** `given [precondition] when [action] then [expected outcome]`
- **Structure:** AAA pattern with explicit `// Arrange`, `// Act`, `// Assert` comments
- **Fixtures:** Use builder pattern — `anOrder().withStatus(OrderStatus.PENDING).build()`. Never construct objects by hand in tests.
- `MockEventBus` exposes `assertPublished(topic, predicate)` and `assertPublishedCount(topic, n)` for event assertions.

### AI agents

`agents/run-agent.ts` calls the Anthropic API directly. It reads agent system prompts from markdown files in `CLAUDE_AGENTS_DIR` (defaults to `/tmp/claude_agents/agents`). The agent slug map is in `SLUG_ALIASES` at the top of that file. Set `ANTHROPIC_API_KEY` to use any agent command.

### Path aliases (vitest.config.ts)

```
@horus/contracts  →  shared/contracts/src/index.ts
@horus/test-utils →  shared/test-utils/src/index.ts
```

These aliases are resolved by Vitest only. The `tsconfig.json` uses project references for the TypeScript compiler.
