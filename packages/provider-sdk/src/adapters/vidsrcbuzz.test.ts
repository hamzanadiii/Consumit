import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import type { ProviderHttp } from '../index.ts'
import { createVidsrcbuzzProvider } from './vidsrcbuzz.ts'

const now = Date.UTC(2026, 8, 9)
const input = { ref: { kind: 'movie' as const, id: 1 }, region: 'US', audioLanguage: 'en' }
const episode = { ...input, ref: { kind: 'series' as const, id: 2, season: 3, episode: 4 } }
const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\nseg.m3u8'

function queueHttp(...responses: { status?: number; text: string }[]) {
  return vi.fn<ProviderHttp>(async (url, _headers, signal) => {
    signal.throwIfAborted()
    const next = responses.shift()
    if (!next) throw new Error('Unexpected request')
    return { status: next.status ?? 200, text: next.text, url }
  })
}

function subToken(url: string): string {
  return `${Buffer.from(JSON.stringify({ u: url }), 'utf8').toString('base64url')}.sig`
}

function embedHtml(type: string, id: string, s: number, e: number): string {
  return `<html><body><script>var Q = ${JSON.stringify({ type, id, s, e, t: 'signed-session' })};</script></body></html>`
}

function sourcesBody(): string {
  return JSON.stringify({ status: 'ok', servers: [
    { ref: 'ref-a', name: 'Alpha' },
    { ref: 'ref-b', name: 'Beta' },
    { ref: 'ref-c', name: 'Gamma' },
  ] })
}

function subsBody(): string {
  return JSON.stringify({ subs: [
    { label: 'English', ref: subToken('https://cdn.example/en.vtt') },
    { label: 'Styled', ref: subToken('https://cdn.example/es.srt') },
    { label: 'Insecure', ref: subToken('http://cdn.example/bad.vtt') },
  ] })
}

function routedClient(sourcesQueue: string[], embed: string) {
  let sourcesCalls = 0
  return vi.fn<ProviderHttp>(async (url, _headers, signal) => {
    signal.throwIfAborted()
    if (url.includes('/embed/')) return { status: 200, text: embed, url }
    if (url.includes('a=sources')) {
      const body = sourcesQueue[Math.min(sourcesCalls, sourcesQueue.length - 1)]
      sourcesCalls += 1
      if (body === undefined) throw new Error('Unexpected sources call')
      return { status: 200, text: body, url }
    }
    if (url.includes('a=play')) {
      const serverRef = new URL(url).searchParams.get('ref')
      if (serverRef === 'ref-a') return { status: 200, text: JSON.stringify({ url: '/_stream?id=aaa', type: 'hls' }), url }
      if (serverRef === 'ref-b') return { status: 200, text: JSON.stringify({ url: 'https://edge.example/film.mp4', type: 'mp4' }), url }
      return { status: 200, text: JSON.stringify({ url: 'https://frames.example/embed/9', type: 'iframe' }), url }
    }
    if (url.includes('a=subs')) return { status: 200, text: subsBody(), url }
    if (url.includes('_stream')) return { status: 200, text: master, url }
    throw new Error(`Unexpected request ${url}`)
  })
}

describe('vidsrcbuzz provider contract', () => {
  it('resolves movies to direct media with VTT-only subtitles', async () => {
    const client = routedClient([sourcesBody()], embedHtml('movie', 'tmdb-1', 0, 0))
    const result = await createVidsrcbuzzProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://vidsrc.buzz/embed/movie/1')
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'vidsrcbuzz:alpha:0', type: 'hls', url: 'https://vidsrc.buzz/_stream?id=aaa', language: 'original', qualityHint: 'Auto' },
      { key: 'vidsrcbuzz:beta:1', type: 'native', url: 'https://edge.example/film.mp4' },
    ] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The iframe relay is dropped, never proxied.
    expect(result.sources).toHaveLength(2)
    const headers = result.sources[0]?.headers
    expect(headers).toMatchObject({ referer: 'https://vidsrc.buzz/embed/movie/1' })
    expect(headers).not.toHaveProperty('cookie')
    expect(headers).not.toHaveProperty('authorization')
    // The srt and http subtitle candidates are stripped; only VTT remains.
    expect(result.sources[0]?.subtitles).toMatchObject([{ id: 'vidsrcbuzz-sub-0', label: 'English', format: 'vtt' }])
    expect(result.sources[0]?.subtitles).toHaveLength(1)
  })
  it('resolves episodes through the tv embed and session query', async () => {
    const client = routedClient([sourcesBody()], embedHtml('tv', 'tmdb-2', 3, 4))
    const result = await createVidsrcbuzzProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://vidsrc.buzz/embed/tv/2/3/4')
    expect(result).toMatchObject({ ok: true })
    const sourcesUrl = client.mock.calls.find(([url]) => url.includes('a=sources'))?.[0] ?? ''
    expect(sourcesUrl).toContain('id=tmdb-2')
    expect(sourcesUrl).toContain('s=3')
    expect(sourcesUrl).toContain('e=4')
  })
  it('polls boundedly while the upstream reports wait', async () => {
    const waiting = JSON.stringify({ status: 'wait', servers: [{ ref: 'ref-a', name: 'Alpha' }] })
    const client = routedClient([waiting, sourcesBody()], embedHtml('movie', 'tmdb-1', 0, 0))
    const result = await createVidsrcbuzzProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true })
    expect(client.mock.calls.filter(([url]) => url.includes('a=sources'))).toHaveLength(2)
  })
  it('stops polling a stuck gather and reports empty', async () => {
    const waiting = JSON.stringify({ status: 'wait', servers: [] })
    const client = routedClient([waiting], embedHtml('movie', 'tmdb-1', 0, 0))
    const result = await createVidsrcbuzzProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ code: 'empty' })
    expect(client.mock.calls.filter(([url]) => url.includes('a=sources'))).toHaveLength(4)
  })
  it('distinguishes missing titles, cancellation, timeout, and malformed documents', async () => {
    expect(await createVidsrcbuzzProvider(queueHttp({ status: 404, text: '' }), () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'empty' })
    const untracked = queueHttp({ text: embedHtml('movie', 'tmdb-9', 0, 0) }, { text: JSON.stringify({ status: 'none', servers: [] }) })
    expect(await createVidsrcbuzzProvider(untracked, () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'empty' })
    const client = queueHttp()
    expect(await createVidsrcbuzzProvider(client, () => now).resolve(input, AbortSignal.abort())).toMatchObject({ code: 'cancelled' })
    expect(await createVidsrcbuzzProvider(client, () => now).resolve(input, AbortSignal.abort(new DOMException('deadline', 'TimeoutError')))).toMatchObject({ code: 'timeout' })
    expect(client).not.toHaveBeenCalled()
    expect(await createVidsrcbuzzProvider(queueHttp({ text: '<html>Unavailable</html>' }), () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'malformed' })
  })
})
