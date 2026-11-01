import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import axe from 'axe-core'

async function openServers(page: Page) {
  await page.getByRole('button', { name: 'Sources', exact: true }).click()
  return page.getByRole('dialog', { name: 'Sources', exact: true })
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
  const close = await panel.getByRole('button', { name: 'Close sources' }).boundingBox()
  expect(header && close && close.y >= header.y && close.y + close.height <= header.y + header.height).toBe(true)
  await expect(panel.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const backup = panel.getByRole('button', { name: 'Server 2', exact: true })
  await expect(backup).toBeVisible()
  await expect(panel.getByText('Playing from Server 1', { exact: true })).toBeVisible()
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
  await expect(backup).toHaveAttribute('aria-pressed', 'true')
  if (process.env.PLAYBACK_VISUAL === '1') await page.screenshot({ path: resolve(`.impeccable/review/server-${info.project.name}-manual.png`), animations: 'disabled' })
  const currentSrc = await page.locator('video').getAttribute('src')
  await panel.getByRole('button', { name: 'Auto', exact: true }).click()
  await openServers(page)
  await expect(panel.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.locator('video').getAttribute('src')).toBe(currentSrc)
  expect(switches).toBe(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Sources', exact: true })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  expect(errors).toEqual([])
})

test('list retry and failed server selection preserve the decoded current source', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 720 })
  let lists = 0, listAvailable = false, holdNextList = false
  let releaseList: (() => void) | undefined
  await page.route('**/v1/playback/providers', async route => {
    lists++
    if (holdNextList) {
      holdNextList = false
      await new Promise<void>(resolve => { releaseList = resolve })
    }
    if (!listAvailable) await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    else await route.continue()
  })
  await page.reload()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
  await page.locator('video').evaluate((video: HTMLVideoElement) => { video.pause(); video.currentTime = 12 })
  const currentSrc = await page.locator('video').getAttribute('src')
  const panel = await openServers(page)
  await expect(panel.getByText('Servers are unavailable right now. Playback can continue.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const retry = panel.getByRole('button', { name: 'Try again', exact: true })
  expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expect(retry).toHaveClass(/focus-visible:ring-2/)
  await page.addScriptTag({ content: axe.source })
  expect(await panel.evaluate(async element => {
    const report = await (window as unknown as Window & { axe: typeof axe }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })).toEqual([])
  await mkdir(resolve('.impeccable/review/watch-journey'), { recursive: true })
  await page.screenshot({ animations: 'disabled', path: resolve(`.impeccable/review/watch-journey/source-list-retry-${info.project.name}-320x720.png`) })
  if (process.env.PLAYBACK_VISUAL === '1') await page.screenshot({ path: resolve(`.impeccable/review/server-${info.project.name}-retry.png`), animations: 'disabled' })
  holdNextList = true
  await retry.focus()
  await retry.press('Enter')
  await expect(panel.getByRole('tab', { name: /All/ })).toBeFocused()
  await expect(panel.getByRole('status').filter({ hasText: 'Finding sources…' })).toBeVisible()
  releaseList?.()
  await expect(panel.getByText('Servers are unavailable right now. Playback can continue.')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Try again', exact: true })).toBeFocused()
  listAvailable = true
  holdNextList = true
  await panel.getByRole('button', { name: 'Try again', exact: true }).press('Enter')
  const allSources = panel.getByRole('tab', { name: /All/ })
  await expect(allSources).toBeFocused()
  await expect(allSources).toHaveClass(/focus-visible:ring-2/)
  await expect(panel.getByRole('status').filter({ hasText: 'Finding sources…' })).toBeVisible()
  releaseList?.()
  const backup = panel.getByRole('button', { name: 'Server 2', exact: true })
  await expect(backup).toBeVisible()
  await expect(allSources).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await panel.evaluate(async element => {
    const report = await (window as unknown as Window & { axe: typeof axe }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })).toEqual([])
  await page.screenshot({ animations: 'disabled', path: resolve(`.impeccable/review/watch-journey/source-list-recovered-${info.project.name}-320x720.png`) })
  await page.route('**/v1/playback/*/switch', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await backup.click()
  await expect(page.getByText('Couldn’t switch sources. Current source is unchanged.')).toBeVisible()
  expect(await page.locator('video').getAttribute('src')).toBe(currentSrc)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
  expect(lists).toBeGreaterThanOrEqual(2)
})
