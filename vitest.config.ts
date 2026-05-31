import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { HorusVitestReporter } from './shared/insight-store/src/HorusVitestReporter.js';

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
      exclude: [
        'shared/test-utils/**',
        'tests/**',
        'agents/**',
        '**/node_modules/**',
        '**/*.config.*',
        '**/.eslintrc.*',
        'quality-dashboard/**',
        '**/server.ts',
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
      '@horus/contracts': resolve(__dirname, './shared/contracts/src/index.ts'),
      '@horus/test-utils': resolve(__dirname, './shared/test-utils/src/index.ts'),
      '@horus/insight-store': resolve(__dirname, './shared/insight-store/src/index.ts'),
    },
  },
});
