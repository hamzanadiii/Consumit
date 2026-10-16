import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

for (const sourceType of ['native', 'hls']) {
for (const extension of ['srt', 'vtt']) {
  test(`uploaded ${extension} stays visible across ${sourceType} playback, seeking and replacement at zero sync offset`, async ({ page }) => {
    await page.setViewportSize(extension === 'srt' ? { width: 1440, height: 1000 } : { width: 390, height: 844 })
    await page.addInitScript(() => {
      localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ audioLanguage: 'en', animeAudio: 'sub', subtitlesEnabled: false, subtitleLanguages: ['ar', 'en'], qualityHeight: null, autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'completed', communityDismissed: false }))
    })
    await page.route('**/v1/subtitles/discover?*', route => route.fulfill({ contentType: 'application/x-ndjson', body: [
      { type: 'snapshot', searchId: '78f506d8-4c60-44ed-88dc-c3a20f20b488', languages: [] },
      { type: 'complete', searchId: '78f506d8-4c60-44ed-88dc-c3a20f20b488', languages: [] },
    ].map(event => JSON.stringify(event)).join('\n') + '\n' }))
    await page.route('https://experience-media.example/*.vtt', route => route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00:00.000 --> 00:00:30.000\nBundled caption\n' }))
    if (sourceType === 'hls') {
      await page.route('**/v1/playback/resolve', async route => {
        const response = await route.fetch()
        const session = await response.json()
        Object.assign(session.source, { type: 'hls', src: 'https://upload-media.example/media.m3u8' })
        await route.fulfill({ response, json: session })
      })
      await page.route('https://upload-media.example/**', async route => {
        const name = new URL(route.request().url()).pathname.slice(1)
        await route.fulfill({ contentType: name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t', headers: { 'access-control-allow-origin': '*' }, body: await readFile(`tests/playback/media/${name}`) })
      })
    }
    await page.goto('/watch/movie/693134')
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
    await page.locator('video').evaluate((video: HTMLVideoElement) => { video.pause(); video.currentTime = 2 })
    const captions = page.locator('[data-consumit-player-caption]')
    const subtitleButton = page.getByRole('button', { name: 'Subtitles', exact: true })
    const content = (text: string) => {
      const cues = `1\n00:00:00.000 --> 00:00:04.000\n${text}\n\n2\n00:00:08.000 --> 00:00:12.000\n${text} later\n\n3\n00:00:20.000 --> 00:00:26.000\n${text} last\n`
      return extension === 'srt' ? cues.replaceAll('.', ',') : `WEBVTT\n\n${cues}`
    }

    for (const text of ['Uploaded caption', 'Replacement caption']) {
      await subtitleButton.click()
      await page.locator('input[type="file"]').setInputFiles({ name: `captions.${extension}`, mimeType: extension === 'srt' ? 'application/x-subrip' : 'text/vtt', buffer: Buffer.from(content(text)) })
      await expect(captions).toHaveText(text)
      await expect(captions).toBeVisible()
      await subtitleButton.click()
      await page.getByRole('searchbox').fill('')
      await expect(page.getByRole('menuitemradio', { name: /captions\./ })).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByText('Uploaded · current viewing session')).toBeVisible()
      if (text === 'Replacement caption') {
        await page.screenshot({ path: `.impeccable/review/subtitles-upload/${sourceType}-${extension}-menu.png` })
        await page.getByRole('button', { name: 'Subtitle appearance', exact: true }).click()
        await expect(page.getByLabel('Subtitle preview')).toBeVisible()
        await page.getByRole('button', { name: 'Boxed', exact: true }).click()
        await page.screenshot({ path: `.impeccable/review/subtitles-upload/${sourceType}-${extension}-appearance.png` })
        await page.getByRole('button', { name: 'Back to subtitles' }).click()
      }
      await page.getByRole('searchbox').fill('captions.')
      await expect(page.getByRole('menuitemradio', { name: /captions\./ })).toHaveAttribute('aria-checked', 'true')
      await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => [...video.textTracks].filter(track => track.mode === 'hidden').map(track => track.language))).toEqual(['und'])
      await page.getByRole('menuitemradio', { name: /captions\./ }).click()
      if (sourceType === 'hls') {
        await page.locator('video').evaluate(async (video: HTMLVideoElement) => { video.muted = true; await video.play() })
        await expect(captions).toHaveText(`${text} later`, { timeout: 15_000 })
        await page.locator('video').evaluate((video: HTMLVideoElement) => video.pause())
      }
      for (const [time, expected] of [[9, `${text} later`], [22, `${text} last`], [6, null], [2, text]] as const) {
        await page.locator('video').evaluate((video: HTMLVideoElement, time) => { video.currentTime = time }, time)
        if (expected) await expect(captions).toHaveText(expected)
        else await expect(captions).toHaveCount(0)
      }
    }
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('consumit.experience.guest.v1')!))).toMatchObject({ subtitlesEnabled: true, subtitleLanguages: ['ar', 'en'] })
    await subtitleButton.click()
    await page.locator('input[type="file"]').setInputFiles({ name: 'broken.vtt', mimeType: 'text/vtt', buffer: Buffer.from('WEBVTT\n\nno cues') })
    await expect(page.getByText('This file has no usable subtitle cues.')).toBeVisible()
    await expect(page.getByRole('menuitemradio', { name: /captions\./ })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('menuitemradio', { name: 'Off', exact: true }).click()
    await expect(captions).toHaveCount(0)
  })
}
}
