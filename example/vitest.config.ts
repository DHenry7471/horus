import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { HorusVitestReporter } from '../shared/insight-store/src/HorusVitestReporter.js';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    reporters: ['default', new HorusVitestReporter('./reports')],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './reports/coverage',
      // `include` is the primary gate — only services/** is instrumented.
      // Everything else (shared/*, agents/*, quality-dashboard/*, tests/*)
      // is excluded by virtue of not matching the include pattern.
      // The explicit excludes below handle edge cases *within* services/**:
      //   - server.ts  : Express bootstrap; not business logic, not worth measuring
      //   - node_modules: safety net in case of hoisted packages under services/
      include: ['services/**'],
      exclude: [
        '**/server.ts',
        '**/node_modules/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@horus/contracts': resolve(__dirname, '../shared/contracts/src/index.ts'),
      '@horus/test-utils': resolve(__dirname, '../shared/test-utils/src/index.ts'),
      '@horus/insight-store': resolve(__dirname, '../shared/insight-store/src/index.ts'),
    },
  },
});
