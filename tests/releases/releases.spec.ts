import { test, expect } from '@playwright/test'
import { createWorker } from '../../apps/release-worker/src/worker'
import type { ReleaseProbeSource } from '../../packages/contracts/src/index'
import { mkdir } from 'node:fs/promises'

test.beforeEach(async ({ request }) => { await request.post('http://127.0.0.1:18561/__fixtures/reset', { data: {} }) })
async function signIn(context: import('@playwright/test').BrowserContext, request: import('@playwright/test').APIRequestContext) {
  const { token } = await (await request.get('http://127.0.0.1:18561/__fixtures/session')).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
}
test('shelf, bell, inbox and Settings remain usable on desktop/mobile in both themes', async ({ page, context, request }) => {
  await signIn(context, request); await mkdir('local/releases', { recursive: true })
  for (const [name, width, height] of [['desktop', 1440, 1050], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height })
    for (const theme of ['dark', 'light']) {
      await page.addInitScript(next => localStorage.setItem('consumit.home-theme', next), theme)
      await page.goto('/')
      await expect(page.getByText('Aired · playback not confirmed')).toBeAttached()
      await page.locator('section[aria-labelledby="new-episodes-title"]').evaluate(section => section.scrollIntoView({ block: 'center' }))
      await page.screenshot({ path: `local/releases/${name}-${theme}-shelf.png` })
      const bell = page.getByRole('button', { name: 'Notifications, 1 unread' })
      await bell.focus(); await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible()
      await page.screenshot({ path: `local/releases/${name}-${theme}-bell.png` })
      await page.keyboard.press('Escape'); await expect(bell).toBeFocused()
      await page.goto('/notifications'); await expect(page.getByRole('button', { name: 'Mark read', exact: true })).toBeVisible()
      await page.screenshot({ path: `local/releases/${name}-${theme}-inbox.png` })
      await page.goto('/settings#notifications'); const toggle = page.getByRole('switch', { name: 'New episodes from your Watchlist and Favorites' })
      await expect(toggle).toBeEnabled(); await toggle.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `local/releases/${name}-${theme}-settings.png` })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
  }
  await page.goto('/notifications'); await page.getByRole('button', { name: 'Mark read', exact: true }).click()
  await page.getByRole('button', { name: 'Unread', exact: true }).click(); await expect(page.getByText(/all caught up/)).toBeVisible()
})
test('worker submits actual frame/play/seek evidence through the protected probe', async ({ browser, request }) => {
  const job = await (await request.get('http://127.0.0.1:18561/__fixtures/session')).json()
  await request.get('/_internal/release-check', { headers: { 'x-consumit-check-id': job.id, 'x-consumit-check-token': job.leaseToken }, timeout: 40_000 })
  const worker = createWorker({ apiOrigin: 'http://127.0.0.1:18561', appOrigin: 'http://127.0.0.1:28112', secret: 'fixture-worker-secret-01234567890123456789' }, browser, () => {})
  expect(await worker.runOnce()).toBe(true)
  const { evidence } = await (await request.get('http://127.0.0.1:18561/__fixtures/evidence')).json()
  expect(evidence.failure).toBeUndefined(); expect(evidence.decodedFrames).toBeGreaterThan(0)
  expect(evidence.advancedSeconds).toBeGreaterThanOrEqual(5); expect(evidence.seeked).toBe(true); expect(evidence.resumedSeconds).toBeGreaterThanOrEqual(2)
})
test('unauthorized probe cannot load and broken segments/frozen video/failed seeks never pass', async ({ page, request }) => {
  await page.goto('/_internal/release-check'); await expect(page.getByLabel('Automatic playback check')).toHaveCount(0)
  const session = await (await request.get('http://127.0.0.1:18561/__fixtures/session')).json()
  await page.setExtraHTTPHeaders({ 'x-consumit-check-id': session.id, 'x-consumit-check-token': session.leaseToken })
  await page.goto('/_internal/release-check'); await page.waitForFunction(() => Boolean(window.consumitReleaseProbe))
  const base: ReleaseProbeSource = { src: `http://127.0.0.1:28112/v1/playback/relay-manifest?grant=${'fixture_'.repeat(5)}`, type: 'native', providerId: 'fixture', revision: 'a'.repeat(64), expiresAt: new Date(Date.now() + 90_000).toISOString(), region: 'US', audioLanguage: 'en', mediaHosts: [], mediaHostPatterns: [] }
  await page.route('**/v1/playback/relay-manifest?*', route => route.fulfill({ contentType: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nhttps://missing.invalid/segment.ts\n#EXT-X-ENDLIST\n' }))
  const broken = await page.evaluate(source => window.consumitReleaseProbe!(source), { ...base, type: 'hls' })
  expect(broken.failure).toBeDefined(); expect(broken.decodedFrames).toBe(0)
  await page.unroute('**/v1/playback/relay-manifest?*')
  for (const mode of ['frozen', 'seek']) {
    await page.goto('/_internal/release-check'); await page.waitForFunction(() => Boolean(window.consumitReleaseProbe))
    await page.evaluate(next => {
      const video = document.querySelector('video')!
      if (next === 'frozen') { const frame = video.requestVideoFrameCallback.bind(video); video.requestVideoFrameCallback = callback => frame((now, metadata) => { video.requestVideoFrameCallback = () => 0; callback(now, metadata) }) }
      else { const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!; Object.defineProperty(video, 'currentTime', { get: () => descriptor.get!.call(video), set() {} }) }
    }, mode)
    const result = await page.evaluate(source => window.consumitReleaseProbe!(source), base)
    expect(result.failure).toBeDefined(); expect(result.seeked).toBe(false)
  }
})
