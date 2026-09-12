import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test.beforeEach(async ({ request, page }) => {
  const response = await request.post('http://127.0.0.1:18559/__fixtures/reset')
  expect(response.ok()).toBe(true)
  await page.route('https://fixture.example/**', async (route) => {
    const name = new URL(route.request().url()).pathname.slice(1)
    if (!/^(?:reference\.mp4|(?:master|media)\.m3u8|segment-\d{2}\.ts|english\.vtt)$/.test(name)) return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' } })
    const body = await readFile(resolve(process.cwd(), 'tests', 'playback', 'media', name))
    const contentType = name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : name.endsWith('.vtt') ? 'text/vtt' : name.endsWith('.ts') ? 'video/mp2t' : 'video/mp4'
    await route.fulfill({ status: 200, contentType, body, headers: { 'access-control-allow-origin': '*', 'accept-ranges': 'bytes' } })
  })
})

async function start(page: Page, id: number) {
  await page.goto(`/watch/movie/${id}`)
  const startButton = page.getByRole('button', { name: 'Start watching', exact: true })
  if (await startButton.isVisible()) await startButton.click()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
  if (await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)) await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0)
}

test('native playback saves guest progress and resumes after reload', async ({ page }) => {
  await start(page, 1)
  await page.locator('video').evaluate((video: HTMLVideoElement) => { video.currentTime = 12; video.pause() })
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('consumit.progress:guest:movie:1:0:0') ?? '{}').positionSeconds)).toBeGreaterThanOrEqual(12)
  await page.reload()
  const startButton = page.getByRole('button', { name: 'Start watching', exact: true })
  if (await startButton.isVisible()) await startButton.click()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(12)
})

test('direct HLS decodes video and exposes the actual English caption track', async ({ page }) => {
  await start(page, 2)
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(640)
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => Array.from(video.textTracks).some((track) => track.language === 'en' && track.mode === 'showing'))).toBe(true)
  await expect(page.locator('video track[srclang="en"]')).toHaveAttribute('src', /^https:\/\//)
})

test('the imported VixSrc adapter connects API extraction to actual HLS decoding', async ({ page }) => {
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
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(640)
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
