import 'dotenv/config'
import { defineConfig } from 'vitest/config'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for API integration tests.')
if (!process.env.VALKEY_URL) throw new Error('VALKEY_URL is required for API integration tests.')
if (!process.env.AUTH_CODE_PEPPER) throw new Error('AUTH_CODE_PEPPER is required for API integration tests.')

export default defineConfig({
  test: { include: ['src/**/*.integration.test.ts'], fileParallelism: false, maxConcurrency: 1 },
})
