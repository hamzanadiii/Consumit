import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createXPassProvider, decryptXPassBackups, type ProviderHttp } from '../index.ts'
import type { ProviderHttpRequest } from './http.ts'

const origin = 'https://play.xpass.top'
const pageUrl = `${origin}/e/movie/550`
const dataUrl = `${origin}/api/v3/data?token=fixture-token`
const subtitleUrl = 'https://sub.1x2.space/api/subtitles?tmdb=550'
const mediaHosts = ['tok.1x2.space', 'vip.1x2.space', 'tik.1x2.space', 'sub.1x2.space']
const now = Date.UTC(2026, 9, 21)
const signal = () => new AbortController().signal

function encryptBackups(value: unknown, url = dataUrl) {
  const parsed = new URL(url)
  const key = createHash('sha256').update(`spv3-data-response|spv3-build-1787821613-50e5fc97c9dce367|${parsed.pathname}|${parsed.searchParams.get('token')}`).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64')
}

function fixture(backups: unknown[], requestedPage = pageUrl) {
  const encrypted = encryptBackups(backups, new URL('/api/v3/data?token=fixture-token', requestedPage).href)
  const calls: Array<{ url: string; headers: Record<string, string>; init: ProviderHttpRequest | undefined }> = []
  const http = vi.fn<ProviderHttp>(async (url, headers, _signal, init) => {
    calls.push({ url, headers, init })
    let text = ''
    let bytes: Uint8Array | undefined
    let status = 200
    if (url === requestedPage) text = `<script>var dataUrl = "/api/v3/data?token=fixture-token"; var suburl = "${subtitleUrl}";</script>`
    else if (url.includes('/api/v3/data?')) text = encrypted
    else if (url.endsWith('/playlist.json')) text = JSON.stringify({ playlist: [{ file: 'https://tok.1x2.space/master.m3u8', type: 'hls' }] })
    else if (url.endsWith('/master.m3u8')) text = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=1280x720\nhttps://vip.1x2.space/variant.m3u8\n'
    else if (url.endsWith('/variant.m3u8')) text = '#EXTM3U\n#EXTINF:6,\nhttps://tik.1x2.space/segment.ts\n#EXT-X-ENDLIST\n'
    else if (url.endsWith('/segment.ts')) bytes = new Uint8Array([0x47, 0x01])
    else if (url === subtitleUrl) text = JSON.stringify([{ url: 'https://sub.1x2.space/en.vtt', status: 'cached', label: 'English', language: 'en' }])
    else if (url.endsWith('/en.vtt')) text = 'WEBVTT'
    else status = 404
    return { status, url, text, ...(bytes ? { bytes } : {}) }
  })
  return { http, calls }
}

describe('XPass adapter', () => {
  it('decrypts the PROVE backup envelope and resolves a verified movie with captions', async () => {
    const encrypted = encryptBackups([{ name: 'TOK 720p', url: '/api/v3/playlist.json' }])
    expect(decryptXPassBackups(dataUrl, encrypted)).toEqual([{ name: 'TOK 720p', url: '/api/v3/playlist.json' }])
    expect(() => decryptXPassBackups(dataUrl, encrypted.slice(0, -4) + 'AAAA')).toThrow()

    const { http, calls } = fixture([{ name: 'TOK 720p', url: '/api/v3/playlist.json' }])
    const result = await createXPassProvider(http, () => now, { mediaHosts }).resolve({ ref: { kind: 'movie', id: 550 }, region: 'US', audioLanguage: 'en' }, signal())
    expect(result).toMatchObject({ ok: true, sources: [{ type: 'hls', url: 'https://tok.1x2.space/master.m3u8', qualityHint: 'Auto', subtitles: [{ url: 'https://sub.1x2.space/en.vtt', language: 'en' }] }] })
    expect(calls.find(call => call.url === pageUrl)?.headers.referer).toBe('https://nepu.info/')
    for (const host of ['tok', 'vip', 'tik']) {
      const call = calls.find(candidate => candidate.url.includes(`${host}.1x2.space`))
      expect(call?.headers.referer).toBe(pageUrl)
    }
    expect(calls.find(call => call.url.endsWith('/segment.ts'))?.init?.readPrefixBytes).toBe(2)
  })

  it('uses the requested TV season and episode and ignores relay or unconfigured backup hosts', async () => {
    const tvPage = `${origin}/e/tv/1396/2/3`
    const encrypted = encryptBackups([
      { name: 'relay', url: 'https://asiaflix.example/m3u8-proxy?url=https://tok.1x2.space/x' },
      { name: 'unknown', url: 'https://unknown.example/playlist.json' },
    ], `${origin}/api/v3/data?token=fixture-token`)
    const http = vi.fn<ProviderHttp>(async (url, _headers) => ({
      status: 200,
      url,
      text: url === tvPage
        ? '<script>var dataUrl="/api/v3/data?token=fixture-token";</script>'
        : url.includes('/api/v3/data?') ? encrypted : '',
    }))
    const result = await createXPassProvider(http, () => now, { mediaHosts }).resolve({ ref: { kind: 'series', id: 1396, season: 2, episode: 3 }, region: 'US', audioLanguage: 'en' }, signal())
    expect(result).toMatchObject({ ok: false, code: 'empty' })
    expect(http.mock.calls[0]?.[0]).toBe(tvPage)
    expect(http.mock.calls[0]?.[1].referer).toBe('https://nepu.info/')
  })

  it('rejects bad AES-GCM data and refuses cross-host playlists outside the configured allowlist', async () => {
    expect(() => decryptXPassBackups(dataUrl, 'bm90LXZhbGlk')).toThrow()
    const { http } = fixture([{ name: 'TOK 720p', url: 'https://tok.1x2.space/playlist.json' }])
    const result = await createXPassProvider(http, () => now, { mediaHosts: ['tok.1x2.space'] }).resolve({ ref: { kind: 'movie', id: 550 }, region: 'US', audioLanguage: 'en' }, signal())
    expect(result).toMatchObject({ ok: false, code: 'empty' })
  })
})
