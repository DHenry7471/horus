export default {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // Enforce consistent naming: test files must end in .test.ts
    // Test functions must be descriptive (min 5 words implied by length rule)
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],

    // Staff-level: disallow magic numbers in tests
    'no-magic-numbers': ['warn', {
      ignore: [0, 1, -1, 200, 201, 400, 401, 403, 404, 500],
      ignoreArrayIndexes: true,
      enforceConst: true,
    }],
  },
  overrides: [
    {
      // Test files get slightly relaxed rules
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        'no-magic-numbers': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'reports/', '*.js'],
};
