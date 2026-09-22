import { Buffer } from 'node:buffer'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { ProviderHttp } from '../index.ts'
import { createVidluxProvider } from './vidlux.ts'

const now = Date.UTC(2026, 8, 9)
const input = { ref: { kind: 'movie' as const, id: 1 }, region: 'US', audioLanguage: 'en' }
const episode = { ...input, ref: { kind: 'series' as const, id: 2, season: 3, episode: 4 } }

const key = createHash('sha256').update('vidlux-stream-encryption-2026-secure-key', 'utf8').digest()
function seal(payload: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload), 'utf8')), cipher.final()])
  return Buffer.concat([iv, ct, cipher.getAuthTag()]).toString('base64')
}

describe('vidlux provider', () => {
  it('resolves movies through the embed token and AES-GCM extracts, dropping relays and non-VTT captions', async () => {
    const payload = {
      streams: [
        { file: 'https://cdn.example/spider/master.m3u8', quality: '1080p', title: 'Spider', type: 'hls' },
        { file: 'https://cdn.example/spider/file.mp4', quality: '720p', title: 'Spider', type: 'mp4' },
        { file: 'https://x.workers.dev/relay.m3u8', quality: '1080p', title: 'Relay' },
        { file: 'https://relay.example/mp4-proxy?url=https://cdn.example/x.m3u8', quality: 'Auto' },
        { file: 'http://cdn.example/insecure.m3u8', quality: 'Auto' },
        { file: 'https://vidlux.xyz/embed/movie/1', quality: 'Auto' },
      ],
      captions: [
        { file: 'https://cdn.example/en.vtt', label: 'English', language: 'en' },
        { file: 'https://cdn.example/es.srt', label: 'Spanish', language: 'es' },
        { file: 'http://cdn.example/insecure.vtt', label: 'Bad' },
      ],
    }
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url === 'https://vidlux.xyz/embed/movie/1') {
        return { status: 200, text: '<html>window.__NEXT_DATA__ requestToken":"tok-abc123" trailing</html>', url }
      }
      if (url.startsWith('https://vidlux.xyz/api/extract/spider')) {
        const parsed = new URL(url)
        expect(parsed.searchParams.get('id')).toBe('1')
        expect(parsed.searchParams.get('type')).toBe('movie')
        expect(parsed.searchParams.get('_t')).toBe('tok-abc123')
        expect(parsed.searchParams.has('season')).toBe(false)
        return { status: 200, text: JSON.stringify({ encrypted: true, data: seal(payload) }), url }
      }
      if (url.startsWith('https://vidlux.xyz/api/extract/')) {
        return { status: 404, text: '', url }
      }
      throw new Error(`Unexpected ${url}`)
    })
    const result = await createVidluxProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://vidlux.xyz/embed/movie/1')
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'vidlux:spider:0', type: 'hls', qualityHint: '1080p', language: 'original', headers: { referer: 'https://vidlux.xyz/embed/movie/1' } },
      { key: 'vidlux:spider:1', type: 'native', qualityHint: '720p', language: 'original' },
    ] })
    expect(result.ok && result.sources).toHaveLength(2)
    expect(result.ok && result.sources[0]?.url).toBe('https://cdn.example/spider/master.m3u8')
    expect(result.ok && result.sources[0]?.headers).not.toHaveProperty('cookie')
    expect(result.ok && result.sources[0]?.headers).not.toHaveProperty('authorization')
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'vidlux-sub-0', label: 'English', format: 'vtt', url: 'https://cdn.example/en.vtt' }])
  })

  it('resolves episodes with season/episode extracts and streamrk playlist expansion', async () => {
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url === 'https://vidlux.xyz/embed/tv/2/3/4') {
        return { status: 200, text: '{"requestToken":"tok-ep-1"}', url }
      }
      if (url.startsWith('https://vidlux.xyz/api/extract/vidrock')) {
        const parsed = new URL(url)
        expect(parsed.searchParams.get('id')).toBe('2')
        expect(parsed.searchParams.get('type')).toBe('tv')
        expect(parsed.searchParams.get('season')).toBe('3')
        expect(parsed.searchParams.get('episode')).toBe('4')
        expect(parsed.searchParams.get('_t')).toBe('tok-ep-1')
        return { status: 200, text: JSON.stringify({ encrypted: true, data: seal({ streams: [{ file: 'https://streamrk.site/playlist/abc123', quality: 'Auto', title: 'Vidrock' }], captions: [] }) }), url }
      }
      if (url === 'https://streamrk.site/playlist/abc123') {
        return { status: 200, text: JSON.stringify([
          { resolution: 1080, url: 'https://cdn.example/1080.m3u8' },
          { resolution: 720, url: 'https://cdn.example/720.m3u8' },
        ]), url }
      }
      if (url.startsWith('https://vidlux.xyz/api/extract/')) {
        return { status: 404, text: '', url }
      }
      throw new Error(`Unexpected ${url}`)
    })
    const result = await createVidluxProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://vidlux.xyz/embed/tv/2/3/4')
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'vidlux:vidrock:0', type: 'hls', qualityHint: '1080p', url: 'https://cdn.example/1080.m3u8' },
      { key: 'vidlux:vidrock:1', type: 'hls', qualityHint: '720p', url: 'https://cdn.example/720.m3u8' },
    ] })
    expect(result.ok && result.sources).toHaveLength(2)
  })

  it('vidlux distinguishes missing titles, cancellation, timeout, and malformed documents', async () => {
    const missing = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      return { status: 404, text: '', url }
    })
    expect(await createVidluxProvider(missing, () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'empty' })
    const never = vi.fn<ProviderHttp>(async () => { throw new Error('Unexpected request') })
    expect(await createVidluxProvider(never, () => now).resolve(input, AbortSignal.abort())).toMatchObject({ code: 'cancelled' })
    expect(await createVidluxProvider(never, () => now).resolve(input, AbortSignal.abort(new DOMException('deadline', 'TimeoutError')))).toMatchObject({ code: 'timeout' })
    expect(never).not.toHaveBeenCalled()
    const malformed = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      return { status: 200, text: '<html>Unavailable</html>', url }
    })
    expect(await createVidluxProvider(malformed, () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'malformed' })
  })

  it('vidlux reports empty when only relay candidates or undecryptable payloads answer', async () => {
    const relayOnly = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('/embed/movie/')) return { status: 200, text: '{"requestToken":"tok-relay"}', url }
      return { status: 200, text: JSON.stringify({ encrypted: true, data: seal({ streams: [{ file: 'https://x.workers.dev/r.m3u8' }], captions: [] }) }), url }
    })
    expect(await createVidluxProvider(relayOnly, () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'empty' })
    const corrupt = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('/embed/movie/')) return { status: 200, text: '{"requestToken":"tok-x"}', url }
      return { status: 200, text: JSON.stringify({ encrypted: true, data: '!!!not-valid-base64!!!' }), url }
    })
    expect(await createVidluxProvider(corrupt, () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'empty' })
  })
})
