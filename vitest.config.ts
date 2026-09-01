import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: [
        'pivot-core/**',
        'components/**',
        'options/**',
        'hooks/**',
        'localization/**',
        'utils/**',
        'context/**',
        'theme/**',
        'AuraPivot.tsx',
        'index.ts',
      ],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
      // Thresholds are a ratchet: they record what is covered today so a
      // change cannot quietly reduce it. Phases 2 and 3 raise them toward
      // the targets in the spec (pivot-core 95, global 90).
      // Measured 2026-09-01: lines 47.95%, functions 38.36%, branches
      // 33.51%, statements 45.7% (global, from `npm run test:coverage`).
      thresholds: {
        lines: 47,
        functions: 38,
        branches: 33,
        statements: 45,
      },
    },
  },
});
