import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

test('keeps the heading at 24px through preparation, pause and play', async ({ page, request }, testInfo) => {
  await request.post('http://127.0.0.1:18559/__fixtures/reset')
  let release: () => void = () => undefined
  const pending = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/v1/playback/resolve', async (route) => { await pending; await route.continue() })
  const heading = page.locator('[data-player-heading]')
  const font = () => heading.evaluate((element) => getComputedStyle(element).fontSize)
  const directory = resolve('.impeccable/review')
  await mkdir(directory, { recursive: true })
  try {
    await page.goto('/watch/movie/1')
    await expect(heading).toBeVisible()
    await expect.poll(font).toBe('24px')
    if (testInfo.project.name === 'chrome') await expect(page.locator('[data-player-preparation]')).toBeVisible()
    await expect(page.locator('[data-player-preparation] .consumit-player-preparation-title')).toHaveCount(0)
    await page.screenshot({ path: resolve(directory, `${testInfo.project.name}-heading-preparing.png`), fullPage: true, animations: 'disabled' })
    release()
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
    await page.locator('video').evaluate((video: HTMLVideoElement) => video.pause())
    await expect.poll(font).toBe('24px')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(false)
    await expect.poll(font).toBe('24px')
    await page.screenshot({ path: resolve(directory, `${testInfo.project.name}-heading-playing.png`), fullPage: true, animations: 'disabled' })
  } finally { release() }
})
