import { describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { createStaticProvider, type ProviderRegistration, type ProviderSource } from '@consumit/provider-sdk'
import { createGrantCodec } from '@consumit/media-relay'
import { createPlayback } from './playback.ts'
import { createMemoryPlaybackStore } from './state.ts'
import { createPlaybackRelay, parseRelayDiscovery } from './relay.ts'
import { configuredProviders } from './configured-providers.ts'

const ref = { kind: 'movie' as const, id: 1 }
const input = { ref, capabilities: { hls: true, dash: true, native: true, nativeHls: false }, audioLanguage: 'en' }
const secret = 'test-relay-secret-at-least-32-characters'
const signal = new AbortController().signal
const source: ProviderSource = { key: 'main', url: 'https://media.example/main.m3u8', type: 'hls', language: 'en', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }
function setup(options: { enabled?: boolean; approved?: boolean; directCount?: number; relayType?: 'hls' | 'dash' } = {}) {
  const store = createMemoryPlaybackStore()
  const directIds = ['vixsrc', 'backup', ...Array.from({ length: (options.directCount ?? 2) - 2 }, (_, index) => `extra-${index}`)]
  const providers: ProviderRegistration[] = [...directIds, 'relay-primary', 'relay-backup'].map(id => ({
    adapter: createStaticProvider(id, [{ ref, sources: [{ ...source, type: id.startsWith('relay-') ? options.relayType ?? 'hls' : 'hls' }] }]),
    deliveryMode: id.startsWith('relay-') ? 'relay' : 'direct', enabled: true, approvedRegions: ['US'], mediaKinds: ['movie'], mediaHosts: ['media.example'], upstreamGroup: id, concurrency: 2, requestsPerMinute: 30,
  }))
  const relay = createPlaybackRelay({ origin: 'https://edge.example', secret, providers: options.approved === false ? {} : { 'relay-primary': ['media.example'], 'relay-backup': ['media.example'] } })
  const playback = createPlayback({ providers, store, region: 'US', ...(options.enabled === false ? {} : { relay, relayOrigin: 'https://watch.example' }) })
  return { playback, providers, store }
}
async function toRelay(playback: ReturnType<typeof createPlayback>) {
  let session = await playback.resolve('viewer', input, signal)
  for (let i = 0; i < 2; i++) session = await playback.recover('viewer', session.id, { sourceId: session.source.id, reason: 'network', deliveryFailure: 'cors' }, false, signal)
  return session
}
describe('separate direct and relay provider tiers', () => {
  it('compiles Rigel playlists fetched through Cloudflare and keeps child playlists on the API and video at the selected Worker', async () => {
    const registration = { ...setup().providers[2]!, adapter: createStaticProvider('rigel', []) }
    const resolved = { registration, source, subtitles: [], delivery: 'direct' as const }
    const transport = vi.fn()
    const fetcher = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(async () => new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvariant.m3u8\n', { headers: { 'x-consumit-manifest-base': source.url } }))
    const relay = createPlaybackRelay({ origin: 'https://edge.example', secret, providers: { rigel: ['media.example'] }, providerOrigins: { rigel: 'https://regional.example' }, controlProviders: ['rigel'] }, transport, fetcher)
    const src = await relay.issue(resolved, Date.now() + 60000, 'https://watch.example')
    const token = new URL(src!).searchParams.get('grant')!
    expect(new URL(src!).pathname).toBe('/v1/playback/relay-manifest')
    const master = await relay.manifest(token, 'https://watch.example', signal)
    const child = new URL(master.split('\n')[2]!)
    expect(child.origin).toBe('https://watch.example')
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).origin).toBe('https://regional.example')
    fetcher.mockImplementationOnce(async () => new Response('#EXTM3U\n#EXTINF:6,\nsegment.ts\n', { headers: { 'x-consumit-manifest-base': 'https://media.example/variant.m3u8' } }))
    const media = await relay.manifest(child.searchParams.get('grant')!, 'https://watch.example', signal)
    expect(new URL(media.split('\n')[2]!).origin).toBe('https://regional.example')
    expect(transport).not.toHaveBeenCalled()
    expect(await relay.accepts(src!, 'rigel')).toBe(true)
    fetcher.mockImplementationOnce(async () => new Response('#EXTM3U\n#EXTINF:6,\nhttps://evil.example/a.ts\n', { headers: { 'x-consumit-manifest-base': source.url } }))
    await expect(relay.manifest(token, 'https://watch.example', signal)).rejects.toThrow('Blocked manifest destination')
  })
  it('issues and renews a provider only through its approved regional Worker origin', async () => {
    const registration = setup().providers[2]!
    const resolved = { registration, source, subtitles: [], delivery: 'direct' as const }
    const relay = createPlaybackRelay({ origin: 'https://edge.example', secret, providers: { 'relay-primary': ['media.example'] }, providerOrigins: { 'relay-primary': 'https://regional.example' } })
    const src = await relay.issue(resolved, Date.now() + 60000, 'https://watch.example')
    expect(new URL(src!).origin).toBe('https://regional.example')
    expect(await relay.accepts(src!, 'relay-primary')).toBe(true)
    expect(await relay.accepts(src!.replace('regional.example', 'edge.example'), 'relay-primary')).toBe(false)
    registration.deliveryMode = 'direct'
    expect(relay.permits(resolved)).toBe(false)
  })
  it('issues the reviewed LookMovie recipe to the configured Cloudflare Worker', async () => {
    const registration: ProviderRegistration = { ...setup().providers[2]!, adapter: createStaticProvider('lookmovie-relay', []), relayHostDiscovery: 'lookmovie-v1', mediaHosts: ['srv310.seclar.cyou'], mediaHostPatterns: [/^srv[0-9]+\.[a-z-]+\.cyou$/] }
    const resolved = { registration, source: { ...source, url: 'https://srv313.seclar.cyou/movie.m3u8', relayRecipe: 'lookmovie-v1' as const, relayHosts: ['srv313.seclar.cyou'] }, subtitles: [], delivery: 'direct' as const }
    const relay = createPlaybackRelay({ origin: 'https://edge.example', secret, providers: { 'lookmovie-relay': ['srv310.seclar.cyou'] }, discovery: parseRelayDiscovery(JSON.stringify({ 'lookmovie-relay': 'lookmovie-v1' })) })
    expect(relay.permits(resolved)).toBe(true)
    const src = await relay.issue(resolved, Date.now() + 60000, 'https://watch.example')
    expect(new URL(src!).origin).toBe('https://edge.example')
    expect(new URL(src!).pathname).toMatch(/^\/media\//)
    const grant = await (await createGrantCodec(secret)).open(new URL(src!).pathname.slice('/media/'.length))
    expect(grant).toMatchObject({ provider: 'lookmovie-relay', recipe: 'lookmovie-v1', hosts: ['srv313.seclar.cyou'] })
  })
  it('binds LookMovie fallback and renewal to its media node and separate signing key', async () => {
    const nodeSecret = 'node-secret-separate-from-edge-at-least-32-chars'
    const registration: ProviderRegistration = { ...setup().providers[2]!, adapter: createStaticProvider('lookmovie-relay', []), relayHostDiscovery: 'lookmovie-v1', mediaHosts: ['srv310.seclar.cyou'], mediaHostPatterns: [/^srv[0-9]+\.[a-z-]+\.cyou$/] }
    const resolved = { registration, source: { ...source, url: 'https://srv313.seclar.cyou/movie.m3u8', relayRecipe: 'lookmovie-v1' as const, relayHosts: ['srv313.seclar.cyou'] }, subtitles: [], delivery: 'direct' as const }
    const relay = createPlaybackRelay({ origin: 'https://edge.example', secret, providers: {}, node: { origin: 'https://media.example', secret: nodeSecret, providers: { 'lookmovie-relay': ['srv310.seclar.cyou'] } } })
    expect(relay.permits(resolved)).toBe(true)
    const src = await relay.issue(resolved, Date.now() + 60000, 'https://watch.example')
    expect(new URL(src!).origin).toBe('https://media.example')
    expect(new URL(src!).pathname).toMatch(/^\/media\//)
    const token = new URL(src!).pathname.slice(7)
    expect(await (await createGrantCodec(nodeSecret)).open(token)).toMatchObject({ provider: 'lookmovie-relay', recipe: 'lookmovie-v1', hosts: ['srv313.seclar.cyou'] })
    await expect((await createGrantCodec(secret)).open(token)).rejects.toThrow()
    expect(await relay.accepts(src!, 'lookmovie-relay')).toBe(true)
    expect(await relay.accepts(src!.replace('media.example', 'edge.example'), 'lookmovie-relay')).toBe(false)
    expect(await relay.accepts(src!, 'relay-primary')).toBe(false)
    registration.deliveryMode = 'direct'
    expect(relay.permits(resolved)).toBe(false)
  })
  it.each([true, false])('issues relay sessions below the maximum lifetime so a slightly slower edge clock accepts them (estimated=%s)', async estimated => {
    const adapter = createStaticProvider('relay-primary', [{ ref, sources: [{ ...source, expiresAt: new Date(Date.now() + (estimated ? 300000 : 3600000)).toISOString(), expiryEstimated: estimated }] }])
    const registration: ProviderRegistration = { ...setup().providers[2]!, adapter }
    const relay = createPlaybackRelay({ origin: 'https://edge.example', secret, providers: { 'relay-primary': ['media.example'] } })
    const playback = createPlayback({ providers: [registration], store: createMemoryPlaybackStore(), region: 'US', relay, relayOrigin: 'https://watch.example' })
    const session = await playback.resolve('viewer', input, signal)
    const edgeNow = Date.now() - 2000
    const codec = await createGrantCodec(secret)
    const grant = await codec.open(new URL(session.source.src).pathname.slice(7), edgeNow)
    expect(grant.expires).toBe(Date.parse(session.source.expiresAt))
    expect(grant.expires - edgeNow).toBeLessThan(30 * 60000)
    await expect(codec.open(new URL(session.source.src).pathname.slice(7), grant.expires)).rejects.toThrow()
  })
  it.each([true, false, undefined])('keeps an estimated freshness deadline separate from the relay capability cutoff (estimated=%s)', async estimated => {
    const now = Date.now(), expiresAt = new Date(now + 300000).toISOString()
    const adapter = createStaticProvider('relay-primary', [{ ref, sources: [{ ...source, expiresAt, expiryEstimated: estimated }] }])
    const registration: ProviderRegistration = { ...setup().providers[2]!, adapter }
    const relay = createPlaybackRelay({ origin: 'https://edge.example', secret, providers: { 'relay-primary': ['media.example'] } })
    const playback = createPlayback({ providers: [registration], store: createMemoryPlaybackStore(), region: 'US', relay, relayOrigin: 'https://watch.example' })
    const selected = await playback.resolve('viewer', input, signal)
    const expires = Date.parse(selected.source.expiresAt)
    if (estimated) expect(expires - now).toBeGreaterThan(25 * 60000)
    else expect(expires).toBe(Date.parse(expiresAt) - 5000)
    expect(expires - now).toBeLessThanOrEqual(30 * 60000 + 1000)
    expect((await (await createGrantCodec(secret)).open(new URL(selected.source.src).pathname.slice(7))).expires).toBe(expires)
  })
  it('retains the conservative direct deadline for estimated-expiry sources', async () => {
    const expiresAt = new Date(Date.now() + 300000).toISOString()
    const registration: ProviderRegistration = { ...setup().providers[0]!, adapter: createStaticProvider('vixsrc', [{ ref, sources: [{ ...source, expiresAt, expiryEstimated: true }] }]) }
    const playback = createPlayback({ providers: [registration], store: createMemoryPlaybackStore(), region: 'US' })
    expect((await playback.resolve('viewer', input, signal)).source.expiresAt).toBe(new Date(Date.parse(expiresAt) - 5000).toISOString())
  })
  it('leases adapter-verified hosts only when both registration and edge recipe opt in', async () => {
    const registration: ProviderRegistration = { ...setup().providers[0]!, adapter: createStaticProvider('stormboron', []), deliveryMode: 'relay', relayHostDiscovery: 'storm-boron-v1' }
    const discovered: ProviderSource = { ...source, url: 'https://another-title.example/master.m3u8', relayRecipe: 'storm-boron-v1', relayHosts: ['another-title.example'] }
    const resolved = { registration, source: discovered, subtitles: [], delivery: 'direct' as const }
    const configured = { origin: 'https://edge.example', secret, providers: { stormboron: ['media.example'] } }
    expect(createPlaybackRelay(configured).permits(resolved)).toBe(false)
    const relay = createPlaybackRelay({ ...configured, discovery: { stormboron: 'storm-boron-v1' } })
    expect(relay.permits(resolved)).toBe(true)
    const url = await relay.issue(resolved, Date.now() + 60000, 'https://watch.example')
    expect(url).not.toBeNull()
    const grant = await (await createGrantCodec(secret)).open(new URL(url!).searchParams.get('grant')!)
    expect(grant).toMatchObject({ recipe: 'storm-boron-v1', hosts: ['another-title.example'] })
    expect(await relay.accepts(url!, 'stormboron')).toBe(true)
    registration.deliveryMode = 'direct'
    expect(relay.permits(resolved)).toBe(false)
  })
  it('compiles large leased playlists in the control plane and sends all media bytes to Worker capabilities', async () => {
    const signer=await createGrantCodec(secret),origin='https://watch.example'
    const grant={version:1 as const,provider:'stormboron',url:'https://rotating.example/title.m3u8',origin,expires:Date.now()+60000,headers:{},headerHost:'rotating.example',kind:'hls' as const,depth:0,recipe:'storm-boron-v1' as const,hosts:['rotating.example']}
    const manifest='#EXTM3U\n'+Array.from({length:1200},(_,i)=>`#EXTINF:6,\n${i}.ts\n`).join('')
    const transport=vi.fn(async(url:string)=>({status:200,url,headers:new Headers(),body:Readable.from([manifest])}))
    const relay=createPlaybackRelay({origin:'https://edge.example',secret,providers:{stormboron:['media.example']},discovery:{stormboron:'storm-boron-v1'}},transport)
    const text=await relay.manifest(await signer.seal(grant),origin,signal)
    const urls=text.split('\n').filter(line=>line.startsWith('https://'))
    expect(urls).toHaveLength(1200)
    expect(urls.every(url=>url.startsWith('https://edge.example/media/'))).toBe(true)
    expect((await signer.open(new URL(urls[0]!).pathname.slice(7))).kind).toBe('auto')
    expect(transport).toHaveBeenCalledTimes(1)
    await expect(relay.manifest(await signer.seal({...grant,kind:'auto'}),origin,signal)).rejects.toThrow()
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('exhausts direct before distinct relay providers, renews relay, and exhausts that tier', async () => {
    const { playback } = setup()
    const direct = await playback.resolve('viewer', input, signal)
    expect(direct.source).toMatchObject({ providerId: 'vixsrc', delivery: 'direct' })
    const backup = await playback.recover('viewer', direct.id, { sourceId: direct.source.id, reason: 'network', deliveryFailure: 'cors' }, false, signal)
    expect(backup.source).toMatchObject({ providerId: 'backup', delivery: 'direct' })
    const relayed = await playback.recover('viewer', direct.id, { sourceId: backup.source.id, reason: 'network' }, false, signal)
    expect(relayed).toMatchObject({ id: direct.id, ref, fallbackCount: 2, source: { providerId: 'relay-primary', delivery: 'relay' } })
    expect(await (await createGrantCodec(secret)).open(new URL(relayed.source.src).pathname.slice(7))).toMatchObject({ provider: 'relay-primary', url: source.url, origin: 'https://watch.example' })
    expect(await playback.recover('viewer', direct.id, { sourceId: backup.source.id, reason: 'network' }, false, signal)).toEqual(relayed)
    const renewed = await playback.recover('viewer', direct.id, { sourceId: relayed.source.id, reason: 'expired' }, true, signal)
    expect(renewed.source.delivery).toBe('relay')
    expect(renewed.source.src).not.toBe(relayed.source.src)
    const last = await playback.recover('viewer', direct.id, { sourceId: renewed.source.id, reason: 'network' }, false, signal)
    expect(last.source).toMatchObject({ providerId: 'relay-backup', delivery: 'relay' })
    await expect(playback.recover('viewer', direct.id, { sourceId: last.source.id, reason: 'network' }, false, signal)).rejects.toMatchObject({ code: 'PLAYBACK_UNAVAILABLE' })
  })
  it.each([{ enabled: false }, { approved: false }, { relayType: 'dash' as const }])('never falls back to direct delivery of relay-only rows (%j)', async options => {
    const { playback, providers } = setup(options)
    const resolveRelay = vi.spyOn(providers[2]!.adapter, 'resolve')
    const direct = await playback.resolve('viewer', input, signal)
    const backup = await playback.recover('viewer', direct.id, { sourceId: direct.source.id, reason: 'network' }, false, signal)
    expect(backup.source).toMatchObject({ providerId: 'backup', delivery: 'direct' })
    await expect(playback.recover('viewer', direct.id, { sourceId: backup.source.id, reason: 'network' }, false, signal)).rejects.toMatchObject({ code: 'PLAYBACK_UNAVAILABLE' })
    if (options.enabled === false || options.approved === false) expect(resolveRelay).not.toHaveBeenCalled()
  })
  it('keeps Vixsrc direct even if accidentally present in the relay host map', async () => {
    const { providers, store } = setup()
    const relay = createPlaybackRelay({ origin: 'https://edge.example', secret, providers: { vixsrc: ['media.example'] } })
    expect(relay.permits({ source, registration: providers[0]! })).toBe(false)
    const playback = createPlayback({ providers, store, region: 'US', relay, relayOrigin: 'https://watch.example' })
    const direct = await playback.resolve('viewer', input, signal)
    const backup = await playback.recover('viewer', direct.id, { sourceId: direct.source.id, reason: 'network' }, false, signal)
    await expect(playback.recover('viewer', direct.id, { sourceId: backup.source.id, reason: 'network' }, false, signal)).rejects.toMatchObject({ code: 'PLAYBACK_UNAVAILABLE' })
  })
  it('enforces owner, cancellation, provider removal and the finite switch budget', async () => {
    const { playback, providers, store } = setup()
    const direct = await playback.resolve('viewer', input, signal)
    await expect(playback.recover('intruder', direct.id, { sourceId: direct.source.id, reason: 'network' }, false, signal)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const record = JSON.parse((await store.get(`session:${direct.id}`))!)
    record.fallbackAt = Array(4).fill(Date.now())
    await store.set(`session:${direct.id}`, JSON.stringify(record), 3600)
    await expect(playback.recover('viewer', direct.id, { sourceId: direct.source.id, reason: 'network' }, false, signal)).rejects.toMatchObject({ code: 'PLAYBACK_UNAVAILABLE' })
    record.fallbackAt = []
    await store.set(`session:${direct.id}`, JSON.stringify(record), 3600)
    await expect(playback.recover('viewer', direct.id, { sourceId: direct.source.id, reason: 'network' }, false, AbortSignal.abort())).rejects.toMatchObject({ code: 'PLAYBACK_UNAVAILABLE' })
    providers[1]!.enabled = false
    expect((await playback.recover('viewer', direct.id, { sourceId: direct.source.id, reason: 'network' }, false, signal)).source.providerId).toBe('relay-primary')
  })
  it('renews expired owned relay capabilities', async () => {
    vi.useFakeTimers()
    try {
      const { playback } = setup()
      const relayed = await toRelay(playback)
      vi.setSystemTime(Date.parse(relayed.source.expiresAt) + 1000)
      expect((await playback.recover('viewer', relayed.id, { sourceId: relayed.source.id, reason: 'expired' }, true, signal)).source.delivery).toBe('relay')
    } finally { vi.useRealTimers() }
  })
  it('exhausts more than three direct providers before entering relay', async () => {
    const { playback } = setup({ directCount: 5 })
    let current = await playback.resolve('viewer', input, signal)
    for (const providerId of ['backup', 'extra-0', 'extra-1', 'extra-2', 'relay-primary']) {
      current = await playback.recover('viewer', current.id, { sourceId: current.source.id, reason: 'network' }, false, signal)
      expect(current.source).toMatchObject({ providerId, delivery: providerId.startsWith('relay-') ? 'relay' : 'direct' })
    }
  })
  it('skips relay sources whose header hints cannot fit a grant', async () => {
    const { playback, providers } = setup()
    providers[2]!.adapter.resolve = vi.fn(async () => ({ ok: true as const, sources: [{ ...source, headers: { referer: `https://media.example/${'x'.repeat(600)}` } }] }))
    expect((await toRelay(playback)).source.providerId).toBe('relay-backup')
  })
  it('supports explicit tier selection, correct roster labels and circuit reset', async () => {
    const { playback, store } = setup()
    expect((await playback.listProviders(input, signal)).map(p => [p.id, p.deliveryMode])).toEqual([['vixsrc', 'direct'], ['backup', 'direct'], ['relay-primary', 'relay'], ['relay-backup', 'relay']])
    const direct = await playback.resolve('viewer', input, signal)
    const selected = await playback.switchProvider('viewer', direct.id, 'relay-primary', signal)
    expect(selected.source.delivery).toBe('relay')
    expect((await playback.switchProvider('viewer', selected.id, 'vixsrc', signal)).source.delivery).toBe('direct')
    await playback.resetProviderCircuit!('relay-primary', 'movie')
    expect(JSON.parse((await store.get('provider-health:v1:US:movie:relay-primary:relay'))!).playbackFailures).toBe(0)
  })
  it('starts relay discovery only after direct misses and filters incompatible renditions', async () => {
    const { playback, providers } = setup()
    const calls: string[] = []
    for (const registration of providers) registration.adapter.resolve = vi.fn(async () => {
      calls.push(registration.adapter.id)
      return { ok: true as const, sources: registration.deliveryMode === 'relay' ? [{ ...source, key: 'dash', type: 'dash' as const }, source] : [] }
    })
    expect((await playback.resolve('viewer', input, signal)).source).toMatchObject({ providerId: 'relay-primary', delivery: 'relay', type: 'hls' })
    expect(calls).toEqual(['vixsrc', 'backup', 'relay-primary'])
  })
  it('defaults configured providers to direct and requires an explicit relay declaration', () => {
    const row = { adapter: 'static', id: 'fixture', regions: ['US'], mediaHosts: ['media.example'], entries: [{ ref, sources: [source] }] }
    expect(configuredProviders([row])[0]!.deliveryMode).toBe('direct')
    expect(configuredProviders([{ ...row, deliveryMode: 'relay' }])[0]!.deliveryMode).toBe('relay')
    expect(() => configuredProviders([{ ...row, deliveryMode: 'unknown' }])).toThrow()
  })
})
