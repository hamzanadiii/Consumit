import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStaticProvider, type ProviderRegistration, type ProviderSource } from '@consumit/provider-sdk'
import { failureCause } from './playback.ts'
import { createResolver } from './resolver.ts'
import { createMemoryPlaybackStore } from './state.ts'

const source: ProviderSource = { key: 'main', url: 'https://media.example/test.m3u8', type: 'hls', language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }
const input = { ref: { kind: 'movie' as const, id: 1 }, capabilities: { hls: true, dash: false, native: true, nativeHls: true }, audioLanguage: 'en' }
function provider(id: string): ProviderRegistration { return { adapter: createStaticProvider(id, [{ ref: input.ref, sources: [source] }]), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: id, concurrency: 2, requestsPerMinute: 30,   mediaKinds: ['movie', 'series'] } }
afterEach(() => vi.useRealTimers())
describe('bounded playback resolution', () => {
  it('offers only validated qualities from the selected source group, including shared-cache reads', async () => {
    const registration = provider('city')
    registration.adapter = createStaticProvider('city', [{ ref: input.ref, sources: [
      ...[480, 720, 1080, 2160].map(height => ({ ...source, key: `miami-${height}`, height, qualityGroup: 'miami' })),
      { ...source, key: 'boise', height: 1440, qualityGroup: 'boise' },
      { ...source, key: 'hostile', height: 4320, qualityGroup: 'miami', url: 'https://unapproved.example/a.m3u8' },
    ] }])
    const store = createMemoryPlaybackStore()
    const resolve = () => createResolver([registration], { region: 'US', store }).resolve(input, new AbortController().signal)
    expect((await resolve())?.qualitySources?.map(source => source.height).sort((a, b) => a! - b!)).toEqual([480, 720, 1080, 2160])
    await Promise.resolve()
    expect((await resolve())?.qualitySources?.map(source => source.height).sort((a, b) => a! - b!)).toEqual([480, 720, 1080, 2160])
  })
  it('excludes audio-only roles including prior cached video winners', async () => {
    const audio = provider('audio')
    const resolve = vi.spyOn(audio.adapter, 'resolve')
    const video = { ...provider('video'), role: 'both' as const }
    const resolver = createResolver([audio, video], { region: 'US' })
    expect((await resolver.resolve(input, new AbortController().signal))?.registration.adapter.id).toBe('audio')
    resolve.mockClear(); audio.role = 'audio'
    expect((await resolver.resolve(input, new AbortController().signal))?.registration.adapter.id).toBe('video')
    expect(resolve).not.toHaveBeenCalled()
    expect(await resolver.resolve(input, new AbortController().signal, [], 'audio')).toBeNull()
  })
  it('selects the requested resolution before a higher fixed rendition', async () => {
    const registration = provider('video')
    registration.adapter = createStaticProvider('video', [{ ref: input.ref, sources: [{ ...source, key: '1080', height: 1080 }, { ...source, key: '720', height: 720 }] }])
    const resolver = createResolver([registration], { region: 'US' })
    expect((await resolver.resolve({ ...input, preferences: { qualityHeight: 720 } }, new AbortController().signal))?.source.height).toBe(720)
    expect((await resolver.resolve({ ...input, preferences: { qualityHeight: 1080 } }, new AbortController().signal))?.source.height).toBe(1080)
  })
  it('prefers a matching language family over unspecified original audio', async () => {
    const registration = provider('video')
    registration.adapter = createStaticProvider('video', [{ ref: input.ref, sources: [{ ...source, key: 'original', language: 'original', height: 1080 }, { ...source, key: 'french', language: 'fra', height: 720 }] }])
    const resolver = createResolver([registration], { region: 'US' })
    expect((await resolver.resolve({ ...input, audioLanguage: 'fr-CA', preferences: { qualityHeight: 720 } }, new AbortController().signal))?.source.key).toBe('french')
  })
  it('skips a declared sub-only adapter without making upstream dub requests', async () => {
    const sub = { ...provider('sub'), mediaKinds: ['anime'] as const }
    sub.adapter = { ...sub.adapter, audioLanguages: ['ja'], resolve: vi.fn(async () => ({ ok: true as const, sources: [source] })) }
    const animeInput = { ...input, ref: { kind: 'anime' as const, id: 21, episode: 1 } }
    expect(await createResolver([sub], { region: 'US' }).resolve(animeInput, new AbortController().signal)).toBeNull()
    expect(sub.adapter.resolve).not.toHaveBeenCalled()
    expect(await createResolver([sub], { region: 'US' }).resolve({ ...animeInput, audioLanguage: 'ja' }, new AbortController().signal)).not.toBeNull()
  })
  it('rejects an original-audio source in the shared dub access cache', async () => {
    const store = createMemoryPlaybackStore()
    const get = store.get
    store.get = async key => key.startsWith('access:') ? JSON.stringify({ provider: 'dub', source }) : get(key)
    const dub = { ...provider('dub'), mediaKinds: ['anime'] as const }
    dub.adapter.resolve = vi.fn(async () => ({ ok: true as const, sources: [{ ...source, language: 'en' }] }))
    const animeInput = { ...input, ref: { kind: 'anime' as const, id: 21, episode: 1 } }
    const resolved = await createResolver([dub], { region: 'US', store }).resolve(animeInput, new AbortController().signal)
    expect(resolved?.source.language).toBe('en')
    expect(dub.adapter.resolve).toHaveBeenCalledOnce()
  })
  it('never substitutes original anime audio for a requested dub', async () => {
    const animeInput = { ...input, ref: { kind: 'anime' as const, id: 21, episode: 1 } }
    const sub = { ...provider('sub'), mediaKinds: ['anime'] as const }
    sub.adapter.resolve = vi.fn(async () => ({ ok: true as const, sources: [source] }))
    const dub = { ...provider('dub'), mediaKinds: ['anime'] as const }
    dub.adapter.resolve = vi.fn(async () => ({ ok: true as const, sources: [{ ...source, language: 'en' }] }))
    const resolved = await createResolver([sub, dub], { region: 'US' }).resolve(animeInput, new AbortController().signal)
    expect(resolved?.registration.adapter.id).toBe('dub')
    expect(resolved?.source.language).toBe('en')
    expect(await createResolver([sub], { region: 'US' }).resolve(animeInput, new AbortController().signal)).toBeNull()
  })
  it('cools a provider after repeated playback failures even when resolution keeps succeeding', async () => {
    let now = Date.now()
    const direct = provider('direct')
    const resolver = createResolver([direct], { region: 'US', now: () => now })
    const signal = new AbortController().signal
    for (let attempt = 0; attempt < 3; attempt++) {
      expect((await resolver.resolve(input, signal, [], undefined, true))?.registration.adapter.id).toBe('direct')
      resolver.recordFailure('direct', 'movie')
    }
    expect(resolver.status('movie').find((entry) => entry.id === 'direct')?.openUntil).toBeGreaterThan(now)
    expect(await resolver.resolve(input, signal, [], undefined, true)).toBeNull()
    now += 61_000
    expect((await resolver.resolve(input, signal, [], undefined, true))?.registration.adapter.id).toBe('direct')
  })
  it('cools definitive failures five times longer than transient stalls', async () => {
    let now = Date.now()
    const transient = createResolver([provider('transient')], { region: 'US', now: () => now })
    const definitive = createResolver([provider('definitive')], { region: 'US', now: () => now })
    for (let attempt = 0; attempt < 3; attempt++) {
      transient.recordFailure('transient', 'movie')
      definitive.recordFailure('definitive', 'movie', 'definitive')
    }
    const transientOpen = transient.status('movie').find((entry) => entry.id === 'transient')!.openUntil
    const definitiveOpen = definitive.status('movie').find((entry) => entry.id === 'definitive')!.openUntil
    expect(transientOpen - now).toBe(60_000)
    expect(definitiveOpen - now).toBe(300_000)
    now += 61_000
    // The transient cooler has recovered while the definitive one still demotes.
    expect(transient.status('movie').find((entry) => entry.id === 'transient')!.openUntil).toBeLessThanOrEqual(now)
    expect(definitive.status('movie').find((entry) => entry.id === 'definitive')!.openUntil).toBeGreaterThan(now)
  })
  it('treats gone-class and blocked-direct failures as definitive demotion signals', () => {
    expect(failureCause({ reason: 'unsupported' })).toBe('definitive')
    expect(failureCause({ reason: 'network', deliveryFailure: 'forbidden' })).toBe('definitive')
    expect(failureCause({ reason: 'network' })).toBe('transient')
    expect(failureCause({ reason: 'media' })).toBe('transient')
    expect(failureCause({ reason: 'expired' })).toBe('transient')
    expect(failureCause({ reason: 'network', deliveryFailure: 'segment' })).toBe('transient')
  })
  it('moves through several stalled providers within their attempt limits', async () => {
    vi.useFakeTimers()
    const directs = ['first', 'second', 'third'].map((id) => {
      const direct = provider(id)
      direct.adapter.resolve = vi.fn(() => new Promise<Awaited<ReturnType<typeof direct.adapter.resolve>>>(() => undefined))
      return direct
    })
    const task = createResolver(directs, { region: 'US', deadlineMs: 12000 }).resolve(input, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(9_100)
    expect(await task).toBeNull()
    for (const direct of directs) expect(direct.adapter.resolve).toHaveBeenCalledOnce()
  })
  it('uses an admin disable change without reusing the prior winner', async () => {
    const first = provider('first')
    const second = provider('second')
    const resolver = createResolver([first, second], { region: 'US' })
    const signal = new AbortController().signal
    expect((await resolver.resolve(input, signal))?.registration.adapter.id).toBe('first')
    first.enabled = false
    expect((await resolver.resolve(input, signal))?.registration.adapter.id).toBe('second')
  })
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
  it('never lets a movie provider answer an anime ref by numeric-id coincidence', async () => {
    const movieOnly = provider('movie-only')
    movieOnly.adapter.resolve = vi.fn(movieOnly.adapter.resolve)
    const animeOnly: ProviderRegistration = {
      ...provider('anime-only'),
      adapter: createStaticProvider('anime-only', [{ ref: { kind: 'anime', id: 793, episode: 1 }, sources: [source] }]),
      mediaKinds: ['anime'],
    }
    const animeInput = { ...input, ref: { kind: 'anime' as const, id: 793, episode: 1 }, audioLanguage: 'ja' }
    const resolved = await createResolver([movieOnly, animeOnly], { region: 'US' }).resolve(animeInput, new AbortController().signal)
    expect(resolved?.registration.adapter.id).toBe('anime-only')
    expect(movieOnly.adapter.resolve).not.toHaveBeenCalled()
    // And the reverse: an anime-only provider never answers movies.
    const movieInput = { ...input, ref: { kind: 'movie' as const, id: 1 } }
    const movieResolved = await createResolver([movieOnly, animeOnly], { region: 'US' }).resolve(movieInput, new AbortController().signal)
    expect(movieResolved?.registration.adapter.id).toBe('movie-only')
  })
  it('tries providers in static order, times out a stalled primary, and falls through to backup', async () => {
    vi.useFakeTimers()
    const first = provider('first'); const backup = provider('backup')
    let cancelled = false
    first.adapter.resolve = async (_input, signal) => new Promise(() => { signal.addEventListener('abort', () => { cancelled = true }) })
    const resolver = createResolver([first, backup], { region: 'US' })
    const task = resolver.resolve(input, new AbortController().signal)
    // The stalled first provider burns its bounded attempt window, is
    // cancelled, and the next provider in fixed order wins.
    await vi.advanceTimersByTimeAsync(5000)
    expect((await task)?.registration.adapter.id).toBe('backup')
    expect(cancelled).toBe(true)
  })
  it('cools a repeatedly stalled provider after its own attempt timeout', async () => {
    vi.useFakeTimers()
    const direct = provider('direct')
    direct.adapter.resolve = vi.fn(() => new Promise<Awaited<ReturnType<typeof direct.adapter.resolve>>>(() => undefined))
    const resolver = createResolver([direct], { region: 'US' })
    // A persistently hung source should not delay every new playback request.
    for (let round = 0; round < 3; round++) {
      const task = resolver.resolve(input, new AbortController().signal, [], undefined, true)
      await vi.advanceTimersByTimeAsync(6_000)
      expect(await task).toBeNull()
    }
    expect(resolver.status('movie').find((entry) => entry.id === 'direct')).toMatchObject({ failures: 3 })
    expect(resolver.status('movie').find((entry) => entry.id === 'direct')!.openUntil).toBeGreaterThan(Date.now())
    await expect(resolver.resolve(input, new AbortController().signal, [], undefined, true)).resolves.toBeNull()
    vi.advanceTimersByTime(61_000)
    // The circuit reopens to a healthy answer after cooling.
    direct.adapter.resolve = vi.fn(async () => ({ ok: true as const, sources: [source] }))
    await expect(resolver.resolve(input, new AbortController().signal, [], undefined, true)).resolves.toMatchObject({ registration: { adapter: { id: 'direct' } } })
  })
  it('prefers requested dubbed audio over an original-language source', async () => {
    const direct = provider('dubbed')
    direct.adapter.resolve = vi.fn(async () => ({ ok: true as const, sources: [source, { ...source, key: 'dub', language: 'en' }] }))
    const resolved = await createResolver([direct], { region: 'US' }).resolve(input, new AbortController().signal)
    expect(resolved?.source.key).toBe('dub')
  })
  it('does not reuse a cached source after its configured region is removed', async () => {
    const direct = provider('regional')
    const resolver = createResolver([direct], { region: 'US' })
    expect(await resolver.resolve(input, new AbortController().signal)).not.toBeNull()
    direct.approvedRegions = ['IT']
    expect(await resolver.resolve(input, new AbortController().signal)).toBeNull()
  })
  it('honors a custom per-provider attempt budget within the deadline', async () => {
    vi.useFakeTimers()
    const slow = provider('slow'); slow.attemptMs = 7000
    slow.adapter.resolve = vi.fn(async (_input, signal) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 6000)
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
      })
      return { ok: true as const, sources: [source] }
    })
    const task = createResolver([slow], { region: 'US', deadlineMs: 12000 }).resolve(input, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(6000)
    expect((await task)?.registration.adapter.id).toBe('slow')
    // The same 6s adapter with the default budget dies at 5s instead.
    const plain = provider('plain')
    plain.adapter.resolve = slow.adapter.resolve
    const missed = createResolver([plain], { region: 'US', deadlineMs: 12000 }).resolve(input, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(12000)
    expect(await missed).toBeNull()
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
    await vi.advanceTimersByTimeAsync(12000)
    expect(await task).toBeNull()
  })
  it('excludes correlated providers and disabled or out-of-region registrations', async () => {
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
  it('keeps static order and returns only the winning provider tracks', async () => {
    vi.useFakeTimers()
    const winner = provider('winner'); const companion = provider('companion')
    const track = { id: 'en', label: 'English', language: 'en', url: 'https://media.example/subs/en.vtt', format: 'vtt' as const }
    winner.adapter.resolve = () => new Promise((resolve) => setTimeout(() => resolve({ ok: true as const, sources: [source] }), 700))
    companion.adapter.resolve = () => new Promise((resolve) => setTimeout(() => resolve({ ok: true as const, sources: [{ ...source, key: 'backup', subtitles: [track] }] }), 150))
    const resolver = createResolver([winner, companion], { region: 'US' })
    const task = resolver.resolve(input, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(700)
    const resolved = await task
    // Static sequential resolution tries the first provider and stops at
    // the first success — the companion is never consulted, so only the
    // winner's (trackless) subtitles are returned and the server list stays
    // fixed instead of merging companion tracks.
    expect(resolved?.source.key).toBe('main')
    expect(resolved?.registration.adapter.id).toBe('winner')
    expect(resolved?.subtitles).toEqual([])
  })
  it('tries operator-pinned providers first in static order', async () => {
    const low = provider('low'); const high = provider('high')
    high.priority = 90
    const resolver = createResolver([low, high], { region: 'US' })
    expect((await resolver.resolve(input, new AbortController().signal))?.registration.adapter.id).toBe('high')
  })
  it('falls through to the next provider in fixed order when the first is empty', async () => {
    const first = provider('first'); const second = provider('second')
    first.adapter.resolve = vi.fn(async () => ({ ok: false as const, code: 'empty' as const, retryable: false }))
    const resolver = createResolver([first, second], { region: 'US' })
    const resolved = await resolver.resolve(input, new AbortController().signal)
    expect(resolved?.registration.adapter.id).toBe('second')
    expect(first.adapter.resolve).toHaveBeenCalledTimes(1)
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
  it('resolves configured providers directly through hostile-output validation', async () => {
    const registration = provider('direct')
    await expect(createResolver([registration], { region: 'US' }).resolve(input, new AbortController().signal)).resolves.toMatchObject({ source: { key: 'main' } })
  })
})
