import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page, request }) => {
  expect((await request.post('http://127.0.0.1:18559/__fixtures/reset')).ok()).toBe(true)
  await page.route('https://fixture.example/english.vtt', route => route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n' }))
})

test('a saved watch resumes on a chosen server after automatic startup fails', async ({ page }, info) => {
  await page.goto('/watch/movie/1')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate((el: HTMLVideoElement) => { el.currentTime = 12; el.pause() })
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('consumit.progress:guest:movie:1:0:0') ?? '{}').positionSeconds)).toBeGreaterThanOrEqual(12)
  await page.route('**/v1/playback/resolve', route => route.request().postDataJSON().providerId ? route.continue() : route.fulfill({ status: 503, json: { error: { code: 'PLAYBACK_UNAVAILABLE', message: 'Automatic playback could not start.', requestId: 'fixture-request', retryable: true } } }))
  await page.reload()
  await page.getByRole('button', { name: 'Choose another server' }).click()
  await expect(page.getByRole('option', { name: 'backup', exact: true })).toBeAttached()
  const server = page.getByRole('combobox', { name: 'Server' })
  await expect(server).toBeEnabled()
  if (process.env.PLAYBACK_VISUAL === '1') {
    await mkdir('.impeccable/review', { recursive: true })
    await page.screenshot({ path: `.impeccable/review/startup-server-${info.project.name}.png` })
  }
  const selected = page.waitForResponse(response => response.url().endsWith('/resolve') && response.ok())
  await server.selectOption('backup')
  expect((await (await selected).json()).source.providerId).toBe('backup')
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(640)
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThanOrEqual(12)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})

test('startup server discovery and the selected server both remain retryable', async ({ page }) => {
  let lists = 0, starts = 0
  await page.route('**/v1/playback/providers', route => ++lists === 1 ? route.fulfill({ status: 503, json: {} }) : route.continue())
  await page.route('**/v1/playback/resolve', route => {
    const selected = route.request().postDataJSON().providerId
    if (!selected || ++starts === 1) return route.fulfill({ status: 503, json: { error: { code: 'PLAYBACK_UNAVAILABLE', message: 'This server could not start.', requestId: 'fixture-request', retryable: true } } })
    expect(selected).toBe('backup')
    return route.continue()
  })
  await page.goto('/watch/movie/1')
  await page.getByRole('button', { name: 'Choose another server' }).click()
  await page.getByRole('button', { name: 'Retry server list' }).click()
  await expect(page.getByRole('option', { name: 'backup', exact: true })).toBeAttached()
  await page.getByRole('combobox', { name: 'Server' }).selectOption('backup')
  await expect(page.getByRole('region', { name: 'Playback reference 1 playback', exact: true }).getByRole('alert')).toContainText('This server could not start.')
  await expect(page.getByRole('combobox', { name: 'Server' })).toHaveValue('backup')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect.poll(() => page.locator('video').evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(640)
  expect(lists).toBe(2)
  expect(starts).toBe(2)
})
