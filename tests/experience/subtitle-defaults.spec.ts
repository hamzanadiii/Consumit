import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

for (const fallback of [false, true]) {
  test(`saved Arabic then English turns captions on automatically${fallback ? ' using English when Arabic fails' : ''}`, async ({ page }) => {
    const searchId = '78f506d8-4c60-44ed-88dc-c3a20f20b488'
    const prepared: string[] = []
    const media = await readFile('tests/playback/media/reference.mp4')
    await page.addInitScript(() => localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ audioLanguage: 'en', animeAudio: 'sub', subtitlesEnabled: true, subtitleLanguages: ['ar', 'en'], qualityHeight: null, autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'completed', communityDismissed: false })))
    await page.route('**/v1/playback/attempts', async route => {
      const response = await route.fetch()
      const attempt = await response.json()
      attempt.session.source.src = 'https://experience-media.example/subtitle-defaults.mp4'
      attempt.session.source.subtitles = []
      await route.fulfill({ response, json: attempt })
    })
    // The scenario is about saved language fallback, not live provider catalogues.
    await page.route('**/v1/subtitles?*', route => route.fulfill({ json: { subtitles: [] } }))
    await page.route('https://experience-media.example/subtitle-defaults.mp4', async route => {
      const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/)
      const start = range ? Math.min(Number(range[1]), media.length - 1) : 0
      const end = range?.[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1
      await route.fulfill({
        status: range ? 206 : 200,
        contentType: 'video/mp4',
        headers: { 'access-control-allow-origin': '*', 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${media.length}` } : {}) },
        body: media.subarray(start, end + 1),
      })
    })
    await page.route('**/v1/subtitles/discover?*', async route => {
      const languages = [{ code: 'ar', count: 1 }, { code: 'en', count: 1 }]
      await route.fulfill({ contentType: 'application/x-ndjson', body: [{ type: 'snapshot', searchId, languages: [] }, { type: 'complete', searchId, languages }].map(event => JSON.stringify(event)).join('\n') + '\n' })
    })
    await page.route('**/v1/subtitles/discover/page?*', async route => {
      const language = new URL(route.request().url()).searchParams.get('language')!
      await route.fulfill({ json: { tracks: [{ id: language, label: language === 'ar' ? 'Arabic' : 'English', language, provider: 'fixture' }], total: 1, nextCursor: null } })
    })
    await page.route('**/v1/subtitles/discover/prepare', async route => {
      const language = route.request().postDataJSON().candidateId
      prepared.push(language)
      if (fallback && language === 'ar') { await route.fulfill({ status: 503, json: {} }); return }
      await route.fulfill({ json: { id: language, label: language === 'ar' ? 'Arabic' : 'English', language, url: `https://experience-media.example/${language}.vtt`, format: 'vtt' } })
    })
    await page.route('https://experience-media.example/*.vtt', route => route.fulfill({ contentType: 'text/vtt', headers: { 'access-control-allow-origin': '*' }, body: 'WEBVTT\n\n00:00:00.000 --> 00:00:30.000\nAutomatic saved captions.\n' }))
    await page.goto('/watch/movie/693134')
    const language = fallback ? 'en' : 'ar'
    await expect.poll(() => prepared).toEqual(fallback ? ['ar', 'en'] : ['ar'])
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => {
      const track = [...video.textTracks].find(candidate => candidate.mode === 'hidden')
      return track ? { language: track.language, cueCount: track.cues?.length ?? 0 } : null
    })).toEqual({ language, cueCount: 1 })
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByText('Automatic saved captions.', { exact: true })).toBeVisible()
    // Automatic fallback changes the active track, never the saved order or switch.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('consumit.experience.guest.v1')!))).toMatchObject({ subtitlesEnabled: true, subtitleLanguages: ['ar', 'en'] })
    await page.getByRole('button', { name: 'Captions', exact: true }).click()
    await expect(page.getByRole('radio', { name: 'Off', exact: true })).toHaveAttribute('aria-checked', 'false')
    await page.getByRole('radio', { name: 'Off', exact: true }).click()
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => [...video.textTracks].filter(track => track.mode === 'hidden').length)).toBe(0)
  })
}
