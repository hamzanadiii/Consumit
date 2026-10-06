import { test, expect, type Page } from '@playwright/test'

test.beforeEach(async ({ request, page }) => {
  await page.route('https://fixture.example/english.vtt', (route) => route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00:00.000 --> 00:00:10.000\nTest caption\n' }))
  const response = await request.post('http://127.0.0.1:18559/__fixtures/reset')
  expect(response.ok()).toBe(true)
})

test('watch player hydrates without a disabled-control mismatch', async ({ page }) => {
  const hydrationErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydration|did not match|server html/i.test(message.text())) {
      hydrationErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    if (/hydration|did not match|server html/i.test(error.message)) hydrationErrors.push(error.message)
  })
  await page.goto('/watch/movie/1')
  await expect(page.locator('[data-consumit-player-screen]')).toHaveAttribute('data-session', 'ready')
  await expect(page.locator('[data-consumit-player]')).toHaveAttribute('data-player-core', process.env.NEXT_PUBLIC_PLAYBACK_CORE === 'next' ? 'next' : 'legacy')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
  await expect.poll(() => hydrationErrors).toEqual([])
})

async function start(page: Page, id: number) {
  await page.goto(`/watch/movie/${id}`)
  const startButton = page.getByRole('button', { name: 'Start watching', exact: true })
  if (await startButton.isVisible()) await startButton.click()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
  if (await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)) await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime), { timeout: 20_000 }).toBeGreaterThan(0)
}

test('native playback saves guest progress and resumes after reload', async ({ page }) => {
  await start(page, 1)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => { video.currentTime = 12; video.pause(); return video.paused })).toBe(true)
  await page.waitForTimeout(500)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('consumit.progress:guest:movie:1:0:0') ?? '{}').positionSeconds)).toBeGreaterThanOrEqual(12)
  await page.reload()
  const startButton = page.getByRole('button', { name: 'Start watching', exact: true })
  if (await startButton.isVisible()) await startButton.click()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(12)
})

test('pointer playback lets transport controls fade away', async ({ page }) => {
  await page.goto('/watch/movie/1')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate((el: HTMLVideoElement) => el.pause())
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.mouse.move(640, 300)
  await expect(page.locator('[data-consumit-player]')).toHaveAttribute('data-controls-visible', 'false', { timeout: 6000 })
})

test('focused player controls stay visible while video plays', async ({ page }) => {
  await start(page, 1)
  await page.getByRole('button', { name: 'Pause', exact: true }).focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeFocused()
  await page.waitForTimeout(3_200)
  await expect(page.locator('[data-consumit-player]')).toHaveAttribute('data-controls-visible', 'true')
})

test('direct HLS decodes video and exposes the actual English caption track', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && process.platform === 'win32', 'Windows Playwright WebKit does not expose a working HLS decoder for this fixture.')
  await start(page, 2)
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(640)
  // External cues stay active for Consumit's overlay; the browser must not draw a duplicate line.
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => Array.from(video.textTracks).some((track) => track.language === 'en' && track.mode === 'hidden'))).toBe(true)
  await expect(page.locator('video track[srclang="en"]')).toHaveAttribute('src', /^https:\/\//)
})

test('the imported VixSrc adapter connects API extraction to actual HLS decoding', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && process.platform === 'win32', 'Windows Playwright WebKit does not expose a working HLS decoder for this fixture.')
  const resolved = page.waitForResponse((response) => response.url().endsWith('/v1/playback/resolve') && response.status() === 200)
  await start(page, 4)
  expect((await (await resolved).json()).source.providerId).toBe('vixsrc')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(640)
})

test('an unavailable source falls back to compatible media', async ({ page }) => {
  const fallback = page.waitForResponse((response) => response.url().endsWith('/fallback') && response.status() === 200)
  await page.goto('/watch/movie/3')
  const startButton = page.getByRole('button', { name: 'Start watching', exact: true })
  if (await startButton.isVisible()) await startButton.click()
  expect((await (await fallback).json()).source.providerId).toBe('backup')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0)
})

test('recovery preserves a paused position', async ({ page }) => {
  await start(page, 1)
  await page.locator('video').evaluate((video: HTMLVideoElement) => { video.currentTime = 12; video.pause() })
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('consumit.progress:guest:movie:1:0:0') ?? '{}').positionSeconds)).toBeGreaterThanOrEqual(12)
  const fallback = page.waitForResponse((response) => response.url().endsWith('/fallback') && response.status() === 200)
  await page.locator('video').evaluate((video) => video.dispatchEvent(new Event('error')))
  await fallback
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(12)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
})

test('renewing an unchanged media URL keeps playback running without reloading it', async ({ page }) => {
  await start(page, 6)
  const video = page.locator('video')
  await video.evaluate((element: HTMLVideoElement) => {
    const observed = element as HTMLVideoElement & { renewalReloads: number }
    observed.renewalReloads = 0
    element.addEventListener('loadstart', () => { observed.renewalReloads += 1 })
  })
  const renewed = await page.waitForResponse((response) => response.url().endsWith('/refresh') && response.status() === 200)
  const lease = (await renewed.json()).source
  const atRenewal = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(atRenewal + 1)
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentSrc)).toBe(lease.src)
  expect(await video.evaluate((element: HTMLVideoElement) => (element as HTMLVideoElement & { renewalReloads: number }).renewalReloads)).toBe(0)
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false)
})

test('subtitle discovery shows all languages, pages tracks, and prepares the selected file', async ({ page }) => {
  await start(page, 5)
  await page.getByRole('button', { name: 'Subtitles' }).click()
  const menu = page.getByRole('menu', { name: 'Subtitles' })
  await expect(menu.getByRole('button', { name: /English 26/ })).toBeVisible()
  await expect(menu.getByRole('button', { name: /العربية 2/ })).toBeVisible()
  await menu.getByRole('button', { name: /English 26/ }).click()
  await expect(menu.getByRole('button', { name: 'Load more tracks' })).toBeVisible()
  await menu.getByRole('button', { name: 'Load more tracks' }).click()
  await expect(menu.getByRole('button', { name: /English release 25/ })).toBeVisible()
  await menu.getByRole('button', { name: /English release 1$/ }).click()
  await expect(page.locator('video track[src*="/v1/subtitles/file/"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Subtitles' }).click()
  await page.locator('input[type="file"][accept*=".srt"]').setInputFiles({
    name: 'local.srt', mimeType: 'application/x-subrip',
    buffer: Buffer.from('1\n00:00:01,000 --> 00:00:20,000\nLocal caption\n'),
  })
  await expect(page.locator('video track[src^="blob:"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Subtitles' }).click()
  await page.getByRole('menu', { name: 'Subtitles' }).getByRole('button', { name: 'Sync subtitle to audio' }).click()
  await expect(page.getByRole('menu', { name: 'Subtitle sync' })).toBeVisible()
})

test('repeated short source renewals keep playback, captions, and paused position', async ({ page }) => {
  test.setTimeout(120_000)
  await start(page, 5)
  const video = page.locator('video')
  // Configure paused playback.
  await video.evaluate((element: HTMLVideoElement) => element.pause())
  await page.getByRole('button', { name: 'Settings: audio, speed, brightness' }).click()
  await page.getByRole('button', { name: /^Playback settings/ }).click()
  await page.getByRole('slider', { name: 'Playback speed' }).press('Home')
  await page.keyboard.press('Escape')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.playbackRate)).toBe(0.5)
  await video.evaluate((element: HTMLVideoElement) => { element.currentTime = 12 })
  // This title has a deterministic English track. Discovery pagination and
  // track selection are covered separately, so this test stays focused on
  // retaining the selected caption during repeated short lease renewals.
  await expect(page.locator('video track[src="https://fixture.example/english.vtt"]')).toHaveCount(1)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => Array.from(element.textTracks).some((track) => track.language === 'en' && track.mode === 'hidden'))).toBe(true)
  const startingSource = await video.evaluate((element: HTMLVideoElement) => element.currentSrc)
  let reloads = 0
  await page.exposeFunction('recordRenewalReload', () => { reloads += 1 })
  await video.evaluate((element: HTMLVideoElement) => element.addEventListener('loadstart', () => { void (window as unknown as { recordRenewalReload: () => Promise<void> }).recordRenewalReload() }))
  const renewed: string[] = []
  const renewedSources: string[] = []
  page.on('response', async (response) => {
    if (!response.url().endsWith('/refresh') || response.status() !== 200) return
    try {
      const source = (await response.json()).source
      renewed.push(source.providerId as string)
      renewedSources.push(source.src as string)
    } catch { /* Ignore malformed fixture responses. */ }
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => renewed.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(1)
  expect(renewedSources[0]).not.toBe(startingSource)
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentSrc)).toBe(startingSource)
  expect(reloads).toBe(0)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused), { timeout: 15_000 }).toBe(false)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.playbackRate)).toBe(0.5)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 15_000 }).toBeGreaterThanOrEqual(11)
  await video.evaluate((element: HTMLVideoElement) => { element.currentTime = 12; element.pause() })
  const renewalsWhilePaused = renewed.length
  await expect.poll(() => renewed.length, { timeout: 30_000 }).toBeGreaterThan(renewalsWhilePaused)
  expect(renewed.every((provider) => provider === 'primary')).toBe(true)
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime), { timeout: 10_000 }).toBeGreaterThanOrEqual(11)
  expect(Math.abs(await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime) - 12)).toBeLessThanOrEqual(1)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => Array.from(video.textTracks).some((track) => track.mode === 'hidden'))).toBe(true)
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentSrc)).toBe(startingSource)
  expect(reloads).toBe(0)
  // The latest renewed URL is used only when the attached stream fails.
  const standbySource = renewedSources.at(-1)!
  const beforeRecovery = renewed.length
  await video.evaluate((element: HTMLVideoElement) => element.dispatchEvent(new Event('error')))
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentSrc)).toBe(standbySource)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(11)
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
  expect(renewed.length).toBe(beforeRecovery)
})
