import { defineConfig } from '@playwright/test'

const isolatedDistDir = `.next-home-resilience-${process.pid}`

export default defineConfig({
  testDir: '.',
  testMatch: 'home-resilience.spec.ts',
  outputDir: '../../local/home-resilience-results',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  use: { baseURL: 'http://127.0.0.1:28115', channel: 'chrome', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'bun tests/experience/server.ts', cwd: '../..', url: 'http://127.0.0.1:18563/health/ready', timeout: 30_000 },
    {
      command: 'bun run dev --hostname 127.0.0.1 --port 28115',
      cwd: '../../apps/web',
      url: 'http://127.0.0.1:28115/icon.svg',
      timeout: 120_000,
      stdout: 'pipe',
      env: {
        CONSUMIT_API_URL: 'http://127.0.0.1:18563',
        CONSUMIT_NEXT_DIST_DIR: isolatedDistDir,
        NEXT_PUBLIC_CONSUMIT_WELCOME_ENABLED: 'false',
      },
    },
  ],
})
