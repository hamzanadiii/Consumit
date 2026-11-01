import { afterEach, expect, it, vi } from 'vitest'
import { createStaticProvider, type ProviderRegistration, type ProviderSource } from '@consumit/provider-sdk'
import { loadEnv } from '../../api/src/config/env.ts'
import * as configured from '../../api/src/playback/configured-providers.ts'
import { createPlaybackRuntime } from './runtime.ts'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('rejects a LookMovie Worker lookup that conflicts with its approved native media node', async () => {
  const env = loadEnv({ NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: '/unused/provider-fixture.json',
    PLAYBACK_RESOLVER_ENABLED: 'true', PLAYBACK_RESOLVER_ORIGIN: 'https://default.example', PLAYBACK_RESOLVER_SECRET: 'fixture-resolver-secret-longer-than-32', PLAYBACK_RESOLVER_PROVIDER_ORIGINS: JSON.stringify({ lookmovie: 'https://reviewed.example' }),
    PLAYBACK_NODE_ENABLED: 'true', PLAYBACK_NODE_ORIGIN: 'https://media-node.example', PLAYBACK_NODE_SECRET: 'fixture-node-secret-longer-than-32-characters', PLAYBACK_NODE_PROVIDERS: JSON.stringify({ lookmovie: ['media.example'] }) })
  await expect(createPlaybackRuntime({ env, animeCatalog: { async title() { throw new Error('Unexpected metadata lookup') } } })).rejects.toThrow('requires lookup on the same node')
})

it('keeps LookMovie lookup on its approved media node instead of the edge resolver', async () => {
  const ref = { kind: 'movie' as const, id: 550 }
  const source: ProviderSource = { key: 'main', url: 'https://media.example/movie.m3u8', type: 'hls', language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }
  const adapter = createStaticProvider('lookmovie', [{ ref, sources: [source] }])
  const native = vi.spyOn(adapter, 'resolve')
  const row: ProviderRegistration = { adapter, enabled: true, deliveryMode: 'relay', approvedRegions: ['US'], mediaKinds: ['movie'], mediaHosts: ['media.example'], upstreamGroup: 'lookmovie', concurrency: 1, requestsPerMinute: 10, workerConfig: { id: 'lookmovie', adapter: 'lookmovie', mediaHosts: ['media.example'] } }
  const load = vi.spyOn(configured, 'loadConfiguredProviders').mockResolvedValue([row])
  const fetcher = vi.fn<typeof fetch>(async () => { throw new Error('Unexpected edge lookup') })
  vi.stubGlobal('fetch', fetcher)
  const env = loadEnv({ NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: '/unused/provider-fixture.json',
    PLAYBACK_RESOLVER_ENABLED: 'true', PLAYBACK_RESOLVER_ORIGIN: 'https://default.example', PLAYBACK_RESOLVER_SECRET: 'fixture-resolver-secret-longer-than-32',
    PLAYBACK_NODE_ENABLED: 'true', PLAYBACK_NODE_ORIGIN: 'https://media-node.example', PLAYBACK_NODE_SECRET: 'fixture-node-secret-longer-than-32-characters', PLAYBACK_NODE_PROVIDERS: JSON.stringify({ lookmovie: ['media.example'] }) })
  const runtime = await createPlaybackRuntime({ env, animeCatalog: { async title() { throw new Error('Unexpected metadata lookup') } } })
  try {
    const session = await runtime.playback.resolve('fixture-owner', { ref, providerId: 'lookmovie', audioLanguage: 'en', capabilities: { hls: true, native: true, dash: false, nativeHls: false } }, new AbortController().signal)
    expect(new URL(session.source.src).origin).toBe('https://media-node.example')
    expect(native).toHaveBeenCalledTimes(1)
    expect(fetcher).not.toHaveBeenCalled()
    expect(load.mock.calls[0]?.[1]?.lookmovieWorker).toBeUndefined()
  } finally { await runtime.close() }
})

it('does not register CineSrc in the subtitle roster', async () => {
  const runtime = await createPlaybackRuntime({ env: loadEnv({ NODE_ENV: 'test' }), animeCatalog: { async title() { throw new Error('Unexpected catalog lookup') } } })
  try {
    const ids = runtime.subtitles.discovery!.diagnostics().map(provider => provider.id)
    expect(ids).toContain('yify')
    expect(ids).not.toContain('cinesrc')
  } finally { await runtime.close() }
})

it.each([false, true])('honors an explicit Worker route over the default native lookup exception (%s)', async explicit => {
  const ref = { kind: 'anime' as const, id: 21, episode: 1 }
  const source: ProviderSource = { key: 'main', url: 'https://media.example/video.mp4', type: 'native', language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }
  const adapter = createStaticProvider('yumezone', [{ ref, sources: [source] }])
  const native = vi.spyOn(adapter, 'resolve')
  const row: ProviderRegistration = { adapter, enabled: true, deliveryMode: 'direct', approvedRegions: ['US'], mediaKinds: ['anime'], mediaHosts: ['media.example'], upstreamGroup: 'yumezone', concurrency: 2, requestsPerMinute: 30, workerConfig: { id: 'yumezone', adapter: 'yumezone', mediaHosts: ['media.example'] } }
  vi.spyOn(configured, 'loadConfiguredProviders').mockResolvedValue([row])
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: true, sources: [source] }))
  vi.stubGlobal('fetch', fetcher)
  const env = loadEnv({ NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: '/unused/provider-fixture.json', PLAYBACK_RESOLVER_ENABLED: 'true', PLAYBACK_RESOLVER_ORIGIN: 'https://default.example', PLAYBACK_RESOLVER_SECRET: 'fixture-resolver-secret-longer-than-32', ...(explicit ? { PLAYBACK_RESOLVER_PROVIDER_ORIGINS: JSON.stringify({ yumezone: 'https://reviewed.example' }) } : {}) })
  const runtime = await createPlaybackRuntime({ env, animeCatalog: { async title() { throw new Error('Unexpected catalog lookup') } }, metadata: async () => ({ animeTitle: 'One Piece' }) })
  try {
    const session = await runtime.playback.resolve('fixture-owner', { ref, providerId: 'yumezone', audioLanguage: 'ja', capabilities: { hls: true, native: true, dash: false, nativeHls: false } }, new AbortController().signal)
    expect(session.source.providerId).toBe('yumezone')
    expect(native).toHaveBeenCalledTimes(explicit ? 0 : 1)
    expect(fetcher).toHaveBeenCalledTimes(explicit ? 1 : 0)
    if (explicit) expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://reviewed.example/v1/resolve')
  } finally { await runtime.close() }
})

it.each([false, true])('honors an explicit Worker route over the StreamVault native lookup route (%s)', async explicit => {
  const ref = { kind: 'movie' as const, id: 550 }
  const source: ProviderSource = { key: 'main', url: 'https://media.example/video.mp4', type: 'native', language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }
  const adapter = createStaticProvider('streamvault', [{ ref, sources: [source] }])
  const native = vi.spyOn(adapter, 'resolve')
  const row: ProviderRegistration = { adapter, enabled: true, deliveryMode: 'direct', approvedRegions: ['US'], mediaKinds: ['movie'], mediaHosts: ['media.example'], upstreamGroup: 'streamvault', concurrency: 2, requestsPerMinute: 30, workerConfig: { id: 'streamvault', adapter: 'streamvault', mediaHosts: ['media.example'] } }
  vi.spyOn(configured, 'loadConfiguredProviders').mockResolvedValue([row])
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: true, sources: [source] }))
  vi.stubGlobal('fetch', fetcher)
  const env = loadEnv({ NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: '/unused/provider-fixture.json', PLAYBACK_RESOLVER_ENABLED: 'true', PLAYBACK_RESOLVER_ORIGIN: 'https://default.example', PLAYBACK_RESOLVER_SECRET: 'fixture-resolver-secret-longer-than-32', ...(explicit ? { PLAYBACK_RESOLVER_PROVIDER_ORIGINS: JSON.stringify({ streamvault: 'https://reviewed.example' }) } : {}) })
  const runtime = await createPlaybackRuntime({ env, animeCatalog: { async title() { throw new Error('Unexpected catalog lookup') } } })
  try {
    const session = await runtime.playback.resolve('fixture-owner', { ref, providerId: 'streamvault', audioLanguage: 'en', capabilities: { hls: true, native: true, dash: false, nativeHls: false } }, new AbortController().signal)
    expect(session.source.providerId).toBe('streamvault')
    expect(native).toHaveBeenCalledTimes(explicit ? 0 : 1)
    expect(fetcher).toHaveBeenCalledTimes(explicit ? 1 : 0)
    if (explicit) expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://reviewed.example/v1/resolve')
  } finally { await runtime.close() }
})

it.each([
  ['nontonflix', 'media.nontonflix.com'],
  ['embedmaster', 'perfectbussines.website'],
] as const)('keeps %s on the playback service resolver when the Cloudflare Resolver is enabled', async (id, mediaHost) => {
  const ref = { kind: 'movie' as const, id: 550 }
  const source: ProviderSource = { key: 'main', url: `https://${mediaHost}/video.m3u8`, type: 'hls', language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }
  const adapter = createStaticProvider(id, [{ ref, sources: [source] }])
  const native = vi.spyOn(adapter, 'resolve')
  const row: ProviderRegistration = { adapter, enabled: true, deliveryMode: 'direct', approvedRegions: ['US'], mediaKinds: ['movie', 'series'], mediaHosts: [mediaHost], upstreamGroup: id, concurrency: 1, requestsPerMinute: 10, workerConfig: { id, adapter: id, mediaHosts: [mediaHost] } }
  vi.spyOn(configured, 'loadConfiguredProviders').mockResolvedValue([row])
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: true, sources: [source] }))
  vi.stubGlobal('fetch', fetcher)
  const env = loadEnv({ NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: '/unused/provider-fixture.json', PLAYBACK_RESOLVER_ENABLED: 'true', PLAYBACK_RESOLVER_ORIGIN: 'https://default.example', PLAYBACK_RESOLVER_SECRET: 'fixture-resolver-secret-longer-than-32' })
  const runtime = await createPlaybackRuntime({ env, animeCatalog: { async title() { throw new Error('Unexpected catalog lookup') } }, metadata: async () => ({ animeTitle: 'One Piece' }) })
  try {
    const session = await runtime.playback.resolve('fixture-owner', { ref, providerId: id, audioLanguage: 'en', capabilities: { hls: true, native: true, dash: false, nativeHls: false } }, new AbortController().signal)
    expect(session.source.providerId).toBe(id)
    expect(native).toHaveBeenCalledTimes(1)
    expect(fetcher).not.toHaveBeenCalled()
  } finally { await runtime.close() }
})

it('keeps VidBolt on the playback service resolver when the Cloudflare Resolver is enabled', async () => {
  const ref = { kind: 'movie' as const, id: 550 }
  const source: ProviderSource = { key: 'orion', url: 'https://img.rousav.tech/video.m3u8', type: 'hls', language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: { origin: 'https://vidbolt.xyz' }, subtitles: [] }
  const adapter = createStaticProvider('vidbolt', [{ ref, sources: [source] }])
  const native = vi.spyOn(adapter, 'resolve')
  const row: ProviderRegistration = { adapter, enabled: true, deliveryMode: 'direct', approvedRegions: ['US'], mediaKinds: ['movie', 'series'], mediaHosts: ['img.rousav.tech', 'img.animecurx.tech'], upstreamGroup: 'vidbolt', concurrency: 1, requestsPerMinute: 10, workerConfig: { id: 'vidbolt', adapter: 'vidbolt', resolutionHosts: ['vidbolt.xyz'], mediaHosts: ['img.rousav.tech', 'img.animecurx.tech'] } }
  vi.spyOn(configured, 'loadConfiguredProviders').mockResolvedValue([row])
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: true, sources: [source] }))
  vi.stubGlobal('fetch', fetcher)
  const env = loadEnv({ NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: '/unused/provider-fixture.json', PLAYBACK_RESOLVER_ENABLED: 'true', PLAYBACK_RESOLVER_ORIGIN: 'https://default.example', PLAYBACK_RESOLVER_SECRET: 'fixture-resolver-secret-longer-than-32' })
  const runtime = await createPlaybackRuntime({ env, animeCatalog: { async title() { throw new Error('Unexpected catalog lookup') } }, metadata: async () => ({ animeTitle: 'One Piece' }) })
  try {
    const session = await runtime.playback.resolve('fixture-owner', { ref, providerId: 'vidbolt', audioLanguage: 'en', capabilities: { hls: true, native: true, dash: false, nativeHls: false } }, new AbortController().signal)
    expect(session.source.providerId).toBe('vidbolt')
    expect(native).toHaveBeenCalledTimes(1)
    expect(fetcher).not.toHaveBeenCalled()
  } finally { await runtime.close() }
})
