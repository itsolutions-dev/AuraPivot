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
      // change cannot quietly reduce it. Raise them toward the targets in
      // the spec (pivot-core 95, global 90) as coverage grows.
      // Measured 2026-09-28: lines 78.33%, functions 77.9%, branches
      // 63.87%, statements 75.89% (global, from `npm run test:coverage`).
      thresholds: {
        lines: 78,
        functions: 77,
        branches: 63,
        statements: 75,
      },
    },
  },
});
