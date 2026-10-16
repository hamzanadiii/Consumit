import { describe, expect, it, vi } from 'vitest'
import type { ProviderRegistration } from '@consumit/provider-sdk'
import { createCloudflareResolverAdapter } from './cloudflare-resolver.ts'
import { createResolver } from './resolver.ts'

describe('Cloudflare resolver adapter', () => {
  it('selects an explicitly configured provider Worker without retrying through the default or API', async () => {
    const native = vi.fn()
    const fetcher = vi.fn<(input: URL, init?: RequestInit) => Promise<Response>>(async () => new Response('capacity', { status: 503 }))
    const provider = { adapter: { id: 'animekitsu', resolve: native }, workerConfig: { id: 'animekitsu', adapter: 'animekitsu' } } as unknown as ProviderRegistration
    const adapter = createCloudflareResolverAdapter(provider, {
      config: { origin: 'https://resolver.example', secret: 's'.repeat(48), providerOrigins: { animekitsu: 'https://regional.example' } },
      currentConfig: current => ({ ...current.workerConfig }), metadata: async () => ({ animeTitle: 'Naruto' }), fetch: fetcher,
    })
    expect(await adapter.resolve({ ref: { kind: 'anime', id: 20, episode: 1 }, region: 'US', audioLanguage: 'ja' }, new AbortController().signal)).toEqual({ ok: false, code: 'unavailable', retryable: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]?.[0].origin).toBe('https://regional.example')
    expect(native).not.toHaveBeenCalled()
  })
  it('uses only the explicitly reviewed Miami API lookup route while preserving the original adapter after wrapping', async () => {
    const native = vi.fn(async () => ({ ok: true as const, sources: [{ key: 'miami', url: 'https://moon.zenoak.top/master.m3u8', type: 'hls' as const, expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }] }))
    const fetcher = vi.fn(async () => Response.json({ ok: false, code: 'unavailable', retryable: true }))
    const metadata = vi.fn(async () => ({}))
    const provider = { adapter: { id: 'wecollege-miami', resolve: native }, deliveryMode: 'relay', workerConfig: { id: 'wecollege-miami', adapter: 'wecollege' } } as unknown as ProviderRegistration
    provider.adapter = createCloudflareResolverAdapter(provider, {
      config: { origin: 'https://resolver.example', secret: 'secret-secret-secret-secret-secret-secret', apiProviders: ['wecollege-miami'] },
      currentConfig: current => ({ ...current.workerConfig }), metadata, fetch: fetcher,
    })
    const input = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
    expect(await provider.adapter.resolve(input, new AbortController().signal)).toMatchObject({ ok: true })
    expect(native).toHaveBeenCalledTimes(1)
    expect(fetcher).not.toHaveBeenCalled(); expect(metadata).not.toHaveBeenCalled()
    provider.deliveryMode = 'direct'
    await provider.adapter.resolve(input, new AbortController().signal)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(native).toHaveBeenCalledTimes(1)
  })
  it('keeps Aphrodite lookup on the Cloudflare Resolver even when a broader exception config is supplied', async () => {
    const native = vi.fn()
    const fetcher = vi.fn(async () => Response.json({ ok: false, code: 'unavailable', retryable: true }))
    const metadata = vi.fn(async () => ({}))
    const provider = { adapter: { id: 'aphrodite', resolve: native }, deliveryMode: 'relay', workerConfig: { id: 'aphrodite', adapter: 'aphrodite' } } as unknown as ProviderRegistration
    provider.adapter = createCloudflareResolverAdapter(provider, {
      config: { origin: 'https://resolver.example', secret: 'secret-secret-secret-secret-secret-secret', apiProviders: ['wecollege-miami'] },
      currentConfig: current => ({ ...current.workerConfig }), metadata, fetch: fetcher,
    })
    const input = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
    expect(await provider.adapter.resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'unavailable' })
    expect(native).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(1); expect(metadata).toHaveBeenCalledTimes(1)
  })
  it('sends one authenticated request with the current provider config and canonical metadata', async () => {
    const fetch = vi.fn(async (input: URL, init?: RequestInit) => {
      expect(input.pathname).toBe('/v1/resolve')
      expect(init?.method).toBe('POST')
      return new Response(JSON.stringify({ ok: false, code: 'empty', retryable: false }), { status: 200 })
    })
    const provider = {
      adapter: { id: 'vidzen', resolve: vi.fn() }, enabled: true, approvedRegions: ['US'], mediaHosts: ['vidzen.fun'],
      mediaHostPatterns: [], upstreamGroup: 'vidzen', concurrency: 1, requestsPerMinute: 10, mediaKinds: ['movie'],
      workerConfig: { id: 'vidzen', adapter: 'vidzen', mediaHosts: ['vidzen.fun'] },
    } as unknown as ProviderRegistration
    const adapter = createCloudflareResolverAdapter(provider, {
      config: { origin: 'https://resolver.example', secret: 'secret-secret-secret-secret-secret-secret', apiProviders: ['wecollege-miami'] },
      currentConfig: current => ({ ...current.workerConfig, id: current.adapter.id, regions: [...current.approvedRegions], mediaHosts: [...current.mediaHosts] }),
      metadata: async () => ({ title: 'Fight Club', year: 1999 }),
      fetch,
    })
    await expect(adapter.resolve({ ref: { kind: 'movie', id: 550 }, region: 'US', audioLanguage: 'en' }, new AbortController().signal))
      .resolves.toEqual({ ok: false, code: 'empty', retryable: false })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(provider.adapter.resolve).not.toHaveBeenCalled()
    const [url, init] = fetch.mock.calls[0]!
    expect(url.pathname).toBe('/v1/resolve')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret-secret-secret-secret-secret-secret')
    expect(JSON.parse(String(init?.body))).toMatchObject({ providerId: 'vidzen', metadata: { title: 'Fight Club', year: 1999 } })
  })

  it('converts Worker capacity and network failures into retryable provider failures', async () => {
    const provider = {
      adapter: { id: 'vidzen', resolve: vi.fn() }, workerConfig: { id: 'vidzen', adapter: 'vidzen' },
    } as unknown as ProviderRegistration
    const adapter = createCloudflareResolverAdapter(provider, {
      config: { origin: 'https://resolver.example', secret: 'secret-secret-secret-secret-secret-secret' },
      currentConfig: current => ({ ...current.workerConfig, id: current.adapter.id, mediaHosts: ['vidzen.fun'] }),
      metadata: async () => ({}), fetch: async () => new Response('busy', { status: 503 }),
    })
    await expect(adapter.resolve({ ref: { kind: 'movie', id: 550 }, region: 'US', audioLanguage: 'en' }, new AbortController().signal))
      .resolves.toEqual({ ok: false, code: 'unavailable', retryable: true })
  })

  it('continues the API provider waterfall when a Cloudflare attempt fails', async () => {
    const remote: ProviderRegistration = {
      adapter: { id: 'vidzen', resolve: vi.fn() }, enabled: true, approvedRegions: ['US'], mediaHosts: ['vidzen.fun'],
      mediaHostPatterns: [], upstreamGroup: 'vidzen', concurrency: 1, requestsPerMinute: 10, mediaKinds: ['movie'],
      workerConfig: { id: 'vidzen', adapter: 'vidzen', mediaHosts: ['vidzen.fun'] },
    } as unknown as ProviderRegistration
    remote.adapter = createCloudflareResolverAdapter(remote, {
      config: { origin: 'https://resolver.example', secret: 'secret-secret-secret-secret-secret-secret' },
      currentConfig: current => ({ ...current.workerConfig, id: current.adapter.id, mediaHosts: [...current.mediaHosts] }),
      metadata: async () => ({}), fetch: async () => new Response('capacity', { status: 503 }),
    })
    const fallback = {
      adapter: { id: 'fallback', resolve: async () => ({ ok: true as const, sources: [{ key: 'backup', url: 'https://backup.example/watch.m3u8', type: 'hls' as const, language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }] }) },
      enabled: true, approvedRegions: ['US'], mediaHosts: ['backup.example'], upstreamGroup: 'fallback', concurrency: 1,
      requestsPerMinute: 10, mediaKinds: ['movie'],
    } as unknown as ProviderRegistration
    const resolved = await createResolver([remote, fallback], { region: 'US' }).resolve({
      ref: { kind: 'movie', id: 550 }, capabilities: { hls: true, dash: false, native: true, nativeHls: true }, audioLanguage: 'en',
    }, new AbortController().signal)
    expect(resolved?.registration.adapter.id).toBe('fallback')
  })
})
