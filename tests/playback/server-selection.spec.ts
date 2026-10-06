import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function openServers(page: Page) {
  await page.getByRole('button', { name: /^Settings:/ }).click()
  await page.getByRole('button', { name: /^Server/ }).click()
  return page.getByRole('menu', { name: 'Server', exact: true })
}

test.beforeEach(async ({ page, request }, info) => {
  await request.post('http://127.0.0.1:18559/__fixtures/reset')
  await page.route('https://fixture.example/english.vtt', route => route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n' }))
  if (info.project.name === 'chrome') await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/watch/movie/1')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
  await page.locator('video').evaluate((video: HTMLVideoElement) => { video.currentTime = 12; video.pause() })
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(12)
})

test('server menu switches decoded media at the paused position and returns to Auto without reloading', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let switches = 0
  page.on('request', request => { if (request.url().endsWith('/switch')) switches++ })
  const panel = await openServers(page)
  const header = await panel.locator('header').boundingBox()
  const close = await panel.getByRole('button', { name: 'Close server' }).boundingBox()
  expect(header && close && close.y >= header.y && close.y + close.height <= header.y + header.height).toBe(true)
  await expect(panel.getByRole('menuitemradio', { name: /^Auto/ })).toHaveAttribute('aria-checked', 'true')
  const backup = panel.getByRole('menuitemradio', { name: /^backup/i })
  await expect(backup).toBeVisible()
  await expect(panel.getByText('Playing from primary', { exact: true })).toBeVisible()
  if (process.env.PLAYBACK_VISUAL === '1') {
    await mkdir(resolve('.impeccable/review'), { recursive: true })
    await page.screenshot({ path: resolve(`.impeccable/review/server-${info.project.name}-auto.png`), animations: 'disabled' })
  }
  const switched = page.waitForResponse(response => response.url().endsWith('/switch') && response.ok())
  await backup.click()
  expect((await (await switched).json()).source.providerId).toBe('backup')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0)
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(12)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
  await openServers(page)
  await expect(backup).toHaveAttribute('aria-checked', 'true')
  if (process.env.PLAYBACK_VISUAL === '1') await page.screenshot({ path: resolve(`.impeccable/review/server-${info.project.name}-manual.png`), animations: 'disabled' })
  const currentSrc = await page.locator('video').getAttribute('src')
  await panel.getByRole('menuitemradio', { name: /^Auto/ }).click()
  await openServers(page)
  await expect(panel.getByRole('menuitemradio', { name: /^Auto/ })).toHaveAttribute('aria-checked', 'true')
  expect(await page.locator('video').getAttribute('src')).toBe(currentSrc)
  expect(switches).toBe(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /^Settings:/ })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  expect(errors).toEqual([])
})

test('list retry and failed server selection preserve the decoded current source', async ({ page }, info) => {
  let lists = 0
  await page.route('**/v1/playback/providers', async route => {
    lists++
    if (lists === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    else await route.continue()
  })
  const currentSrc = await page.locator('video').getAttribute('src')
  const panel = await openServers(page)
  await expect(panel.getByText('Servers are unavailable right now. Playback can continue.')).toBeVisible()
  if (process.env.PLAYBACK_VISUAL === '1') await page.screenshot({ path: resolve(`.impeccable/review/server-${info.project.name}-retry.png`), animations: 'disabled' })
  await panel.getByRole('button', { name: 'Try again', exact: true }).click()
  const backup = panel.getByRole('menuitemradio', { name: /^backup/i })
  await expect(backup).toBeVisible()
  await page.route('**/v1/playback/*/switch', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await backup.click()
  await expect(page.getByText('Couldn’t switch sources. Playback is still available.')).toBeVisible()
  expect(await page.locator('video').getAttribute('src')).toBe(currentSrc)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
  expect(lists).toBe(2)
})
