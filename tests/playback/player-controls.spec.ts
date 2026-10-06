import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:18559/__fixtures/reset')
  await page.route('https://fixture.example/english.vtt', route => route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nFirst caption\n\n00:00:06.000 --> 00:00:09.000\nTwo lines\nSecond line\n' }))
  await page.goto('/watch/movie/5')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
  await page.locator('video').evaluate((video: HTMLVideoElement) => { video.pause(); video.currentTime = 2 })
})

test('subtitle tracks use readable native language labels and isolate RTL text', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Subtitles', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Subtitles', exact: true })
  await menu.getByRole('button', { name: /العربية 2/ }).click()
  const rows = menu.getByRole('button').filter({ hasText: 'fixture-subtitles' })
  await expect(rows).toHaveCount(2)
  for (const row of await rows.all()) {
    const label = row.locator('[data-player-subtitle-label]')
    await expect(label).toHaveText('العربية')
    await expect(label).toHaveAttribute('dir', 'auto')
    expect(await label.evaluate(element => getComputedStyle(element).letterSpacing)).toBe('normal')
  }
  await page.screenshot({ path: info.outputPath('subtitle-labels.png') })
})

test('captions never move the time display or seek bar', async ({ page }, info) => {
  const timing = page.locator('[data-player-timing]')
  const timeline = page.locator('[data-player-timeline]')
  await expect(page.locator('[data-consumit-player-caption]')).toBeVisible()
  const before = { timing: (await timing.boundingBox())!.y, timeline: (await timeline.boundingBox())!.y }
  await page.locator('video').evaluate((video: HTMLVideoElement) => { video.currentTime = 7 })
  await expect(page.locator('[data-consumit-player-caption]')).toContainText('Second line')
  expect((await timing.boundingBox())!.y).toBeCloseTo(before.timing, 0)
  expect((await timeline.boundingBox())!.y).toBeCloseTo(before.timeline, 0)
  const cue = (await page.locator('[data-consumit-player-caption]').boundingBox())!
  expect(cue.y + cue.height).toBeLessThanOrEqual(before.timing)
  await page.screenshot({ path: info.outputPath('caption-controls.png') })
  await page.locator('video').evaluate((video: HTMLVideoElement) => { video.currentTime = 12 })
  await expect(page.locator('[data-consumit-player-caption]')).toHaveCount(0)
  expect((await timing.boundingBox())!.y).toBeCloseTo(before.timing, 0)
  await page.getByRole('button', { name: /Settings:/ }).click()
  await page.getByRole('switch', { name: 'Enable Subtitles' }).click()
  await page.keyboard.press('Escape')
  expect((await timing.boundingBox())!.y).toBeCloseTo(before.timing, 0)
  expect((await timeline.boundingBox())!.y).toBeCloseTo(before.timeline, 0)
})

test('touch can reveal and adjust the volume slider without hover', async ({ page }, info) => {
  test.skip(info.project.name !== 'chrome-touch', 'Tap fallback belongs to touch.')
  const volume = page.getByRole('slider', { name: 'Volume', exact: true })
  await expect(volume).toHaveCSS('opacity', '0')
  await page.getByRole('button', { name: 'Mute', exact: true }).tap()
  await expect(volume).toHaveCSS('opacity', '1')
  const bounds = (await volume.boundingBox())!
  await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.volume)).toBeGreaterThan(0)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.muted)).toBe(false)
})

test('volume slider appears on hover and keyboard focus', async ({ page }, info) => {
  test.skip(info.project.name === 'chrome-touch', 'Touch uses tap/focus rather than hover.')
  const volume = page.getByRole('slider', { name: 'Volume', exact: true })
  const mute = page.getByRole('button', { name: 'Mute', exact: true })
  await page.mouse.move(1, 1)
  await expect(volume).toHaveCSS('opacity', '0')
  await mute.hover()
  await expect(volume).toHaveCSS('opacity', '1')
  await volume.focus()
  await page.keyboard.press('Home')
  for (let step = 0; step < 10; step++) await page.keyboard.press('ArrowRight')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.volume)).toBe(0.5)
  await page.mouse.move(1, 1)
  await volume.evaluate(element => element.blur())
  await expect(volume).toHaveCSS('opacity', '0')
  await mute.focus()
  await page.keyboard.press('Tab')
  await expect(volume).toBeFocused()
  await expect(volume).toHaveCSS('opacity', '1')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.volume)).toBe(0.55)
})
