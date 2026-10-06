import { describe, expect, it, vi } from 'vitest'
import { createFrameProvider } from './frames.ts'
import { createRigelProvider } from './rigel.ts'
import { validatedSources, type ProviderRegistration } from '../index.ts'
const signal = new AbortController().signal
const movie = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
describe('reviewed provider frames', () => {
  it.each(['apiplayerframe', 'embedapiframe', 'vsembedframe'] as const)('keeps exact TMDB episode identity for %s', async id => {
    const http = vi.fn(async (url: string) => ({ status: 200, url, text: 'jw-server-list embeddable movie and tv player' }))
    const provider = createFrameProvider(id, http)
    const result = await provider.resolve({ ...movie, ref: { kind: 'series', id: 235930, season: 2, episode: 3 } }, signal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Missing frame')
    expect(result.sources[0]?.type).toBe('iframe')
    expect(result.sources[0]?.url).toContain(id === 'vsembedframe' ? 'tmdb=235930&season=2&episode=3' : '/tv/235930/2/3')
    expect((await provider.resolve({ ...movie, ref: { kind: 'anime', id: 550, episode: 1 } }, signal)).ok).toBe(false)
  })
  it('requires the requested anime lane and reviewed frame origin', async () => {
    const http = vi.fn(async (url: string) => ({ status: 200, url, text: url.includes('/api/') ? JSON.stringify({ servers: [{ dataLink: 'https://flixcloud.cc/e/exact?v=1', dataType: 'sub' }] }) : 'player' }))
    const provider = createFrameProvider('reanimeframe', http)
    expect((await provider.resolve({ ...movie, ref: { kind: 'anime', id: 21, episode: 4 } }, signal)).ok).toBe(false)
    expect(http).toHaveBeenCalledTimes(1)
    const result = await provider.resolve({ ...movie, audioLanguage: 'ja', ref: { kind: 'anime', id: 21, episode: 4 } }, signal)
    expect(result.ok).toBe(true)
    expect(http.mock.calls[0]?.[0]).toBe('https://reanime.to/api/flix/21/4')
    http.mockImplementation(async url => ({ status: 200, url, text: JSON.stringify({ servers: [{ dataLink: 'https://evil.example/e/exact', dataType: 'sub' }] }) }))
    expect((await provider.resolve({ ...movie, audioLanguage: 'ja', ref: { kind: 'anime', id: 21, episode: 4 } }, signal)).ok).toBe(false)
  })
  it('rejects a fuzzy MegaPlay title match with a different AniList ID', async () => {
    const http = vi.fn(async (url: string) => ({ status: 200, url, text: JSON.stringify({ data: [{ slug: 'wrong', anilistId: 1726 }] }) }))
    const provider = createFrameProvider('megaplayframe', http, async () => ['Devil May Cry'])
    expect((await provider.resolve({ ...movie, ref: { kind: 'anime', id: 999, episode: 1 } }, signal)).ok).toBe(false)
    expect(http).toHaveBeenCalledTimes(1)
  })
  it('excludes frames from media registrations and rejects frame headers', async () => {
    const http = async (url: string) => ({ status: 200, url, text: 'jw-server-list' })
    const adapter = createFrameProvider('apiplayerframe', http)
    const result = await adapter.resolve(movie, signal)
    const registration: ProviderRegistration = { adapter, enabled: true, deliveryMode: 'embed', mediaHosts: ['apiplayer.ru'], approvedRegions: ['US'], mediaKinds: ['movie'], upstreamGroup: adapter.id, concurrency: 2, requestsPerMinute: 30 }
    expect(validatedSources(result, registration)).toHaveLength(1)
    expect(validatedSources(result, { ...registration, deliveryMode: 'direct' })).toEqual([])
    if (!result.ok) throw new Error('Missing fixture frame')
    expect(validatedSources({ ok: true, sources: result.sources.map(source => ({ ...source, headers: { referer: 'https://example.com' } })) }, registration)).toEqual([])
  })
  it('Rigel handles nullable qualities and does not accept anime IDs', async () => {
    const http = vi.fn(async (url: string) => ({ status: 200, url, text: JSON.stringify({ streams: [{ url: 'https://api.dlproxy.com/v1/play/exact', quality: null, label: 'Lyra' }] }) }))
    const provider = createRigelProvider(http)
    const result = await provider.resolve(movie, signal)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
    http.mockClear()
    expect((await provider.resolve({ ...movie, ref: { kind: 'anime', id: 550, episode: 1 } }, signal)).ok).toBe(false)
    expect(http).not.toHaveBeenCalled()
  })
  it('Rigel skips slow /v1/vs/ masters and verifies /v1/play/ chains in parallel', async () => {
    const media = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg.ts'
    const http = vi.fn(async (url: string) => {
      if (url.includes('movish.to')) {
        return { status: 200, url, text: JSON.stringify({ streams: [
          { url: 'https://api.dlproxy.com/v1/vs/slow.m3u8', quality: '1080p', label: 'Rigel' },
          { url: 'https://api.dlproxy.com/v1/play/fast.m3u8', quality: null, label: 'Lyra' },
          { url: 'https://api.dlproxy.com/v1/play/other.m3u8', quality: 'FHDp', label: 'Spica' },
        ] }) }
      }
      if (url.endsWith('seg.ts')) return { status: 206, url, text: '', bytes: new Uint8Array([1, 2, 3]) }
      if (url.endsWith('.m3u8')) return { status: 200, url, text: media }
      throw new Error(`Unexpected ${url}`)
    })
    const result = await createRigelProvider(http).resolve(movie, signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'rigel-0', url: 'https://api.dlproxy.com/v1/play/fast.m3u8' }, { key: 'rigel-1', url: 'https://api.dlproxy.com/v1/play/other.m3u8' }] })
    expect(result.ok && result.sources).toHaveLength(2)
    expect(http.mock.calls.some(([url]) => String(url).includes('/v1/vs/') && String(url).endsWith('.m3u8'))).toBe(false)
  })
})
