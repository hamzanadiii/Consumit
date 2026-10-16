import { describe, expect, it, vi } from 'vitest'
import { createStaticProvider, type ProviderRegistration, type ProviderResult, type ProviderSource } from '@consumit/provider-sdk'
import { createPlayback } from './playback.ts'
import { createResolver } from './resolver.ts'
import { createMemoryPlaybackStore } from './state.ts'
import { createPlaybackRelay } from './relay.ts'

const ref = { kind: 'movie' as const, id: 42 }
const input = { ref, capabilities: { hls: true, dash: true, native: true, nativeHls: false }, audioLanguage: 'en' }
const source: ProviderSource = { key: 'main', url: 'https://media.example/master.m3u8', type: 'hls', language: 'en', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }
const signal = new AbortController().signal
const registration = (id: string, deliveryMode: 'direct' | 'relay' = 'direct'): ProviderRegistration => ({ adapter: createStaticProvider(id, [{ ref, sources: [source] }]), enabled: true, deliveryMode, role: 'video', approvedRegions: ['US'], mediaHosts: ['media.example'], mediaKinds: ['movie'], upstreamGroup: id, requestsPerMinute: 30, concurrency: 2 })
const relay = (ids: string[]) => createPlaybackRelay({ origin: 'https://edge.example', secret: 'fixture-relay-secret-at-least-32-characters', providers: Object.fromEntries(ids.map(id => [id, ['media.example']])) })

describe('operator video delivery choice', () => {
  it('keeps fixed qualities in one relay provider and reissues the selected height in the same session', async () => {
    const provider = registration('miami', 'relay')
    provider.adapter = createStaticProvider('miami', [{ ref, sources: [480, 720, 1080, 2160].map(height => ({ ...source, key: String(height), url: `https://media.example/${height}.m3u8`, height, qualityHint: `${height}p`, qualityGroup: 'miami' })) }])
    const playback = createPlayback({ providers: [provider], store: createMemoryPlaybackStore(), region: 'US', relay: relay(['miami']), relayOrigin: 'https://watch.example' })
    const initial = await playback.resolve('viewer', input, signal)
    expect(initial.source).toMatchObject({ qualityHint: '1080p', qualityHeights: [2160, 1080, 720, 480] })
    const next = await playback.switchProvider('viewer', initial.id, 'miami', signal, { qualityHeight: 720 })
    expect(next.id).toBe(initial.id)
    expect(next.ref).toEqual(ref)
    expect(next.source).toMatchObject({ providerId: 'miami', delivery: 'relay', qualityHint: '720p', qualityHeights: [2160, 1080, 720, 480] })
    expect(next.source.src).not.toBe(initial.source.src)
    expect(await playback.listProviders(input, signal)).toHaveLength(1)
  })
  it('hot-applies both directions, bypasses an old cached winner and switches the same provider to the chosen path', async () => {
    const provider = registration('primary')
    const playback = createPlayback({ providers: [provider], store: createMemoryPlaybackStore(), region: 'US', relay: relay(['primary']), relayOrigin: 'https://watch.example' })
    const direct = await playback.resolve('viewer', input, signal)
    expect(direct.source.delivery).toBe('direct')
    provider.deliveryMode = 'relay'
    const proxy = await playback.resolve('viewer', input, signal)
    expect(proxy.source.delivery).toBe('relay')
    expect(proxy.source.src.startsWith('https://edge.example/media/')).toBe(true)
    const switched = await playback.switchProvider('viewer', direct.id, 'primary', signal)
    expect(switched.source.delivery).toBe('relay')
    expect(switched.id).toBe(direct.id)
    provider.deliveryMode = 'direct'
    const restored = await playback.switchProvider('viewer', switched.id, 'primary', signal)
    expect(restored.source).toMatchObject({ delivery: 'direct', src: source.url })
    expect(restored.id).toBe(direct.id)
  })
  it.each([false, true])('never silently delivers an unapproved Proxy provider directly (Worker configured: %s)', async configured => {
    const provider = registration('primary', 'relay')
    const resolve = vi.spyOn(provider.adapter, 'resolve')
    const playback = createPlayback({ providers: [provider], store: createMemoryPlaybackStore(), region: 'US', ...(configured ? { relay: relay([]), relayOrigin: 'https://watch.example' } : {}) })
    await expect(playback.resolve('viewer', input, signal)).rejects.toMatchObject({ code: 'PLAYBACK_UNAVAILABLE' })
    expect(resolve).not.toHaveBeenCalled()
    expect(await playback.listProviders(input, signal)).toEqual([])
  })
  it('finishes the direct pool before using a separately classified Proxy provider', async () => {
    const providers = [registration('primary'), registration('backup', 'relay')]
    const playback = createPlayback({ providers, store: createMemoryPlaybackStore(), region: 'US', relay: relay(['primary', 'backup']), relayOrigin: 'https://watch.example' })
    const direct = await playback.resolve('viewer', input, signal)
    const proxy = await playback.recover('viewer', direct.id, { sourceId: direct.source.id, reason: 'network', deliveryFailure: 'cors' }, false, signal)
    expect(proxy.source).toMatchObject({ providerId: 'backup', delivery: 'relay' })
    expect(proxy.ref).toEqual(ref)
  })
  it('rejects a pending direct winner if Admin changes its mode during resolution', async () => {
    const provider = registration('primary')
    let release!: (value: ProviderResult) => void
    const resolve = vi.spyOn(provider.adapter, 'resolve').mockImplementation(() => new Promise(resolve => { release = resolve }))
    const resolver = createResolver([provider], { region: 'US', providerFilter: p => p.deliveryMode !== 'relay' })
    const pending = resolver.resolve(input, signal)
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledOnce())
    provider.deliveryMode = 'relay'
    release({ ok: true, sources: [source] })
    expect(await pending).toBeNull()
  })
})
