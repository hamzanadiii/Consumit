import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Bun loads workspace .env files before Vitest starts. Tests pass explicit
    // configuration at their boundaries and must not depend on local secrets.
    // Route suites build many Fastify instances; bound workers so scheduling
    // pressure does not turn the default five-second test timeout flaky.
    maxWorkers: 2,
    exclude: ['**/*.integration.test.ts', '**/node_modules/**', '**/dist/**'],
  },
})
