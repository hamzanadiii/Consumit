import { test, expect } from '@playwright/test'

for (const fallback of [false, true]) {
  test(`saved Arabic then English turns captions on automatically${fallback ? ' using English when Arabic fails' : ''}`, async ({ page }) => {
    const searchId = '78f506d8-4c60-44ed-88dc-c3a20f20b488'
    const prepared: string[] = []
    await page.addInitScript(() => localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ audioLanguage: 'en', animeAudio: 'sub', subtitlesEnabled: true, subtitleLanguages: ['ar', 'en'], qualityHeight: null, autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'completed', communityDismissed: false })))
    await page.route('**/v1/playback/resolve', async route => {
      const response = await route.fetch()
      const session = await response.json()
      session.source.subtitles = []
      await route.fulfill({ response, json: session })
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
    await page.route('https://experience-media.example/*.vtt', route => route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00:00.000 --> 00:00:30.000\nAutomatic saved captions.\n' }))
    await page.goto('/watch/movie/693134')
    const language = fallback ? 'en' : 'ar'
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => [...video.textTracks].filter(track => track.mode === 'hidden').map(track => track.language))).toEqual([language])
    expect(prepared).toEqual(fallback ? ['ar', 'en'] : ['ar'])
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByText('Automatic saved captions.', { exact: true })).toBeVisible()
    // Automatic fallback changes the active track, never the saved order or switch.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('consumit.experience.guest.v1')!))).toMatchObject({ subtitlesEnabled: true, subtitleLanguages: ['ar', 'en'] })
    await page.getByRole('button', { name: 'Subtitles', exact: true }).click()
    await expect(page.getByRole('menuitemradio', { name: 'Off', exact: true })).toHaveAttribute('aria-checked', 'false')
    await page.getByRole('menuitemradio', { name: 'Off', exact: true }).click()
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => [...video.textTracks].filter(track => track.mode === 'hidden').length)).toBe(0)
  })
}
