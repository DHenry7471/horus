import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './reports/coverage',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    reporters: ['default', 'json'],
    outputFile: {
      json: './reports/vitest-results.json',
    },
  },
  resolve: {
    alias: {
      '@horus/test-utils': resolve(__dirname, './shared/test-utils/src/index.ts'),
    },
  },
});
