import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { ProviderHttp, ProviderHttpRequest } from './http.ts'
import { createEmbedmasterProvider } from './embedmaster.ts'

type Fixture = { status?: number; text: string; url?: string; cookies?: string[] }
function fixture(responses: Fixture[]) {
  const calls: Array<{ url: string; headers: Record<string, string>; init?: ProviderHttpRequest }> = []
  let index = 0
  const http = (async (url: string, headers: Record<string, string>, _signal: AbortSignal, init?: ProviderHttpRequest) => {
    calls.push({ url, headers, ...(init ? { init } : {}) })
    const response = responses[index++] ?? responses.at(-1)!
    const responseHeaders = new Headers()
    for (const cookie of response.cookies ?? []) responseHeaders.append('set-cookie', cookie)
    return { status: response.status ?? 200, text: response.text, url: response.url ?? url, headers: responseHeaders }
  }) as ProviderHttp
  return { http, calls }
}
const signal = () => new AbortController().signal
const input = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const pk = 'ab'.repeat(32)
const key = [11, 23, 37, 41, 53, 67, 71, 83, 97, 101, 103, 107, 109, 113, 127, 131]
const seed = 77

function encryptedConfig(config: unknown) {
  const raw = Buffer.from(`window.__EM_PLAYER__ = ${JSON.stringify(config)};`, 'utf8')
  const out = Buffer.alloc(raw.length)
  for (let index = 0; index < raw.length; index++) out[index] = raw[index]! ^ ((seed + key[index % key.length]! + index) & 255)
  const encoded = out.toString('base64')
  return `<html><script>var _b="${encoded}",_k=[${key.join(',')}],_i=${seed};atob('${encoded}');</script></html>`
}

function encryptedResolve(payload: unknown) {
  const keyBytes = Buffer.from(pk, 'hex')
  const iv = Buffer.alloc(16, 7)
  const plain = Buffer.from(JSON.stringify(payload), 'utf8')
  const ciphertext = Buffer.alloc(plain.length)
  for (let offset = 0, counter = 0; offset < plain.length; offset += 32, counter++) {
    const block = Buffer.alloc(4)
    block.writeUInt32BE(counter >>> 0)
    const stream = createHash('sha256').update(Buffer.concat([keyBytes, iv, block])).digest()
    for (let index = 0; index < Math.min(32, plain.length - offset); index++) ciphertext[offset + index] = plain[offset + index]! ^ stream[index]!
  }
  return Buffer.concat([iv, ciphertext]).toString('base64url')
}

const config = {
  ticket: 'ticket-value',
  pk,
  scrapeToken: 'scrape-token',
  feedUrl: 'https://embdmstrplayer.com/feed?token=',
  feedUrlBackup: '',
  resolveUrl: '/resolve',
  order: ['2', '1'],
  kinds: { '1': 'direct', '2': 'embed' },
  obfHosts: ['perfectbussines.website'],
}
const tokenUrl = 'https://embdmstrplayer.com/v2/opaque-token'

describe('EmbedMaster provider', () => {
  it('classifies a player-host 403 as blocked instead of generic unavailability', async () => {
    const { http } = fixture([
      { text: '<html></html>', url: tokenUrl },
      { status: 403, text: '', url: tokenUrl },
    ])

    expect(await createEmbedmasterProvider(http).resolve(input, signal()))
      .toMatchObject({ ok: false, code: 'blocked', retryable: false })
  })

  it('opens the player with the Turnstile POST, decrypts its config, and resolves a direct HLS source', async () => {
    const { http, calls } = fixture([
      { text: '<html></html>', url: tokenUrl },
      { text: encryptedConfig(config), url: tokenUrl, cookies: ['sid=session-token; Path=/; HttpOnly'] },
      { text: JSON.stringify({ source_type: '1', source_name: 'Prime', source_quality: '1080p', source_url: 'server-blob' }) + '\n' },
      { text: encryptedResolve({ ok: true, kind: 'direct', type: 'hls', url: 'https://perfectbussines.website/path/master.m3u8' }) },
    ])
    const resolved = await createEmbedmasterProvider(http, () => 1_800_000_000_000).resolve(input, signal())

    expect(calls[0]?.url).toBe('https://embedmaster.link/movie/550')
    expect(calls[1]).toMatchObject({
      url: tokenUrl,
      init: { method: 'POST', body: 'tr=' },
      headers: { origin: 'https://embdmstrplayer.com', 'content-type': 'application/x-www-form-urlencoded' },
    })
    expect(calls[2]?.url).toBe('https://embdmstrplayer.com/feed?token=scrape-token')
    expect(calls[2]?.headers.cookie).toBe('sid=session-token')
    expect(calls[2]?.headers.referer).toBe(tokenUrl)
    expect(calls[3]?.url).toBe('https://embdmstrplayer.com/resolve?src=server-blob')
    expect(calls[3]?.headers['x-em-ticket']).toBe('ticket-value')
    expect(resolved).toMatchObject({ ok: true, sources: [
      { serverName: 'Prime', type: 'hls', height: 1080, qualityHint: '1080p', subtitles: [],
        headers: { referer: 'https://embdmstrplayer.com/', origin: 'https://embdmstrplayer.com' } },
    ] })
  })

  it('resolves the preferred YesMovies server before other direct servers', async () => {
    const preferredConfig = { ...config, order: ['1', '3'], kinds: { '1': 'direct', '3': 'direct' } }
    const { http, calls } = fixture([
      { text: '<html></html>', url: tokenUrl },
      { text: encryptedConfig(preferredConfig), url: tokenUrl, cookies: ['sid=session-token'] },
      { text: [
        { source_type: '1', source_name: 'Premium Rido', source_quality: '1080p', source_url: 'rido-blob' },
        { source_type: '3', source_name: 'Premium YesMovies', source_quality: '4K ULTRA HD', source_url: 'yesmovies-blob' },
      ].map(line => JSON.stringify(line)).join('\n') },
      { text: encryptedResolve({ ok: true, type: 'hls', url: 'https://perfectbussines.website/yesmovies/master.m3u8' }) },
      { text: encryptedResolve({ ok: true, type: 'hls', url: 'https://perfectbussines.website/rido/master.m3u8' }) },
    ])
    const resolved = await createEmbedmasterProvider(http).resolve(input, signal())

    expect(calls[3]?.url).toBe('https://embdmstrplayer.com/resolve?src=yesmovies-blob')
    expect(calls[4]?.url).toBe('https://embdmstrplayer.com/resolve?src=rido-blob')
    expect(resolved).toMatchObject({ ok: true, sources: [
      { serverName: 'Premium YesMovies', priority: 100, height: 2160, qualityHint: '2160p' },
      { serverName: 'Premium Rido', priority: 0, height: 1080, qualityHint: '1080p' },
    ] })
  })

  it('classifies an MP4 source by extension even when the player labels it HLS', async () => {
    const { http } = fixture([
      { text: '<html></html>', url: tokenUrl },
      { text: encryptedConfig(config), url: tokenUrl, cookies: ['sid=session-token'] },
      { text: JSON.stringify({ source_type: '1', source_name: 'Prime', source_quality: '720p', source_url: 'server-blob' }) + '\n' },
      { text: encryptedResolve({ ok: true, type: 'hls', url: 'https://perfectbussines.website/path/episode.mp4' }) },
    ])
    const result = await createEmbedmasterProvider(http).resolve(input, signal())
    expect(result).toMatchObject({ ok: true, sources: [{ type: 'native', height: 720 }] })
  })

  it('fails over to the backup feed and rejects unreviewed media hosts', async () => {
    const backupConfig = { ...config, feedUrlBackup: 'https://embdmstrplayer.com/backup?token=' }
    const { http, calls } = fixture([
      { text: '<html></html>', url: tokenUrl },
      { text: encryptedConfig(backupConfig), url: tokenUrl, cookies: ['sid=session-token'] },
      { status: 503, text: '' },
      { text: JSON.stringify({ source_type: '1', source_name: 'Prime', source_quality: '1080p', source_url: 'server-blob' }) + '\n' },
      { text: encryptedResolve({ ok: true, type: 'hls', url: 'https://evil.example/master.m3u8' }) },
    ])
    expect(await createEmbedmasterProvider(http).resolve(input, signal())).toEqual({ ok: false, code: 'empty', retryable: false })
    expect(calls[2]?.url).toBe('https://embdmstrplayer.com/feed?token=scrape-token')
    expect(calls[3]?.url).toBe('https://embdmstrplayer.com/backup?token=scrape-token')
  })

  it('rejects direct redirects that never reach the player and malformed player pages', async () => {
    const wrongHost = fixture([{ text: '<html></html>', url: 'https://embedmaster.link/movie/550' }])
    expect(await createEmbedmasterProvider(wrongHost.http).resolve(input, signal())).toEqual({ ok: false, code: 'empty', retryable: false })

    const malformed = fixture([
      { text: '<html></html>', url: tokenUrl },
      { text: '<html><script>atob("bm90LWEtY29uZmln")</script></html>', url: tokenUrl },
    ])
    expect(await createEmbedmasterProvider(malformed.http).resolve(input, signal())).toEqual({ ok: false, code: 'malformed', retryable: false })
  })

  it('sends season and episode for series and rejects anime refs', async () => {
    const { http, calls } = fixture([
      { text: '<html></html>', url: tokenUrl },
      { text: encryptedConfig(config), url: tokenUrl, cookies: ['sid=session-token'] },
      { text: JSON.stringify({ source_type: '1', source_name: 'Prime', source_quality: '1080p', source_url: 'server-blob' }) + '\n' },
      { text: encryptedResolve({ ok: true, type: 'hls', url: 'https://perfectbussines.website/path/master.m3u8' }) },
    ])
    await createEmbedmasterProvider(http).resolve({ ref: { kind: 'series', id: 1396, season: 2, episode: 5 }, region: 'US', audioLanguage: 'en' }, signal())
    expect(calls[0]?.url).toBe('https://embedmaster.link/tv/1396/2/5')
    expect(await createEmbedmasterProvider(http).resolve({ ref: { kind: 'anime', id: 21, episode: 1 }, region: 'US', audioLanguage: 'ja' }, signal()))
      .toEqual({ ok: false, code: 'empty', retryable: false })
  })
})
