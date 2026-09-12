import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/playback', testMatch: '*.spec.ts', fullyParallel: false, workers: 1,
  timeout: 45000, expect: { timeout: 12000 },
  use: { baseURL: 'http://127.0.0.1:27911', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'chrome-touch', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    ...(process.env.PLAYBACK_BROWSER_MATRIX === 'all' ? [
      { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ] : []),
  ],
  webServer: [
    { command: 'bun tests/playback/server.ts', url: 'http://127.0.0.1:18559/health', reuseExistingServer: process.env.PLAYBACK_REUSE_SERVERS === '1', timeout: 30000 },
    { command: 'bun run dev --hostname 127.0.0.1 --port 27911', cwd: './apps/web', url: 'http://127.0.0.1:27911/watch/movie/1',
      env: { CONSUMIT_API_URL: 'http://127.0.0.1:18559' }, reuseExistingServer: process.env.PLAYBACK_REUSE_SERVERS === '1', timeout: 240000 },
  ],
})
