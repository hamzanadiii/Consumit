import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', outputDir: '../../local/releases-results', workers: 1, fullyParallel: false, timeout: 90_000,
  expect: { timeout: 12_000 },
  use: { baseURL: 'http://127.0.0.1:28112', channel: 'chrome', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'bun tests/releases/server.ts', cwd: '../..', url: 'http://127.0.0.1:18561/health/ready', timeout: 30_000, reuseExistingServer: process.env.RELEASE_REUSE_SERVERS === '1' },
    { command: 'bun run dev --hostname 127.0.0.1 --port 28112', cwd: '../../apps/web', url: 'http://127.0.0.1:28112', timeout: 120_000, reuseExistingServer: process.env.RELEASE_REUSE_SERVERS === '1',
      env: { CONSUMIT_API_URL: 'http://127.0.0.1:18561', CONSUMIT_NEXT_DIST_DIR: '.next-releases' } },
  ],
})
