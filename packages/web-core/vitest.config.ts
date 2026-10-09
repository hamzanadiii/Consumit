import { createRequire } from 'node:module'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { 'server-only': createRequire(import.meta.url).resolve('next/dist/compiled/server-only/empty.js') } },
  plugins: [react()],
  test: {
    maxWorkers: 2,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15_000,
  },
})
