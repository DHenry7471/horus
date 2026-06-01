import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './reports/coverage',
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
      '@wutangbanger/horus-contracts': resolve(__dirname, '../shared/contracts/src/index.ts'),
      '@wutangbanger/horus-test-utils': resolve(__dirname, '../shared/test-utils/src/index.ts'),
      '@wutangbanger/horus-insight-store': resolve(__dirname, '../shared/insight-store/src/index.ts'),
    },
  },
});
