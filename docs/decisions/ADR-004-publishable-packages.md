# ADR-004: Extract `@horus/contracts` and `@horus/insight-store` as Publishable Packages

**Status:** Proposed  
**Date:** 2026-05-31  
**Package Manager:** pnpm (replaces npm workspaces)

---

## Context

Horus is currently a closed monorepo reference implementation. All packages (`@horus/contracts`, `@horus/insight-store`, `@horus/test-utils`) are resolved via local path aliases in `vitest.config.ts` and `tsconfig.json`. No package has a build step, published exports, or versioning strategy.

To make Horus usable in any external project, these packages must be extractable, buildable, and installable via the npm registry.

---

## Decision

Extract `@horus/contracts` and `@horus/insight-store` as standalone publishable packages. Keep the order-service/notification-service domain code in the monorepo as a live reference implementation — it is not a deliverable.

---

## Package Manager: pnpm

The repo standardizes on **pnpm** in place of npm workspaces. This decision is made alongside the publishable-package extraction because the migration is the lowest-friction time to make it — there's no production lockfile to preserve and the `example/` restructure already touches every `package.json`.

**Why pnpm over npm:**

- `workspace:*` protocol expresses intra-monorepo deps explicitly — `@horus/example` declaring `"@horus/insight-store": "workspace:*"` makes the relationship machine-readable, not implicit
- Strict hoisting by default prevents phantom dependency bugs (a package accidentally importing something not in its own `package.json` because npm hoisted it to root `node_modules`)
- Content-addressable store means `node_modules` across workspaces share disk — significant when `vitest`, `playwright`, and `typescript` would otherwise be duplicated per package
- `pnpm publish` honors the `workspace:*` → real semver rewrite on pack, so published packages reference real npm versions, not workspace paths

**Migration steps (Phase 1 — done first):**

```bash
# Remove npm lockfile
rm package-lock.json

# Install pnpm (if not present)
corepack enable && corepack prepare pnpm@latest --activate

# Add pnpm workspace config (replaces "workspaces" field in package.json)
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'shared/*'
  - 'example'
EOF

# Remove "workspaces" field from root package.json (pnpm reads pnpm-workspace.yaml)
# Install — generates pnpm-lock.yaml
pnpm install

# Verify the store linked correctly
pnpm list -r
```

**`engines` field:** Add to root `package.json` to enforce pnpm for all contributors:

```json
"engines": {
  "node": ">=22.5.0",
  "pnpm": ">=9.0.0"
},
"packageManager": "pnpm@9.x.x"
```

**CI update:** Replace `npm ci` with `pnpm install --frozen-lockfile`. Commit `pnpm-lock.yaml`, delete `package-lock.json` from `.gitignore` exceptions if present.

**`.npmrc` at repo root:**

```ini
strict-peer-dependencies=false
auto-install-peers=true
```

`strict-peer-dependencies=false` avoids install failures when `vitest`'s own peer graph is partially satisfied (common during version bumps). Flip it to `true` once the dep tree is clean.

---

## Scope

### What gets published

| Package | Role | Consumers |
|---|---|---|
| `@horus/contracts` | Pure TypeScript interfaces, zero runtime deps | `@horus/insight-store`, user production code |
| `@horus/insight-store` | JSONL stores, post-run ingestion script, flakiness/coverage analytics | Any project's CI pipeline, regardless of test runner |

### What stays internal

`@horus/test-utils` — `MockEventBus`, `MockRepository`, `builders.ts` — is domain-coupled (Order, Notification). If a consuming project wants mocks, they implement `IRepository<T>` and `IEventBus` themselves. The interfaces are the contract.

---

## Test Runner Integration Strategy

`HorusVitestReporter` is **not** the primary integration path — it is a convenience for Vitest users only. The recommended approach is a **post-run ingestion script** that runs after the test suite completes and parses the JSON output that any test runner can emit.

### Why post-run ingestion over a reporter

- Zero coupling to Vitest. Works with Jest, Mocha, Pytest, or anything else that produces JSON output.
- No changes to `vitest.config.ts` required. CI runs the test command, then runs the ingestion script as a separate step.
- Easier to reason about — data flows in one direction, after tests finish, not wired into the runner lifecycle.
- Simpler to test: the ingestion script is a pure function over a JSON file.

### Recommended ingestion script

Add `shared/insight-store/src/ingest.ts` as a CLI entry point:

```ts
#!/usr/bin/env node
/**
 * horus-ingest
 *
 * Reads a Vitest or Jest JSON reporter output file and appends a TestRunRecord
 * to the TestRunStore for each test result.
 *
 * Usage:
 *   horus-ingest --file reports/unit-results.json --layer unit
 *   horus-ingest --file reports/integration-results.json --layer integration
 *
 * Compatible with: Vitest (--reporter=json), Jest (--json)
 */

import { TestRunStore } from './TestRunStore.js';
import { TestRunRecord } from '@horus/contracts';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import crypto from 'node:crypto';

const { values } = parseArgs({
  options: {
    file:      { type: 'string' },
    layer:     { type: 'string' },
    reportsDir: { type: 'string', default: './reports' },
  },
});

const raw = JSON.parse(readFileSync(values.file!, 'utf8'));
const store = new TestRunStore({ reportsDir: values.reportsDir! });
const commitSha = process.env.GITHUB_SHA ?? 'local';
const layer = (values.layer ?? 'unit') as TestRunRecord['layer'];

// Normalize Vitest and Jest JSON shapes to TestRunRecord
const tests = raw.testResults               // Jest
  ?? raw.files?.flatMap((f: any) => f.tests) // Vitest
  ?? [];

for (const t of tests) {
  const record: TestRunRecord = {
    id:         crypto.randomUUID(),
    testName:   t.fullName ?? t.name,
    layer,
    runAt:      new Date().toISOString(),
    passed:     (t.status ?? t.state) === 'passed',
    durationMs: Math.round(t.duration ?? 0),
    retries:    t.retryCount ?? 0,
    commitSha,
  };
  await store.append(record);
}

console.log(`Ingested ${tests.length} test records → ${values.reportsDir}/test-runs/${layer}.jsonl`);
```

Export it from `package.json` as a bin:

```json
"bin": {
  "horus-ingest": "./dist/ingest.js"
}
```

### Consumer CI usage (any test runner)

```yaml
# .github/workflows/ci.yml
- name: Run tests
  run: pnpm run test:unit && pnpm run test:integration

- name: Ingest results into Horus
  run: |
    pnpm exec horus-ingest --file reports/unit-results.json --layer unit
    pnpm exec horus-ingest --file reports/integration-results.json --layer integration
```

### HorusVitestReporter — kept as an opt-in convenience

`HorusVitestReporter` remains in `@horus/insight-store` for Vitest users who prefer zero-config inline capture. It is documented as secondary to the ingestion script and carries a note that the Vitest Reporter API is subject to breaking changes between major versions.

---

## Target Directory Layout

```
horus/
├── shared/                        ← publishable packages
│   ├── contracts/
│   ├── insight-store/
│   └── test-utils/
├── example/                       ← reference implementation (private)
│   ├── services/
│   │   ├── order-service/
│   │   └── notification-service/
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── contract/
│   │   └── e2e/
│   ├── agents/
│   ├── quality-dashboard/
│   ├── package.json               ← example-scoped scripts + devDeps
│   ├── vitest.config.ts
│   ├── playwright.config.ts
│   └── tsconfig.json
├── docs/                          ← ADRs and strategy docs (repo-wide)
│   └── decisions/
├── pnpm-workspace.yaml            ← NEW: replaces "workspaces" in package.json
├── .npmrc                         ← NEW: pnpm peer dep settings
├── package.json                   ← root: orchestration scripts only
├── tsconfig.json                  ← root: compiler baseline
└── CLAUDE.md
```

---

## Work Breakdown

### Phase 1 — pnpm migration (~1 hour)

```bash
# Remove npm lockfile
rm package-lock.json

# Install pnpm (if not present)
corepack enable && corepack prepare pnpm@9.15.4 --activate

# Create pnpm workspace config
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'shared/*'
  - 'example'
EOF

# Remove "workspaces" field from root package.json (pnpm reads pnpm-workspace.yaml)
# Add engines.pnpm and packageManager fields to root package.json
# Install — generates pnpm-lock.yaml
pnpm install

# Verify the store linked correctly
pnpm list -r
```

---

### Phase 2 — Restructure to `example/` (1 day)

**2.1 — Move files**

```bash
mkdir -p example
git mv services         example/services
git mv tests            example/tests
git mv agents           example/agents
git mv quality-dashboard example/quality-dashboard
```

`docs/` stays at root — ADRs and `TEST_STRATEGY.md` describe the whole project, not just the example domain.

**2.2 — Create `example/package.json`**

Extract all example-specific scripts and devDependencies from root into `example/package.json`:

```json
{
  "name": "@horus/example",
  "private": true,
  "type": "module",
  "scripts": {
    "test:unit":              "vitest run tests/unit --reporter=json --outputFile=reports/unit-results.json",
    "test:integration":       "vitest run tests/integration --reporter=json --outputFile=reports/integration-results.json",
    "test:e2e":               "playwright test tests/e2e",
    "test:contract":          "vitest run tests/contract/consumer.order-notification.test.ts && vitest run tests/contract/provider.order-service.test.ts",
    "test:all":               "pnpm run test:unit && pnpm run test:integration && pnpm run test:contract && pnpm run test:e2e",
    "test:coverage":          "mkdir -p reports && vitest run tests/unit tests/integration --coverage --reporter=json --outputFile=reports/unit-results.json",
    "dashboard:generate":     "tsx quality-dashboard/src/generate.js",
    "dashboard:serve":        "pnpm dlx serve quality-dashboard/dist",
    "agents:felix":           "tsx agents/run-agent.ts felix \"$(cat reports/unit-results.json reports/integration-results.json 2>/dev/null | jq -sc '.')\"",
    "flakiness:analyze":      "tsx agents/generate-flakiness-report.ts",
    "agents:greta":           "pnpm run flakiness:analyze && tsx agents/run-agent.ts greta \"$(cat reports/flakiness-report.json)\"",
    "agents:iris":            "tsx agents/run-agent.ts iris \"$(cat quality-dashboard/dist/history.json 2>/dev/null || echo '{\"runs\":[]}')\"",
    "agents:percy":           "tsx agents/run-agent.ts percy \"$(git diff HEAD~1 -- 'tests/**' '**/*.test.ts' '**/*.spec.ts' 2>/dev/null)\"",
    "agents:saxon":           "tsx agents/run-agent.ts saxon \"$(cat reports/coverage/coverage-summary.json 2>/dev/null || echo '{}')\"",
    "check:event-contracts":  "tsx agents/check-event-contracts.ts",
    "check:event-contracts:persist": "tsx agents/check-event-contracts.ts --persist"
  },
  "dependencies": {
    "@horus/contracts":     "workspace:*",
    "@horus/insight-store": "workspace:*"
  },
  "devDependencies": {
    "@playwright/test":                "^1.44.0",
    "@types/express":                  "^4.17.21",
    "@types/node":                     "^20.0.0",
    "@vitest/coverage-v8":             "^4.1.7",
    "@wutangbanger/claude-agents":     "^1.1.0",
    "express":                         "^4.19.0",
    "tsx":                             "^4.11.0",
    "vitest":                          "^4.1.7"
  }
}
```

Root `package.json` shrinks to workspace orchestration only:

```json
{
  "name": "horus",
  "private": true,
  "type": "module",
  "scripts": {
    "build":     "pnpm run build --filter './shared/*'",
    "typecheck": "tsc --noEmit",
    "lint":      "eslint . --ext .ts --no-eslintrc --config .eslintrc.cjs",
    "test:all":  "pnpm run test:all --filter @horus/example"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser":        "^7.0.0",
    "eslint":                           "^8.57.0",
    "typescript":                       "^5.4.0"
  },
  "engines": {
    "node": ">=22.5.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.15.4"
}
```

**2.3 — Create `example/tsconfig.json`**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "paths": {
      "@horus/contracts":     ["../shared/contracts/src/index.ts"],
      "@horus/test-utils":    ["../shared/test-utils/src/index.ts"],
      "@horus/insight-store": ["../shared/insight-store/src/index.ts"]
    }
  },
  "include": ["services/**/*", "tests/**/*", "agents/**/*", "quality-dashboard/**/*"]
}
```

Root `tsconfig.json` `include` shrinks to `["shared/**/*"]` and adds `"references"` pointing at `example/`.

**2.4 — Move and update `vitest.config.ts` and `playwright.config.ts`**

Move both configs into `example/`. Update alias paths one level up (`../shared/...`). The `HorusVitestReporter` import stays as-is — it resolves via the workspace symlink and matches exactly what a consumer would write post-publish.

Update `playwright.config.ts` webServer command:

```ts
command: 'pnpm run start --filter services/order-service',
```

**2.5 — Grep for path drift and fix**

```bash
grep -r "\.\./services\|\.\./tests" example/ --include="*.ts" --include="*.js"
```

Any hits need updating to `./services` / `./tests` since they're now siblings inside `example/`.

**2.6 — Update `CLAUDE.md`**

Update architecture diagram and all commands to reflect `example/` layout and pnpm. Commands now run as `pnpm run <script> --filter @horus/example` from root, or directly from `example/`.

**2.7 — Update GitHub Actions workflows**

Four workflows need updating: `ci.yml`, `felix-triage.yml`, `nightly-flakiness.yml`, `percy-pr-review.yml`.

Three categories of change apply to every workflow:

1. **pnpm setup** — replace `cache: 'npm'` + `npm ci` with the pnpm setup block:

```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 9.15.4

- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: 'pnpm'

- name: Install dependencies
  run: pnpm install --frozen-lockfile
```

2. **`working-directory: example`** — any step that runs scripts touching `agents/`, `quality-dashboard/`, `reports/`, or test commands moves into the `example/` workspace. Steps that only call `actions/checkout` or pnpm setup stay at root.

3. **Script commands** — `npm run <x>` → `pnpm run <x>`, `npx tsx` → `pnpm exec tsx`.

Specific changes per workflow:

`ci.yml` — lint/typecheck steps stay at root (ESLint and tsc run from root). All test steps, coverage upload paths, dashboard generate, and the trend history restore path get `working-directory: example`. Update the restore path:

```yaml
# before
git show origin/gh-pages:dashboard/history.json > quality-dashboard/dist/history.json

# after
git show origin/gh-pages:dashboard/history.json > example/quality-dashboard/dist/history.json
```

`felix-triage.yml` — all `npm run` and `npx tsx` calls get `working-directory: example`. Artifact download paths (`reports/`) remain relative to the working directory so no path changes needed there.

`nightly-flakiness.yml` — test run steps and the flakiness analyzer step get `working-directory: example`. The `deploy flakiness report` git step runs at root (it's operating on the `gh-pages` branch, not the workspace).

`percy-pr-review.yml` — the diff build step stays at root (git diff is repo-wide). The Percy agent run step gets `working-directory: example`.

**2.8 — Smoke test**

```bash
pnpm install
pnpm run build
pnpm run test:unit --filter @horus/example
pnpm run test:integration --filter @horus/example
```

---

### Phase 3 — Pre-flight audit (1 day)

**3.1 — Identify all hardcoded assumptions to break**

- `CoverageStore` hardcodes thresholds (`lines: 80, functions: 80, branches: 75`). These must move into a `HorusConfig` object passed at construction time.
- `HorusVitestReporter` reads `process.env.GITHUB_SHA`. Fine as a default, but consumers should be able to pass `commitSha` explicitly via config.
- `vitest.config.ts` imports `HorusVitestReporter` from a local path. After publishing, this becomes a standard registry import — the config in the reference impl needs to update to match what a real consumer would write.
- `tsconfig.json` uses `paths` aliases for all three packages. Post-publish, only the internal reference impl uses aliases; a consumer imports from the registry.

**3.2 — Define `HorusConfig`**

```ts
// proposed shape — goes into @horus/contracts
export interface HorusConfig {
  /** Directory where all JSONL report files are written. Default: './reports' */
  reportsDir: string;
  /** Git SHA for test run records. Default: process.env.GITHUB_SHA ?? 'local' */
  commitSha?: string;
  /** Coverage thresholds for delta/belowThreshold calculation */
  coverage?: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
}
```

All stores and the reporter accept `HorusConfig` instead of bare `reportsDir: string`.

---

### Phase 4 — Build infrastructure for `@horus/contracts` (1 day)

**4.1 — Add `tsconfig.build.json`**

`contracts` is interfaces-only, so the build is trivial — just `tsc`. Add a `tsconfig.build.json` that emits to `dist/`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

**4.2 — Update `package.json`**

```json
{
  "name": "@horus/contracts",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "clean": "rm -rf dist"
  }
}
```

**4.3 — Add `HorusConfig` to `src/index.ts`**

**4.4 — Verify: `pnpm run build` from `shared/contracts/` emits clean `dist/`**

---

### Phase 5 — Build infrastructure for `@horus/insight-store` (1–2 days)

**5.1 — Add `tsconfig.build.json`**

Same pattern as contracts. `@horus/contracts` resolves via the workspace symlink in dev, and from the registry for consumers.

**5.2 — Update `package.json`**

```json
{
  "name": "@horus/insight-store",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "dependencies": {
    "@horus/contracts": "^1.0.0"
  },
  "peerDependencies": {
    "vitest": ">=1.0.0 <5.0.0"
  },
  "peerDependenciesMeta": {
    "vitest": { "optional": true }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "clean": "rm -rf dist"
  }
}
```

`vitest` is an optional peer dep — a consumer who only wants `AgentInsightStore` or `CoverageStore` shouldn't be forced to install Vitest.

**5.3 — Apply `HorusConfig` to all stores and the reporter**

- `AgentInsightStore(config: HorusConfig)` — uses `config.reportsDir`
- `TestRunStore(config: HorusConfig)` — uses `config.reportsDir`
- `CoverageStore(config: HorusConfig)` — uses `config.reportsDir` + `config.coverage` thresholds (fallback to 80/80/75/80)
- `HorusVitestReporter(config: HorusConfig)` — uses `config.reportsDir` + `config.commitSha ?? process.env.GITHUB_SHA ?? 'local'`

**5.4 — Add `ingest.ts` CLI entry point**

Add `shared/insight-store/src/ingest.ts` as described in the Integration Strategy section above. Export from `index.ts` and register in `package.json` `bin`:

```json
"bin": {
  "horus-ingest": "./dist/ingest.js"
}
```

**5.5 — Verify: `pnpm run build` from `shared/insight-store/` emits clean `dist/` including `ingest.js`**

---

### Phase 6 — Update the reference implementation (0.5 days)

**6.1 — Switch `example/` to the post-run ingestion script**

Remove `HorusVitestReporter` from `example/vitest.config.ts`. Add ingestion as explicit post-test steps in `example/package.json`:

```json
"test:unit":        "vitest run tests/unit --reporter=json --outputFile=reports/unit-results.json",
"test:integration": "vitest run tests/integration --reporter=json --outputFile=reports/integration-results.json",
"ingest":           "horus-ingest --file reports/unit-results.json --layer unit && horus-ingest --file reports/integration-results.json --layer integration",
"test:all":         "pnpm run test:unit && pnpm run test:integration && pnpm run ingest && pnpm run test:contract && pnpm run test:e2e",
```

`vitest.config.ts` reverts to a clean config with no Horus-specific reporter — proving that ingestion is fully decoupled from the runner.

**6.2 — Run the full test suite and verify JSONL output**

```bash
pnpm run test:all --filter @horus/example
# Confirm records landed
cat example/reports/test-runs/unit.jsonl | head -1 | jq .
pnpm run dashboard:generate --filter @horus/example
```

---

### Phase 7 — Publishing (0.5 days)

**7.1 — Version strategy**

Start both packages at `1.0.0`. They share a version bump cadence — if `contracts` adds an interface, `insight-store` bumps to consume it, and both publish together. A `CHANGELOG.md` per package is sufficient; no need for Changesets tooling at this stage.

**7.2 — Publish order**

Always `@horus/contracts` first, then `@horus/insight-store`.

```bash
# From shared/contracts/
pnpm run build && pnpm publish --access public

# From shared/insight-store/
pnpm run build && pnpm publish --access public
```

**7.3 — Smoke test against a fresh project**

Create a throwaway `test-consumer/` directory (not committed), install both packages, run a minimal test suite with `--reporter=json`, then run `horus-ingest` against the output. Confirm a JSONL record lands in `reports/test-runs/unit.jsonl`. Delete the directory.

---

### Phase 8 — Consumer documentation (0.5 days)

Update `README.md` with a "Quick Start" section. The primary path uses the ingestion script; the Vitest reporter is documented as a secondary opt-in.

**Primary path (any test runner):**

```bash
pnpm add @horus/contracts @horus/insight-store
```

```yaml
# .github/workflows/ci.yml
- run: your-test-runner --json --outputFile reports/results.json

- run: |
    pnpm exec horus-ingest --file reports/results.json --layer unit
```

**Secondary path (Vitest only):**

```ts
// vitest.config.ts
import { HorusVitestReporter } from '@horus/insight-store';

export default defineConfig({
  test: {
    reporters: ['default', new HorusVitestReporter({ reportsDir: './reports' })],
  },
});
```

---

## Guardrails

### Protect the `gh-pages` branch before starting Phase 2

`gh-pages` is a generated branch written exclusively by `github-actions[bot]`. If `main` is ever merged into it, source code, config files, and `node_modules` symlinks land alongside the dashboard HTML — GitHub Pages either serves garbage or fails to build, taking the demo down.

Set the following branch ruleset in **GitHub → Settings → Rules → Rulesets** before the restructure begins:

| Rule | Value |
|---|---|
| Target branch | `gh-pages` |
| Restrict pushes | Enabled — allow `github-actions[bot]` only |
| Block force pushes | Disabled — Actions deploy step needs force push |
| Require a pull request before merging | Enabled with no approvals required — prevents accidental merges from the UI |
| Allow deletions | Disabled |

This ensures no human — including repo admins — can accidentally merge `main` into `gh-pages` during or after the migration.

**Recovery if it happens anyway:**

```bash
# Find the last known-good deploy commit on gh-pages
git log origin/gh-pages --oneline | grep "deploy:"

# Force-reset gh-pages to that commit
git push origin <good-sha>:gh-pages --force
```

---

## Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Vitest/Jest JSON output shape diverges from what `ingest.ts` expects | Low-Medium | Normalize both shapes in `ingest.ts` with explicit field fallbacks; add a unit test for each supported format |
| `vitest` Reporter API (`onTestCaseResult`, `TestCase`) changes between versions | Low | Reduced risk — reporter is now secondary/opt-in. Pin peer dep range conservatively (`>=1.0.0 <5.0.0`) |
| Consumer uses CommonJS; our packages are ESM-only | Low-Medium | Add a `"require"` condition to `exports` map pointing at a CJS build (`tsc --module commonjs`), or document ESM-only explicitly |
| `@horus/contracts` version skew between consumer and `insight-store` | Low | `insight-store` uses `^` range on `contracts`; semver handles this cleanly as long as we don't make breaking changes to interfaces |

---

## Success Criteria

- [ ] Phase 1–2: `pnpm install` succeeds, `pnpm run test:all --filter @horus/example` passes, repo layout matches target structure
- [ ] Phase 4–5: `pnpm run build` from each `shared/` package emits a clean `dist/` including `ingest.js`
- [ ] Phase 6: `horus-ingest` writes JSONL records from Vitest JSON output; `vitest.config.ts` has no Horus-specific reporter
- [ ] Phase 7: `pnpm add @horus/contracts @horus/insight-store` works in a fresh project; `horus-ingest` is available as a bin
- [ ] At all times: no production package imports from `@horus/test-utils`

