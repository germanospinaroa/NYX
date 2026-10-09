import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': new URL('./', import.meta.url).pathname } },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Network-bound SSRF resolver paths are covered by deterministic pure
      // parser/IP tests and a separate integration harness, not unit coverage.
      exclude: ['lib/links/preview.ts'],
      // Branch coverage is lower because server-side transport failure paths
      // require a real Supabase integration environment; statements remain
      // above 80% and bulk transport is covered with a deterministic fake.
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 65 },
    },
  },
})
