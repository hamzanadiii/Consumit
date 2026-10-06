import { describe, expect, it, vi } from 'vitest'
import { createStaticProvider, type ProviderRegistration, type ProviderSource } from '@consumit/provider-sdk'
import { createPlayback } from './playback.ts'
import { createMemoryPlaybackStore } from './state.ts'
import { createPlaybackRelay } from './relay.ts'
const ref = { kind: 'series' as const, id: 235930, season: 1, episode: 1 }
const input = { ref, capabilities: { hls: true, dash: true, native: true, nativeHls: false }, audioLanguage: 'en' }
const signal = new AbortController().signal
const source: ProviderSource = { key: 'main', url: 'https://media.example/master.m3u8', type: 'hls', language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }
function row(id: string, deliveryMode: 'direct' | 'relay' | 'embed', available = true): ProviderRegistration {
  return { adapter: createStaticProvider(id, [{ ref, sources: available ? [{ ...source, ...(deliveryMode === 'embed' ? { type: 'iframe', url: 'https://media.example/embed/exact' } : {}) }] : [] }]), enabled: true, deliveryMode, approvedRegions: ['US'], mediaHosts: ['media.example'], mediaKinds: ['series'], upstreamGroup: id, concurrency: 2, requestsPerMinute: 30 }
}
describe('Direct then Relay then Embed delivery', () => {
  it('starts on the explicitly chosen provider without running the other tiers', async () => {
    const direct = row('direct', 'direct'), frame = row('frame', 'embed')
    direct.adapter.resolve = vi.fn(direct.adapter.resolve)
    const playback = createPlayback({ providers: [direct, frame], region: 'US', store: createMemoryPlaybackStore() })
    const request = { ...input, providerId: 'frame' }
    const result = await playback.resolve('guest', request, signal)
    expect(result.source).toMatchObject({ providerId: 'frame', delivery: 'embed' })
    expect(result.ref).toEqual(ref)
    expect(direct.adapter.resolve).not.toHaveBeenCalled()
  })
  it('rejects an unavailable startup choice instead of silently playing another server', async () => {
    const playback = createPlayback({ providers: [row('direct', 'direct'), row('empty', 'direct', false)], region: 'US', store: createMemoryPlaybackStore() })
    for (const providerId of ['empty', 'unknown']) await expect(playback.resolve('guest', { ...input, providerId }, signal)).rejects.toThrow()
  })
  it.each(['disabled', 'region', 'kind', 'audio-only', 'unapproved-relay', 'anime-audio'])('does not resolve an ineligible startup choice (%s)', async reason => {
    const target = row('chosen', 'direct')
    if (reason === 'disabled') target.enabled = false
    if (reason === 'region') target.approvedRegions = ['MA']
    if (reason === 'kind') target.mediaKinds = ['movie']
    if (reason === 'audio-only') target.role = 'audio'
    if (reason === 'unapproved-relay') target.deliveryMode = 'relay'
    if (reason === 'anime-audio') { target.mediaKinds = ['anime']; target.adapter = { ...target.adapter, audioLanguages: ['ja'] } }
    target.adapter.resolve = vi.fn(target.adapter.resolve)
    const playback = createPlayback({ providers: [row('direct', 'direct'), target], region: 'US', store: createMemoryPlaybackStore() })
    const request = { ...input, providerId: target.adapter.id, ...(reason === 'anime-audio' ? { ref: { kind: 'anime' as const, id: 21, episode: 1 } } : {}) }
    await expect(playback.resolve('guest', request, signal)).rejects.toThrow('Choose an available playback provider.')
    expect(target.adapter.resolve).not.toHaveBeenCalled()
  })
  it('uses frame fallback only after both media tiers miss and retains the exact ref', async () => {
    const direct = row('direct', 'direct', false), proxy = row('relay', 'relay', false), frame = row('frame', 'embed')
    const calls: string[] = []
    for (const provider of [direct, proxy, frame]) { const resolve = provider.adapter.resolve; provider.adapter.resolve = vi.fn(async (input, signal) => { calls.push(provider.adapter.id); return resolve(input, signal) }) }
    const relay = createPlaybackRelay({ origin: 'https://edge.example', secret: 'fixture-secret-over-thirty-two-characters', providers: { relay: ['media.example'] } })
    const playback = createPlayback({ providers: [frame, proxy, direct], region: 'US', store: createMemoryPlaybackStore(), relay })
    const result = await playback.resolve('guest', input, signal)
    expect(calls).toEqual(['direct', 'relay', 'frame'])
    expect(result.ref).toEqual(ref)
    expect(result.source).toMatchObject({ delivery: 'embed', type: 'iframe', providerId: 'frame', subtitles: [], skipSegments: [] })
    expect(result.capabilities).toMatchObject({ refresh: false, externalSubtitles: false })
    expect((await playback.listProviders(input, signal)).map(row => row.deliveryMode)).toContain('embed')
  })
  it('switches from direct to frame and back in one owned session', async () => {
    const playback = createPlayback({ providers: [row('direct', 'direct'), row('frame', 'embed')], region: 'US', store: createMemoryPlaybackStore() })
    const start = await playback.resolve('guest', input, signal)
    const framed = await playback.switchProvider('guest', start.id, 'frame', signal)
    expect(framed.id).toBe(start.id)
    expect(framed.ref).toEqual(ref)
    expect(framed.source.delivery).toBe('embed')
    const direct = await playback.switchProvider('guest', start.id, 'direct', signal)
    expect(direct.source.delivery).toBe('direct')
    await expect(playback.switchProvider('other', start.id, 'frame', signal)).rejects.toThrow()
  })
  it('recovers from exhausted direct media into embeds, without relay approval', async () => {
    const playback = createPlayback({ providers: [row('direct', 'direct'), row('frame', 'embed')], region: 'US', store: createMemoryPlaybackStore() })
    const start = await playback.resolve('guest', input, signal)
    const framed = await playback.recover('guest', start.id, { sourceId: start.source.id, reason: 'network' }, false, signal)
    expect(framed.source.delivery).toBe('embed')
    expect(framed.ref).toEqual(ref)
  })
  it('never grants an iframe through the relay', () => {
    const registration = row('frame', 'relay')
    const relay = createPlaybackRelay({ origin: 'https://edge.example', secret: 'fixture-secret-over-thirty-two-characters', providers: { frame: ['media.example'] } })
    expect(relay.permits({ registration, source: { ...source, type: 'iframe' } })).toBe(false)
  })
})
