import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import type { ProviderHttp } from '../index.ts'
import { createVideasyProvider } from './videasy.ts'
import { keystream } from './wecollege-cipher.ts'

const now = Date.UTC(2026, 8, 9)
const input = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const episode = { ...input, ref: { kind: 'series' as const, id: 2, season: 3, episode: 4 } }
const mediaPlaylist = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6,\nseg.ts'
const metadata = async () => ({ title: 'Fight Club', year: 1999, imdbId: 'tt0137523' })

function seal(payload: unknown, seed: string, tmdb: number): string {
  const body = Buffer.concat([Buffer.from([109, 118, 109, 49]), Buffer.from(JSON.stringify(payload))])
  const ks = keystream(seed, tmdb, body.length)
  return Buffer.from(body.map((byte, index) => byte ^ ks[index]!)).toString('base64url')
}

function http(...responses: { status?: number; text: string }[]) {
  return vi.fn<ProviderHttp>(async (url, _headers, signal) => {
    signal.throwIfAborted()
    const next = responses.shift()
    if (!next) throw new Error(`Unexpected request ${url}`)
    return { status: next.status ?? 200, text: next.text, url }
  })
}

describe('videasy provider contract', () => {
  it('resolves movies through seed, cipher, and server fanout', async () => {
    const seed = 'videasy-seed-1'
    const client = http(
      { text: JSON.stringify({ seed, ttlMs: 30000 }) },
      { text: seal({ sources: [{ quality: '1080p', url: 'https://cdn.example/videasy.m3u8' }], subtitles: [{ url: 'https://cdn.example/en.vtt', lang: 'English' }] }, seed, 550) },
      { text: JSON.stringify({}) },
      { text: JSON.stringify({}) },
      { text: JSON.stringify({}) },
      { text: JSON.stringify({}) },
      { text: JSON.stringify({}) },
      { text: JSON.stringify({}) },
      { text: JSON.stringify({}) },
      { text: mediaPlaylist },
    )
    const result = await createVideasyProvider(client, metadata, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://api.speedracelight.com/seed?mediaId=550')
    expect(client.mock.calls[1]?.[0]).toContain('https://api.speedracelight.com/cdn/sources-with-title?')
    expect(client.mock.calls[1]?.[0]).toContain('mediaType=Movie')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'videasy:cdn:0', type: 'hls', height: 1080, qualityHint: '1080p' }] })
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'videasy-sub-0', format: 'vtt' }])
  })

  it('resolves episodes with TV Series media type and season/episode identifiers', async () => {
    const seed = 'videasy-seed-2'
    const client = http(
      { text: JSON.stringify({ seed }) },
      { text: seal({ sources: [{ quality: '720p', url: 'https://cdn.example/ep.m3u8' }] }, seed, 2) },
      { text: JSON.stringify({}) },
      { text: JSON.stringify({}) },
      { text: JSON.stringify({}) },
      { text: JSON.stringify({}) },
      { text: JSON.stringify({}) },
      { text: JSON.stringify({}) },
      { text: mediaPlaylist },
    )
    const result = await createVideasyProvider(client, metadata, () => now).resolve(episode, new AbortController().signal)
    // Meine is movies-only, so 7 TV servers fan out after the seed.
    expect(client.mock.calls).toHaveLength(9)
    expect(client.mock.calls[1]?.[0]).toContain('mediaType=TV+Series')
    expect(client.mock.calls[1]?.[0]).toContain('seasonId=3&episodeId=4')
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://cdn.example/ep.m3u8', height: 720 }] })
  })

  it('fails over to the sibling host when the preferred seed host is down', async () => {
    const seed = 'videasy-seed-3'
    const calls: string[] = []
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      calls.push(url)
      if (url === 'https://api.speedracelight.com/seed?mediaId=550') return { status: 500, text: 'down', url }
      if (url === 'https://api.videasy.to/seed?mediaId=550') return { status: 200, text: JSON.stringify({ seed }), url }
      if (url.includes('/cdn/sources-with-title')) return { status: 200, text: seal({ sources: [{ quality: '1080p', url: 'https://cdn.example/failover.m3u8' }] }, seed, 550), url }
      if (url.includes('/sources-with-title')) return { status: 200, text: JSON.stringify({}), url }
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      throw new Error(`Unexpected request ${url}`)
    })
    const result = await createVideasyProvider(client, metadata, () => now).resolve(input, new AbortController().signal)
    expect(calls.slice(0, 2)).toEqual([
      'https://api.speedracelight.com/seed?mediaId=550',
      'https://api.videasy.to/seed?mediaId=550',
    ])
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://cdn.example/failover.m3u8' }] })
  })

  it('reports empty when every server answers without sources', async () => {
    const seed = 'videasy-seed-4'
    const responses = [
      { text: JSON.stringify({ seed }) },
      ...Array.from({ length: 8 }, () => ({ text: seal({ sources: [] }, seed, 550) })),
      { text: JSON.stringify({ seed }) },
      ...Array.from({ length: 8 }, () => ({ text: seal({ sources: [] }, seed, 550) })),
    ]
    const result = await createVideasyProvider(http(...responses), metadata, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
  })

  it('distinguishes missing titles, cancellation, timeout, and malformed documents', async () => {
    expect(await createVideasyProvider(http({ status: 404, text: '' }), metadata, () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'empty' })
    const client = http()
    expect(await createVideasyProvider(client, metadata, () => now).resolve(input, AbortSignal.abort())).toMatchObject({ code: 'cancelled' })
    expect(await createVideasyProvider(client, metadata, () => now).resolve(input, AbortSignal.abort(new DOMException('deadline', 'TimeoutError')))).toMatchObject({ code: 'timeout' })
    expect(client).not.toHaveBeenCalled()
    const badCipher = http({ text: JSON.stringify({ seed: 's' }) }, { text: 'not-encrypted' })
    expect(await createVideasyProvider(badCipher, metadata, () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'empty' })
  })
})
