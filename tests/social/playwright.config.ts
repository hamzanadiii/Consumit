import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', outputDir: '../../local/social-results', workers: 1, timeout: 90_000,
  expect: { timeout: 12_000 },
  use: { baseURL: 'http://127.0.0.1:28113', channel: 'chrome', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'bun tests/social/server.ts', cwd: '../..', url: 'http://127.0.0.1:18562/health/ready', timeout: 30_000 },
    { command: 'bun run build && bun run start --hostname 127.0.0.1 --port 28113', cwd: '../../apps/web', url: 'http://127.0.0.1:28113', timeout: 180_000,
      stdout: 'pipe', env: { PLAYBACK_FIXTURE_PROXY: '1', NEXT_PUBLIC_CONSUMIT_WELCOME_ENABLED: 'false', CONSUMIT_API_URL: 'http://127.0.0.1:18562', CONSUMIT_NEXT_DIST_DIR: '.next-social' } },
  ],
})
