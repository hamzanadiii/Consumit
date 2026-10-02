import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    // Full-screen component tests are CPU-heavy in jsdom. Keep parallelism
    // bounded and allow those normal interactions to finish under contention.
    maxWorkers: 2,
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 10_000,
  },
})
