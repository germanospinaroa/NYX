import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': new URL('./', import.meta.url).pathname } },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
})
