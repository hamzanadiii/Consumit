import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', outputDir: '../../local/experience-results', workers: 1, fullyParallel: false, timeout: 90_000,
  expect: { timeout: 12_000 },
  use: { baseURL: 'http://127.0.0.1:28114', channel: 'chrome', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'bun tests/experience/server.ts', cwd: '../..', url: 'http://127.0.0.1:18563/health/ready', timeout: 30_000, reuseExistingServer: process.env.EXPERIENCE_REUSE_SERVERS === '1' },
    { command: 'bun run dev --hostname 127.0.0.1 --port 28114', cwd: '../../apps/web', url: 'http://127.0.0.1:28114', timeout: 120_000, reuseExistingServer: process.env.EXPERIENCE_REUSE_SERVERS === '1',
      env: { CONSUMIT_API_URL: 'http://127.0.0.1:18563', CONSUMIT_NEXT_DIST_DIR: '.next-experience', NEXT_PUBLIC_CONSUMIT_WELCOME_ENABLED: 'true' } },
  ],
})
