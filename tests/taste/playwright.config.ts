import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.', testMatch: 'publication.spec.ts', outputDir: '../../local/taste/browser-results',
  workers: 1, timeout: 60_000, expect: { timeout: 15_000 },
  use: { baseURL: 'http://127.0.0.1:28114', channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'bun tests/taste/server.ts', cwd: '../..', url: 'http://127.0.0.1:18563/health/ready', reuseExistingServer: true, timeout: 30_000 },
    { command: 'bun run dev --hostname 127.0.0.1 --port 28114', cwd: '../../apps/web', url: 'http://127.0.0.1:28114', reuseExistingServer: true, timeout: 120_000,
      env: { CONSUMIT_API_URL: 'http://127.0.0.1:18563', CONSUMIT_NEXT_DIST_DIR: '.next-taste', NEXT_PUBLIC_CONSUMIT_WELCOME_ENABLED: 'false' } },
  ],
})
