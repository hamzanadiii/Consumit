import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/playback', testMatch: '*.spec.ts', fullyParallel: false, workers: 1,
  timeout: 45000, expect: { timeout: 12000 },
  use: { baseURL: 'http://127.0.0.1:27911', ignoreHTTPSErrors: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', launchOptions: { args: ['--host-resolver-rules=MAP 127-0-0-1.nip.io 127.0.0.1'] } } },
    { name: 'chrome-touch', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    ...(process.env.PLAYBACK_BROWSER_MATRIX === 'all' ? [
      { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ] : []),
  ],
  webServer: [
    { command: 'bun tests/playback/server.ts', url: 'http://127.0.0.1:18559/health', reuseExistingServer: process.env.PLAYBACK_REUSE_SERVERS === '1', timeout: 30000 },
    { command: process.env.PLAYBACK_PRODUCTION === '1' ? 'node ../../scripts/start-playback-standalone.mjs' : 'bun run dev --hostname 127.0.0.1 --port 27911', cwd: './apps/web', url: 'http://127.0.0.1:27911/watch/movie/1',
      env: { CONSUMIT_API_URL: 'http://127.0.0.1:18559', CONSUMIT_NEXT_DIST_DIR: process.env.CONSUMIT_NEXT_DIST_DIR ?? (process.env.PLAYBACK_PRODUCTION === '1' ? '.next-playback-prod' : '.next-playback'), ...(process.env.PLAYBACK_PRODUCTION === '1' ? { PLAYBACK_FIXTURE_PROXY: '1', NEXT_PUBLIC_PLAYBACK_FIXTURE: '1', PLAYBACK_EMBED_SESSIONS: '1', PORT: '27911', HOSTNAME: '127.0.0.1' } : {}) }, reuseExistingServer: process.env.PLAYBACK_REUSE_SERVERS === '1', timeout: 240000 },
  ],
})
