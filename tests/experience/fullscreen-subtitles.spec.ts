import { expect, test } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'

for (const sourceType of ['native', 'hls']) {
  test(`full-player fallback retains selected and uploaded captions through ${sourceType} playback and rotation`, async ({ page }, testInfo) => {
    await mkdir('.impeccable/review/ios-fullscreen', { recursive: true })
    await page.addInitScript(() => {
      localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ audioLanguage: 'en', animeAudio: 'sub', subtitlesEnabled: false, subtitleLanguages: ['ar', 'en'], qualityHeight: null, autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'completed', communityDismissed: true }))
      Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: undefined })
      Object.defineProperty(HTMLVideoElement.prototype, 'webkitEnterFullscreen', { configurable: true, value: undefined })
    })
    await page.route('**/v1/subtitles/discover?*', route => route.fulfill({ contentType: 'application/x-ndjson', body: [
      { type: 'snapshot', searchId: '78f506d8-4c60-44ed-88dc-c3a20f20b488', languages: [] },
      { type: 'complete', searchId: '78f506d8-4c60-44ed-88dc-c3a20f20b488', languages: [] },
    ].map(event => JSON.stringify(event)).join('\n') + '\n' }))
    await page.route('https://experience-media.example/*.vtt', route => route.fulfill({ contentType: 'text/vtt', headers: { 'access-control-allow-origin': '*' }, body: 'WEBVTT\n\n00:00:00.000 --> 00:00:30.000\nProvider caption\n' }))
    if (sourceType === 'hls') {
      await page.route('**/v1/playback/resolve', async route => {
        const response = await route.fetch()
        const session = await response.json()
        Object.assign(session.source, { type: 'hls', src: 'https://fullscreen-media.example/media.m3u8' })
        await route.fulfill({ response, json: session })
      })
      await page.route('https://fullscreen-media.example/**', async route => {
        const name = new URL(route.request().url()).pathname.slice(1)
        await route.fulfill({ contentType: name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t', headers: { 'access-control-allow-origin': '*' }, body: await readFile(`tests/playback/media/${name}`) })
      })
    }
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/watch/movie/693134')
    const video = page.locator('video').first()
    const captions = page.locator('[data-consumit-player-caption]')
    const player = page.locator('[data-consumit-player]').first()
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0)
    await video.evaluate(async (v: HTMLVideoElement) => { v.muted = true; await v.play(); v.pause(); v.currentTime = 2 })
    await page.getByRole('button', { name: 'Subtitles', exact: true }).click()
    await page.getByRole('searchbox').fill('French')
    await page.getByRole('menuitemradio', { name: /Français/ }).click()
    await expect(captions).toHaveText('Provider caption')
    await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click()
    await expect(player).toHaveAttribute('data-viewport-fullscreen', 'true')
    await expect(captions).toBeVisible()
    await expect.poll(async () => {
      const bounds = (await player.boundingBox())!
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      return Math.abs(bounds.x) < 1 && Math.abs(bounds.y) < 1 && Math.abs(bounds.width - viewport.width) < 1 && Math.abs(bounds.height - viewport.height) < 1
    }).toBe(true)
    await expect(video).toHaveAttribute('playsinline', '')
    await video.evaluate(async (v: HTMLVideoElement) => { v.muted = true; await v.play() })
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(2.5)
    await expect(captions).toHaveText('Provider caption')
    await video.evaluate((v: HTMLVideoElement) => v.pause())
    for (const [extension, width, height] of [['srt', 390, 844], ['vtt', 844, 390]] as const) {
      await page.setViewportSize({ width, height })
      await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 2 })
      await page.getByRole('button', { name: 'Subtitles', exact: true }).click()
      const body = `00:00:00.000 --> 00:00:04.000\nUploaded ${extension}\n\n00:00:08.000 --> 00:00:12.000\nLater ${extension}\n`
      await page.locator('input[type="file"]').setInputFiles({ name: `captions.${extension}`, mimeType: extension === 'srt' ? 'application/x-subrip' : 'text/vtt', buffer: Buffer.from(extension === 'srt' ? body.replaceAll('.', ',') : `WEBVTT\n\n${body}`) })
      await expect(captions).toHaveText(`Uploaded ${extension}`)
      await expect(captions).toBeVisible()
      await page.screenshot({ path: `.impeccable/review/ios-fullscreen/${testInfo.project.name}-${sourceType}-${extension}.png` })
      await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 10 })
      await expect(captions).toHaveText(`Later ${extension}`)
      await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click()
      await expect(player).not.toHaveAttribute('data-viewport-fullscreen')
      await expect(captions).toBeVisible()
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
      // A rejected request must use the same caption-preserving fallback.
      await page.evaluate(() => Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: () => Promise.reject(new Error('Denied')) }))
      await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click()
      await expect(player).toHaveAttribute('data-viewport-fullscreen', 'true')
      await expect(captions).toHaveText(`Later ${extension}`)
    }
    await page.getByRole('button', { name: 'Subtitles', exact: true }).click()
    await page.getByRole('menuitemradio', { name: 'Off', exact: true }).click()
    await expect(captions).toHaveCount(0)
    await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click()
    expect(errors).toEqual([])
  })
}
