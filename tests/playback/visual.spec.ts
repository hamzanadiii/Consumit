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

  await expect(page.getByRole('button', { name: 'Cast to TV', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cast to TV', exact: true }).click()
  const cast = page.getByRole('menu', { name: 'Cast to TV', exact: true })
  await expect(cast).toBeVisible()
  await expect(cast).toContainText('TV casting is being set up')
  await expect(cast.getByRole('button', { name: 'Check again' })).toBeEnabled()
  await cast.getByRole('button', { name: 'Check again' }).click()
  await expect(cast).toContainText('TV casting is being set up')
  await page.screenshot({ path: resolve(directory, `${testInfo.project.name}-cast.png`), fullPage: true, animations: 'disabled' })
  await cast.getByRole('button', { name: 'Close cast to TV' }).click()
  await page.getByRole('button', { name: 'Subtitles', exact: true }).click()
  await page.getByRole('button', { name: 'Subtitle appearance', exact: true }).click()
  const appearance = page.getByRole('menu', { name: 'Subtitle appearance', exact: true })
  await appearance.getByRole('button', { name: 'Large', exact: true }).click()
  await expect(appearance.getByRole('button', { name: 'Large', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const stageBounds = testInfo.project.name === 'chrome-touch' ? { x: 0, y: 0, width: page.viewportSize()!.width, height: page.viewportSize()!.height } : (await page.locator('[data-player-stage]').boundingBox())!
  for (const element of [appearance, appearance.getByRole('button', { name: 'Cinematic', exact: true })]) {
    const bounds = (await element.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(stageBounds.x)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(stageBounds.x + stageBounds.width + 1)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(stageBounds.y + stageBounds.height + 1)
  }
  await page.screenshot({ path: resolve(directory, `${testInfo.project.name}-appearance.png`), fullPage: true, animations: 'disabled' })
  await appearance.getByRole('button', { name: 'Back to subtitles' }).click()
  await page.getByRole('button', { name: 'Sync subtitle to audio', exact: true }).click()
  const sync = page.getByRole('menu', { name: 'Subtitle sync', exact: true })
  await sync.getByRole('button', { name: 'Shift subtitles backwards 50 milliseconds' }).click()
  await expect(sync.locator('p[role=status]')).toContainText('Adjusted −50ms')
  await page.screenshot({ path: resolve(directory, `${testInfo.project.name}-sync.png`), fullPage: true, animations: 'disabled' })
  await sync.getByRole('button', { name: 'Reset subtitle sync offset' }).click()
  await expect(sync.locator('p[role=status]')).toContainText('Offset reset')
  await sync.getByRole('button', { name: 'Close subtitle sync' }).click()

  if (testInfo.project.name === 'chrome-touch') {
    await page.setViewportSize({ width: 320, height: 700 })
    const stage = await page.locator('[data-player-stage]').boundingBox()
    const settings = await page.getByRole('button', { name: /^Settings:/ }).boundingBox()
    expect(stage && settings && settings.x >= stage.x && settings.x + settings.width <= stage.x + stage.width).toBe(true)
    await page.screenshot({ path: resolve(directory, 'mobile-narrow.png'), fullPage: true, animations: 'disabled' })
  }
})
