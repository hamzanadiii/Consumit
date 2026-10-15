import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

test('adapter-declared raw VTT subtitle playlists retain Direct HLS video and captions', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ audioLanguage: 'en', animeAudio: 'sub', subtitlesEnabled: true, subtitleLanguages: ['en'], qualityHeight: null, autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'completed', communityDismissed: false }))
  })
  await page.route('**/v1/subtitles/discover?*', route => route.fulfill({ contentType: 'application/x-ndjson', body: '{"type":"complete","searchId":"78f506d8-4c60-44ed-88dc-c3a20f20b488","languages":[]}\n' }))
  await page.route('**/v1/playback/resolve', async route => {
    const response = await route.fetch()
    const session = await response.json()
    Object.assign(session.source, { type: 'hls', src: 'https://experience-media.example/master.m3u8', hlsSubtitlePlaylistFormat: 'vtt', subtitles: [] })
    await route.fulfill({ response, json: session })
  })
  const reads: string[] = []
  await page.route('https://experience-media.example/**', async route => {
    const name = new URL(route.request().url()).pathname.slice(1)
    reads.push(name)
    const body = name === 'master.m3u8'
      ? '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="raw.vtt"\n#EXT-X-STREAM-INF:BANDWIDTH=650000,RESOLUTION=640x360,CODECS="avc1.42c01e,mp4a.40.2",SUBTITLES="subs"\nmedia.m3u8\n'
      : name === 'raw.vtt' ? 'WEBVTT\n\n00:00:00.000 --> 00:00:30.000\nDirect provider caption\n'
      : await readFile(`tests/playback/media/${name}`)
    await route.fulfill({ contentType: name.endsWith('.vtt') ? 'text/vtt' : name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t', headers: { 'access-control-allow-origin': '*' }, body })
  })
  await page.goto('/watch/movie/693134')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
  await page.locator('video').evaluate((video: HTMLVideoElement) => { video.pause(); video.currentTime = 2 })
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => Array.from(video.textTracks).flatMap(track => track.language === 'en' && track.mode === 'showing' ? Array.from(track.activeCues ?? []).map(cue => (cue as VTTCue).text) : []))).toEqual(['Direct provider caption'])
  expect(reads.filter(name => name === 'raw.vtt').length).toBeGreaterThanOrEqual(2)
  expect(reads.some(name => name.endsWith('.ts'))).toBe(true)
})
