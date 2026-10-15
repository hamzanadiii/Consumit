import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: 'flow.spec.ts', workers: 1, timeout: 90000, outputDir: '../../local/rebuild-browser-results',
  expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:28119', channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'touch-emulation', use: { ...devices['Pixel 7'] } }],
  webServer: [
    { command: 'node tests/rebuild/server.mjs', cwd: '../..', url: 'http://127.0.0.1:18591/health/ready', timeout: 60000, reuseExistingServer: process.env.REBUILD_REUSE_SERVERS === '1' },
    { command: 'bun run dev --hostname 127.0.0.1 --port 28119', cwd: '../../apps/web', url: 'http://127.0.0.1:28119', timeout: 180000, env: { CONSUMIT_API_URL: 'http://127.0.0.1:18591', CONSUMIT_NEXT_DIST_DIR: '.next-rebuild', NEXT_PUBLIC_CONSUMIT_WELCOME_ENABLED: 'false' } },
  ],
})
