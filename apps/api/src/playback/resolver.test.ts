import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStaticProvider, type ProviderRegistration, type ProviderSource } from '@consumit/provider-sdk'
import { createResolver } from './resolver.ts'
import { createCapabilityRegistry } from './delivery.ts'
import { createMemoryPlaybackStore } from './state.ts'

const source: ProviderSource = { key: 'main', url: 'https://media.example/test.m3u8', type: 'hls', language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }
const input = { ref: { kind: 'movie' as const, id: 1 }, capabilities: { hls: true, dash: false, native: true, nativeHls: true }, audioLanguage: 'en' }
function provider(id: string): ProviderRegistration { return { adapter: createStaticProvider(id, [{ ref: input.ref, sources: [source] }]), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: id, concurrency: 2, requestsPerMinute: 30 } }
afterEach(() => vi.useRealTimers())
describe('bounded playback resolution', () => {
  it('shares disposable access across resolvers but never reuses expired credentials', async () => {
    let now = Date.now()
    const store = createMemoryPlaybackStore(() => now)
    const first = provider('first')
    first.adapter.resolve = vi.fn(async () => ({ ok: true as const, sources: [{ ...source, expiresAt: new Date(now + 61000).toISOString() }] }))
    const options = { region: 'US', store, now: () => now }
    const resolved = await createResolver([first], options).resolve(input, new AbortController().signal)
    expect(resolved).not.toBeNull()
    expect(await createResolver([first], options).resolve(input, new AbortController().signal)).not.toBeNull()
    expect(first.adapter.resolve).toHaveBeenCalledTimes(1)
    now += 32000
    expect(await createResolver([first], options).resolve(input, new AbortController().signal)).not.toBeNull()
    expect(first.adapter.resolve).toHaveBeenCalledTimes(2)
  })
  it('hedges a stalled primary, cancels it, and chooses a compatible backup', async () => {
    vi.useFakeTimers()
    const first = provider('first'); const backup = provider('backup')
    let cancelled = false
    first.adapter.resolve = async (_input, signal) => new Promise(() => { signal.addEventListener('abort', () => { cancelled = true }) })
    const resolver = createResolver([first, backup], { region: 'US' })
    const task = resolver.resolve(input, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(600)
    // The answered backup holds briefly for the hung primary's tracks, then
    // releases and cancels it; failover still completes well inside deadline.
    await vi.advanceTimersByTimeAsync(500)
    expect((await task)?.registration.adapter.id).toBe('backup')
    expect(cancelled).toBe(true)
  })
  it('coalesces concurrent requests and keeps work alive for remaining callers', async () => {
    vi.useFakeTimers()
    const first = provider('first')
    const original = first.adapter.resolve
    first.adapter.resolve = vi.fn(async (request, signal) => { await new Promise((resolve) => setTimeout(resolve, 100)); return original(request, signal) })
    const resolver = createResolver([first], { region: 'US' })
    const controller = new AbortController()
    const cancelled = resolver.resolve(input, controller.signal)
    const kept = resolver.resolve(input, new AbortController().signal)
    controller.abort()
    await vi.advanceTimersByTimeAsync(100)
    expect(await cancelled).toBeNull()
    expect(await kept).not.toBeNull()
    expect(first.adapter.resolve).toHaveBeenCalledTimes(1)
    await resolver.resolve(input, new AbortController().signal)
    expect(first.adapter.resolve).toHaveBeenCalledTimes(1)
  })
  it('finishes within the deadline even when adapters ignore cancellation', async () => {
    vi.useFakeTimers()
    const first = provider('first')
    first.adapter.resolve = () => new Promise(() => undefined)
    const resolver = createResolver([first], { region: 'US' })
    const task = resolver.resolve(input, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(8000)
    expect(await task).toBeNull()
  })
  it('excludes correlated providers and disabled or unapproved registrations', async () => {
    const first = provider('first'); const same = provider('same'); same.upstreamGroup = first.upstreamGroup
    const disabled = provider('disabled'); disabled.enabled = false
    const outside = provider('outside'); outside.approvedRegions = ['GB']
    const resolver = createResolver([first, same, disabled, outside], { region: 'US' })
    expect(await resolver.resolve(input, new AbortController().signal, ['first'])).toBeNull()
  })
  it('aggregates subtitle tracks from every validated source, not just the played one', async () => {
    const en = { id: 'en', label: 'English', language: 'en', url: 'https://media.example/subs/en.vtt', format: 'vtt' as const }
    const ar = { id: 'ar', label: 'Arabic', language: 'ar', url: 'https://media.example/subs/ar.vtt', format: 'vtt' as const }
    const registration = provider('subs')
    registration.adapter.resolve = vi.fn(async () => ({ ok: true as const, sources: [
      { ...source, key: 'a', subtitles: [en] },
      { ...source, key: 'b', subtitles: [ar] },
    ] }))
    const resolved = await createResolver([registration], { region: 'US' }).resolve(input, new AbortController().signal)
    expect(resolved?.source.key).toBe('a')
    expect(resolved?.subtitles.map((candidate) => candidate.track.id)).toEqual(['en', 'ar'])
  })
  it('settles briefly for a hedged companion so its tracks join without slowing the fast path', async () => {
    vi.useFakeTimers()
    const winner = provider('winner'); const companion = provider('companion')
    const track = { id: 'en', label: 'English', language: 'en', url: 'https://media.example/subs/en.vtt', format: 'vtt' as const }
    winner.adapter.resolve = () => new Promise((resolve) => setTimeout(() => resolve({ ok: true as const, sources: [source] }), 700))
    companion.adapter.resolve = () => new Promise((resolve) => setTimeout(() => resolve({ ok: true as const, sources: [{ ...source, key: 'backup', subtitles: [track] }] }), 150))
    const resolver = createResolver([winner, companion], { region: 'US' })
    const task = resolver.resolve(input, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(700)
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(500)
    const resolved = await task
    expect(resolved?.source.key).toBe('main')
    expect(resolved?.registration.adapter.id).toBe('winner')
    expect(resolved?.subtitles.map((candidate) => candidate.track.id)).toEqual(['en'])
  })
  it('tries operator-pinned providers before learned health ranking', async () => {
    const low = provider('low'); const high = provider('high')
    high.priority = 90
    const resolver = createResolver([low, high], { region: 'US' })
    expect((await resolver.resolve(input, new AbortController().signal))?.registration.adapter.id).toBe('high')
  })
  it('prefers adaptive media, then the best fixed rendition that fits the display', async () => {
    const registration = provider('quality')
    const fixed = [2160, 1080, 720].map((height) => ({ ...source, key: `${height}p`, url: `https://media.example/${height}.m3u8`, height }))
    registration.adapter.resolve = vi.fn(async () => ({ ok: true as const, sources: fixed }))
    const resolver = createResolver([registration], { region: 'US' })
    await expect(resolver.resolve({ ...input, capabilities: { ...input.capabilities, maxHeight: 1440 } }, new AbortController().signal)).resolves.toMatchObject({ source: { height: 1080 } })
    await expect(resolver.resolve({ ...input, capabilities: { ...input.capabilities, maxHeight: 2160 } }, new AbortController().signal, [], undefined, true)).resolves.toMatchObject({ source: { height: 2160 } })
    registration.adapter.resolve = vi.fn(async () => ({ ok: true as const, sources: [{ ...source }, ...fixed] }))
    await expect(resolver.resolve({ ...input, ref: { kind: 'movie', id: 2 } }, new AbortController().signal, [], undefined, true)).resolves.toMatchObject({ source: { key: 'main' } })
  })
  it('plans delivery in shadow mode without changing resolution', async () => {
    const registration = provider('shadow')
    const store = createMemoryPlaybackStore()
    const resolver = createResolver([registration], {
      region: 'US', store,
      delivery: { registry: createCapabilityRegistry(store), enabled: true },
    })
    // Empty registry means the source is not yet proven browser-direct and
    // must fail closed now that no relay fallback exists.
    await expect(resolver.resolve(input, new AbortController().signal)).resolves.toBeNull()
    await expect(createResolver([registration], { region: 'US' }).resolve(input, new AbortController().signal)).resolves.toMatchObject({ source: { key: 'main' } })
  })
})
