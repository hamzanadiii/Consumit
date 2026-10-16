import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { createStaticProvider, type ProviderRegistration } from '@consumit/provider-sdk'
import { buildApp } from '../app.ts'
import { loadEnv } from '../config/env.ts'
import { createPlayback } from './playback.ts'
import { createMemoryPlaybackStore } from './state.ts'
import { createSeparateAudio } from './separate-audio.ts'
import { createPlaybackRelay } from './relay.ts'

const apps: Awaited<ReturnType<typeof buildApp>>[] = []
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())) })
const ref = { kind: 'series' as const, id: 95350, season: 1, episode: 1 }
const body = { ref, audioLanguage: 'en', capabilities: { hls: true, native: true, dash: false, nativeHls: false } }
const source = { key: 'main', url: 'https://media.example/master.m3u8', type: 'hls' as const, language: 'original', headers: { referer: 'https://partner.example/' }, expiresAt: '2099-01-01T00:00:00.000Z', subtitles: [] }
const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Hindi",LANGUAGE="hin",URI="hi.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,AUDIO="aac"\nvideo.m3u8'
const media = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\naudio.ts\n#EXT-X-ENDLIST'

describe('separate audio without replacing video', () => {
  it('keeps other recordings when a provider throws and uses only a configured relay for relay audio', async () => {
    const movie = { kind: 'movie' as const, id: 550 }, input = { ...body, ref: movie }
    const registration: ProviderRegistration = { adapter: createStaticProvider('audio-relay', [{ ref: movie, sources: [source] }]), role: 'audio', deliveryMode: 'relay', enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'audio-relay', concurrency: 1, requestsPerMinute: 30, mediaKinds: ['movie'] }
    const broken: ProviderRegistration = { ...registration, adapter: { id: 'broken', async resolve() { throw new Error('Controlled provider outage') } }, deliveryMode: 'direct', upstreamGroup: 'broken' }
    const http = vi.fn(async (url: string) => ({ status: 200, url, text: url.endsWith('master.m3u8') ? master : media, headers: new Headers() }))
    const store = createMemoryPlaybackStore(), relay = createPlaybackRelay({ origin: 'https://edge.example', secret: 'fixture-audio-relay-secret-32-characters', providers: { 'audio-relay': ['media.example'] } })
    const audio = createSeparateAudio([broken, registration], 'US', http, 'https://consumit.example', { store, relay }), signal = new AbortController().signal
    const tracks = await audio.list(input, signal)
    expect(tracks).toHaveLength(1)
    const prepared = await audio.prepare(input, tracks[0]!.id, signal)
    expect(prepared.src).toMatch(/^https:\/\/edge\.example\/media\//)
    expect(prepared.src).not.toContain('media.example')
    expect(await relay.accepts(prepared.src, 'audio-relay')).toBe(true)
    await store.close()
  })
  it('finds movie audio behind a wrapper master and bounds unsafe or cyclic wrappers', async () => {
    const movie = { kind: 'movie' as const, id: 1007757 }
    const p: ProviderRegistration = {
      adapter: Object.assign(createStaticProvider('riveapogee', [{ ref: movie, sources: [source] }]), { separateAudio: { label: 'Apogee' } }),
      role: 'both', enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'riveapogee', concurrency: 1, requestsPerMinute: 30, mediaKinds: ['movie', 'series'],
    }
    const wrapper = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nnested.m3u8'
    const http = vi.fn(async (url: string) => ({ status: 200, url, text: url.endsWith('master.m3u8') ? wrapper : master, headers: new Headers() }))
    const input = { ...body, ref: movie }
    const audio = createSeparateAudio([p], 'US', http)
    expect(await audio.list(input, new AbortController().signal)).toEqual([expect.objectContaining({ label: 'Hindi', language: 'hi' })])
    expect(http.mock.calls.map(c => c[0])).toEqual(['https://media.example/master.m3u8', 'https://media.example/nested.m3u8'])
    http.mockClear()
    http.mockImplementation(async url => ({ status: 200, url, text: wrapper.replace('nested.m3u8', 'https://unapproved.example/master.m3u8'), headers: new Headers() }))
    expect(await createSeparateAudio([p], 'US', http).list(input, new AbortController().signal)).toEqual([])
    expect(http).toHaveBeenCalledTimes(1)
    http.mockClear()
    http.mockImplementation(async url => ({ status: 200, url, text: wrapper, headers: new Headers() }))
    expect(await createSeparateAudio([p], 'US', http).list(input, new AbortController().signal)).toEqual([])
    expect(http).toHaveBeenCalledTimes(3)
  })
  it('discovers audio for any enabled Audio source or Both row, with or without an adapter label', async () => {
    const movie = { kind: 'movie' as const, id: 550 }
    const sourceFor = (host: string) => ({ ...source, url: `https://${host}/master.m3u8` })
    const providers: ProviderRegistration[] = [
      { adapter: createStaticProvider('vixsrc', [{ ref: movie, sources: [sourceFor('media.example')] }]), role: 'both', enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'vixsrc', concurrency: 1, requestsPerMinute: 30, mediaKinds: ['movie'] },
      { adapter: Object.assign(createStaticProvider('riveapogee', [{ ref: movie, sources: [sourceFor('apogee.example')] }]), { separateAudio: { label: 'Apogee' } }), role: 'audio', enabled: true, approvedRegions: ['US'], mediaHosts: ['apogee.example'], upstreamGroup: 'riveapogee', concurrency: 1, requestsPerMinute: 30, mediaKinds: ['movie'] },
      { adapter: createStaticProvider('videoonly', [{ ref: movie, sources: [sourceFor('video.example')] }]), role: 'video', enabled: true, approvedRegions: ['US'], mediaHosts: ['video.example'], upstreamGroup: 'videoonly', concurrency: 1, requestsPerMinute: 30, mediaKinds: ['movie'] },
    ]
    const http = vi.fn(async (url: string) => ({ status: 200, url, text: master, headers: new Headers() }))
    const input = { ...body, ref: movie }
    const tracks = await createSeparateAudio(providers, 'US', http).list(input, new AbortController().signal)
    expect(tracks).toHaveLength(2)
    expect(tracks.map(t => t.provider).sort()).toEqual(['Apogee', 'vixsrc'])
    expect(http.mock.calls.map(c => c[0])).toEqual(['https://apogee.example/master.m3u8', 'https://media.example/master.m3u8'])
  })
  it('keeps other opted-in rows when one is budget-exhausted, and only reports busy when none can run', async () => {
    const movie = { kind: 'movie' as const, id: 550 }
    const sourceFor = (host: string) => ({ ...source, url: `https://${host}/master.m3u8` })
    const row = (id: string, rpm: number): ProviderRegistration => ({
      adapter: createStaticProvider(id, [{ ref: movie, sources: [sourceFor(`${id}.example`)] }]), role: 'both', enabled: true, approvedRegions: ['US'], mediaHosts: [`${id}.example`], upstreamGroup: id, concurrency: 1, requestsPerMinute: rpm, mediaKinds: ['movie'],
    })
    const input = { ...body, ref: movie }
    const http = vi.fn(async (url: string) => ({ status: 200, url, text: master, headers: new Headers() }))
    const tracks = await createSeparateAudio([row('tired', 0), row('fresh', 30)], 'US', http).list(input, new AbortController().signal)
    expect(tracks.map(t => t.provider)).toEqual(['fresh'])
    expect(http).toHaveBeenCalledTimes(1)
    await expect(createSeparateAudio([row('tired', 0)], 'US', http).list(input, new AbortController().signal)).rejects.toThrow('Audio discovery is busy. Try again shortly.')
  })
  it('discovers and prepares a title-specific audio track in the owned session', async () => {
    const providers: ProviderRegistration[] = ['primary', 'riveapogee'].map(id => ({
      adapter: Object.assign(createStaticProvider(id, [{ ref, sources: [source] }]), id === 'primary' ? {} : { separateAudio: { label: 'Apogee' } }), role: id === 'primary' ? 'video' : 'audio', enabled: true,
      approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: id, concurrency: 1, requestsPerMinute: 30, mediaKinds: ['series'],
    }))
    const audioHttp = vi.fn(async (url: string, headers: Record<string, string>) => ({ status: headers.referer === source.headers.referer && headers.origin === 'http://localhost:3000' ? 200 : 403, url, text: url.endsWith('master.m3u8') ? master : media, headers: new Headers({ 'access-control-allow-origin': '*' }) }))
    const store = createMemoryPlaybackStore()
    const playback = createPlayback({ providers, store, region: 'US', audioHttp, audioOrigin: 'http://localhost:3000' })
    const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test' }), playback }); apps.push(app)
    const resolved = await app.inject({ method: 'POST', url: '/v1/playback/resolve', headers: { origin: 'http://localhost:3000' }, payload: body })
    const session = resolved.json()
    const cookie = resolved.cookies.map(c => `${c.name}=${c.value}`).join('; ')
    const request = { sourceId: session.source.id }
    const audio = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/audio`, headers: { origin: 'http://localhost:3000', cookie }, payload: request })
    expect(audio.statusCode).toBe(200)
    expect(audio.json().tracks).toEqual([expect.objectContaining({ label: 'Hindi', language: 'hi', provider: 'Apogee' })])
    expect(audio.json().tracks[0].src).toBeUndefined()
    const prepared = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/audio/prepare`, headers: { origin: 'http://localhost:3000', cookie }, payload: { ...request, trackId: audio.json().tracks[0].id } })
    expect(prepared.statusCode).toBe(200)
    expect(prepared.json()).toMatchObject({ src: 'https://media.example/hi.m3u8', duration: 6 })
    expect(audioHttp).toHaveBeenCalledTimes(2)
    const foreign = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/audio`, headers: { origin: 'http://localhost:3000', cookie: 'consumit-playback=' + 'f'.repeat(64) }, payload: request })
    expect(foreign.statusCode).toBe(404)
    const stale = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/audio`, headers: { origin: 'http://localhost:3000', cookie }, payload: { sourceId: 'old' } })
    expect(stale.statusCode).toBe(409)
    // Preparing audio never writes another source into the session.
    expect(JSON.parse((await store.get(`session:${session.id}`))!).session.source).toEqual(session.source)
    audioHttp.mockImplementationOnce(async (url) => ({ status: 200, url, text: media.replace('audio.ts', 'https://unapproved.example/audio.ts'), headers: new Headers() }))
    const unsafe = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/audio/prepare`, headers: { origin: 'http://localhost:3000', cookie }, payload: { ...request, trackId: audio.json().tracks[0].id } })
    expect(unsafe.statusCode).toBe(503)
    providers[1]!.enabled = false
    const owner = createHash('sha256').update(resolved.cookies[0]!.value).digest('hex')
    expect(await playback.listAudio(owner, session.id, session.source.id, new AbortController().signal)).toEqual([])
  })
})
