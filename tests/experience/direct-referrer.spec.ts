import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

for (const type of ['native', 'hls'] as const) for (const navigation of ['document', 'client'] as const) {
  test(`Direct ${type} playback omits the Watch referrer after ${navigation} navigation`, async ({ page }) => {
    const media = await readFile('tests/playback/media/reference.mp4')
    const referrers: Array<string | undefined> = []
    await page.addInitScript(() => {
      localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ audioLanguage: 'en', animeAudio: 'sub', subtitlesEnabled: false, subtitleLanguages: ['en'], qualityHeight: null, autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'completed', communityDismissed: false }))
    })
    await page.route('**/v1/playback/resolve', async route => {
      const response = await route.fetch()
      const session = await response.json()
      session.source.type = type
      session.source.src = `https://experience-media.example/${type === 'hls' ? 'master.m3u8' : 'no-referrer.mp4'}`
      await route.fulfill({ response, json: session })
    })
    await page.route('https://experience-media.example/**', async route => {
      const referer = route.request().headers().referer
      referrers.push(referer)
      if (referer) {
        await route.fulfill({ status: 403, headers: { 'access-control-allow-origin': '*' }, body: 'Forbidden' })
        return
      }
      const file = new URL(route.request().url()).pathname.slice(1)
      if (file === 'french.vtt') { await route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n', headers: { 'access-control-allow-origin': '*' } }); return }
      if (/^(?:master|media)\.m3u8$|^segment-\d{2}\.ts$/.test(file)) {
        await route.fulfill({ contentType: file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t', headers: { 'access-control-allow-origin': '*' }, body: await readFile(`tests/playback/media/${file}`) })
        return
      }
      const match = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/)
      const start = match ? Math.min(Number(match[1]), media.length - 1) : 0
      const end = match?.[2] ? Math.min(Number(match[2]), media.length - 1) : media.length - 1
      await route.fulfill({ status: match ? 206 : 200, contentType: 'video/mp4', headers: { 'access-control-allow-origin': '*', 'accept-ranges': 'bytes', ...(match ? { 'content-range': `bytes ${start}-${end}/${media.length}` } : {}) }, body: media.subarray(start, end + 1) })
    })
    if (navigation === 'document') {
      await page.goto('/watch/movie/693134')
    } else {
      await page.goto('/title/693134')
      await page.evaluate(() => { (window as Window & { referrerNavigationMarker?: boolean }).referrerNavigationMarker = true })
      await page.locator('a[href="/watch/movie/693134"]').first().click()
      await expect(page).toHaveURL(/\/watch\/movie\/693134/)
      expect(await page.evaluate(() => (window as Window & { referrerNavigationMarker?: boolean }).referrerNavigationMarker)).toBe(true)
    }
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
    expect(referrers.length).toBeGreaterThan(0)
    expect(referrers.every(value => value === undefined)).toBe(true)
    await page.locator('video').evaluate(async (video: HTMLVideoElement) => {
      video.muted = true
      await video.play()
      await new Promise<void>(resolve => video.requestVideoFrameCallback(() => resolve()))
      video.pause()
    })
    // The route metadata must restore the ordinary policy after leaving Watch.
    if (navigation === 'client') {
      await page.goBack()
      await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'strict-origin-when-cross-origin')
    }
  })
}

test('Provider Embed retains its explicit referrer policy inside Watch', async ({ page }) => {
  await page.route('**/v1/playback/resolve', async route => {
    const response = await route.fetch()
    const session = await response.json()
    Object.assign(session.source, { type: 'iframe', delivery: 'embed', src: 'https://experience-frame.example/player' })
    await route.fulfill({ response, json: session })
  })
  const frameRequests: Array<string | undefined> = []
  await page.route('https://experience-frame.example/player', async route => {
    frameRequests.push(route.request().headers().referer)
    await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Fixture provider</title>' })
  })
  await page.goto('/watch/movie/693134')
  await expect(page.locator('iframe')).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
  await expect.poll(() => frameRequests).toEqual(['http://127.0.0.1:28114/'])
  await expect(page.locator('video')).toHaveCount(0)
})
