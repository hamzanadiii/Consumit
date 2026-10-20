import { afterEach, expect, it, vi } from 'vitest'
import { createStaticProvider, type ProviderRegistration, type ProviderSource } from '@consumit/provider-sdk'
import { loadEnv } from '../../api/src/config/env.ts'
import * as configured from '../../api/src/playback/configured-providers.ts'
import { createPlaybackRuntime } from './runtime.ts'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

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
