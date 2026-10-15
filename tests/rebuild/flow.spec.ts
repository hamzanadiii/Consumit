import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

test('browse, sign in, decode, resume and save through separate Node processes', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ audioLanguage: 'en', animeAudio: 'sub', subtitlesEnabled: false, subtitleLanguages: ['en'], qualityHeight: null, autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'completed', communityDismissed: true })) })
  const media = await readFile('tests/playback/media/reference.mp4')
  await page.route('https://rebuild-media.example/**', async route => {
    const match = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/)
    const start = match ? Math.min(Number(match[1]), media.length - 1) : 0
    const end = match?.[2] ? Math.min(Number(match[2]), media.length - 1) : media.length - 1
    await route.fulfill({ status: match ? 206 : 200, contentType: 'video/mp4', headers: { 'access-control-allow-origin': '*', 'accept-ranges': 'bytes', ...(match ? { 'content-range': `bytes ${start}-${end}/${media.length}` } : {}) }, body: media.subarray(start, end + 1) })
  })
  await page.goto('/movies')
  await expect(page.getByText('Dune: Part Two').first()).toBeVisible()
  await page.goto('/sign-in')
  await page.getByLabel('Email', { exact: true }).fill('rebuild-browser@example.test')
  await page.getByLabel('Password', { exact: true }).fill('RebuildBrowserPassword123!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).not.toHaveURL(/\/sign-in/)
  await page.request.delete('/v1/me/library/titles/movie/693134', { headers: { origin: 'http://127.0.0.1:28119' } })
  await page.goto('/watch/movie/693134')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate(async (element: HTMLVideoElement) => { element.muted = true; await element.play(); await new Promise<void>(resolve => element.requestVideoFrameCallback(() => resolve())); element.currentTime = 10 })
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(11)
  await video.evaluate((element: HTMLVideoElement) => element.pause())
  await expect.poll(async () => { const result = await page.request.get('/v1/progress/movie/693134'); return result.status() === 200 ? (await result.json()).positionSeconds : 0 }).toBeGreaterThanOrEqual(9)
  await page.reload()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(9)
  await page.goto('/title/693134')
  await page.getByRole('button', { name: 'Save Dune: Part Two to library', exact: true }).first().click()
  await expect.poll(async () => (await page.request.get('/v1/me/library')).json().then(value => value.saved.items.some((item: { id: number }) => item.id === 693134))).toBe(true)
  expect((await page.request.post('/v1/internal/playback/config')).status()).toBe(404)
})
