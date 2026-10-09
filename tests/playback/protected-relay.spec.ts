import { playbackSessionSchema } from '../../packages/contracts/src/index'
import { expect, test } from '@playwright/test'

for (const [id, format] of [[7, 'HLS'], [8, 'native']] as const) test(`cookie-bound ${format} decodes and seeks while copied URLs fail`, async ({ page, request, browser }) => {
  await request.post('http://127.0.0.1:18559/__fixtures/reset')
  const resolving = page.waitForResponse(response => response.url().endsWith('/v1/playback/resolve') && response.request().method() === 'POST')
  await page.goto(`/watch/movie/${id}`)
  const session = playbackSessionSchema.parse(await (await resolving).json())
  expect(session.source.delivery).toBe('relay')
  expect(session.source.src).toMatch(/^http:\/\/127\.0\.0\.1:27911\/media\//)
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate((element: HTMLVideoElement) => { element.currentTime = 12 })
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(12)
  const authorized = await page.request.get(session.source.src)
  expect(authorized.ok()).toBe(true)
  expect(authorized.headers()['cache-control']).toBe('private, no-store')
  const foreign = await browser.newContext()
  try {
    expect((await foreign.request.get(session.source.src)).status()).toBe(403)
    expect((await page.request.get(session.source.src, { headers: { Origin: 'https://foreign.example' } })).status()).toBe(403)
  } finally { await foreign.close() }
  if (format === 'native') {
    const range = await page.request.get(session.source.src, { headers: { Range: 'bytes=0-99' } })
    expect(range.status()).toBe(206)
    expect((await range.body()).byteLength).toBe(100)
  }
})
