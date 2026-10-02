import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

test.skip(process.env.PLAYBACK_VISUAL !== '1', 'Capture only during the player visual review.')

test('captures the active player at desktop and touch sizes', async ({ page, request }, testInfo) => {
  const reset = await request.post('http://127.0.0.1:18559/__fixtures/reset')
  expect(reset.ok()).toBe(true)
  await page.goto('/watch/movie/1')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
  const play = page.getByRole('button', { name: 'Play', exact: true })
  if (await play.isVisible() && await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)) await play.click()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime), { timeout: 20_000 }).toBeGreaterThan(0)
  await page.locator('video').evaluate((video: HTMLVideoElement) => video.pause())
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  const directory = resolve('.impeccable/review')
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: resolve(directory, testInfo.project.name === 'chrome-touch' ? 'mobile.png' : 'desktop.png'), fullPage: true, animations: 'disabled' })
  if (testInfo.project.name === 'chrome-touch') {
    await page.setViewportSize({ width: 320, height: 700 })
    const stage = await page.locator('[data-player-stage]').boundingBox()
    const settings = await page.getByRole('button', { name: /^Settings:/ }).boundingBox()
    expect(stage && settings && settings.x >= stage.x && settings.x + settings.width <= stage.x + stage.width).toBe(true)
    await page.screenshot({ path: resolve(directory, 'mobile-narrow.png'), fullPage: true, animations: 'disabled' })
  }
})
