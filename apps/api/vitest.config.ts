import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Bun loads workspace .env files before Vitest starts. Tests pass explicit
    // configuration at their boundaries and must not depend on local secrets.
    exclude: ['**/*.integration.test.ts', '**/node_modules/**', '**/dist/**'],
  },
})
