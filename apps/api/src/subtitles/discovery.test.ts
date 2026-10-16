import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryPlaybackStore } from '../playback/state.ts'
import { createSubtitleDiscovery } from './discovery.ts'
import { createStoreFileStore } from './storage.ts'
import type { RawSubtitle, SubtitleSearchProvider } from './types.ts'
import type { CatalogTrack, SubtitleCatalog } from './catalog.ts'

const ref = { kind: 'movie' as const, id: 550 }
const signal = new AbortController().signal
const raw = (provider: string, language: string, index: number): RawSubtitle => ({
  provider, lang: language, label: `${language} release ${index}`, format: 'srt',
  url: `https://subs.example/${provider}/${language}/${index}.srt`,
})
const provider = (id: string, search: SubtitleSearchProvider['search'], supports = true): SubtitleSearchProvider => ({ id, name: id, supports: () => supports, search })

function fixture(providers: SubtitleSearchProvider[]) {
  const store = createMemoryPlaybackStore()
  const files = createStoreFileStore(store)
  const discovery = createSubtitleDiscovery({ providers, store, files, origin: 'https://api.example', query: async () => ({ type: 'movie', tmdbId: 550 }) })
  return { discovery, store, files }
}

describe('subtitle discovery', () => {
  it('continues a large roster without losing late providers and replays a batch without duplicate searches', async () => {
    const searches = Array.from({ length: 29 }, (_, index) => vi.fn(async () => [raw(`p${index}`, index === 28 ? 'pt-BR' : 'en', index)]))
    const { discovery } = fixture(searches.map((search, index) => provider(`p${index}`, search)))
    const first = await Array.fromAsync(discovery.discover(ref, signal))
    let cursor = first.at(-1)!.nextCursor!
    const id = first[0]!.searchId
    expect(searches.filter(search => search.mock.calls.length)).toHaveLength(12)
    const second = await Array.fromAsync(discovery.discover(ref, signal, cursor))
    expect(await Array.fromAsync(discovery.discover(ref, signal, cursor))).toEqual(second)
    cursor = second.at(-1)!.nextCursor!
    await Array.fromAsync(discovery.discover(ref, signal, cursor))
    expect(searches.every(search => search.mock.calls.length === 1)).toBe(true)
    expect((await discovery.page(id, 'pt-br'))?.tracks).toHaveLength(1)
    await expect(Array.fromAsync(discovery.discover({ kind: 'movie', id: 999 }, signal, cursor))).rejects.toThrow('Search subtitles again')
  })
  it('does not add the saved subtitle again when a fresh discovery finds its upstream candidate', async () => {
    const selected = raw('one', 'ar', 1)
    const rows: CatalogTrack[] = []
    const catalog: SubtitleCatalog = {
      find: async () => rows,
      save: async (_ref, tracks) => {
        for (const track of tracks) rows.push({ ...track, originalExt: null, hi: false, rating: null, releaseTag: null })
      },
    }
    const { store, files } = fixture([])
    const providers = [provider('one', async () => [selected])]
    const query = async () => ({ type: 'movie' as const, tmdbId: 550 })
    const first = createSubtitleDiscovery({ providers, store, files, catalog, origin: 'https://api.example', query })
    let searchId = ''
    for await (const event of first.discover(ref, signal)) searchId = event.searchId
    const storageKey = createHash('sha1').update(`one|${selected.url}|ar`).digest('hex').slice(0, 16)
    await files.putVtt(storageKey, 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n', { content: 'tmdb/movie/550/1/1/ar', ttlSeconds: 3600 })
    const track = await first.prepare(searchId, (await first.page(searchId, 'ar'))!.tracks[0]!.id, signal)
    expect(track).not.toBeNull()
    expect(rows).toHaveLength(1)
    // A later browser session can outlive the discovery cache but keep the
    // durable subtitle file and catalog row.
    const fresh = createSubtitleDiscovery({ providers, store: createMemoryPlaybackStore(), files, catalog, origin: 'https://api.example', query })
    for await (const event of fresh.discover(ref, signal)) searchId = event.searchId
    const page = await fresh.page(searchId, 'ar')
    expect(page?.total).toBe(1)
    expect(page?.tracks[0]?.preparedUrl).toBe(track!.url)
    expect((await fresh.search(searchId, 'ar'))?.total).toBe(1)
  })
  it('keeps one candidate and one file when a provider rotates its signed download URL', async () => {
    let signature = 'first'
    const identityUrl = 'https://subs.example/arabic.srt'
    const { store, files } = fixture([])
    const discovery = createSubtitleDiscovery({
      providers: [provider('one', async () => [{ ...raw('one', 'ar', 1), url: `${identityUrl}?Signature=${signature}`, identityUrl }])],
      store, files, origin: 'https://api.example', query: async () => ({ type: 'movie', tmdbId: 550 }),
    })
    let searchId = ''
    for await (const event of discovery.discover(ref, signal)) searchId = event.searchId
    const firstId = (await discovery.page(searchId, 'ar'))!.tracks[0]!.id
    const storageKey = createHash('sha1').update(`one|${identityUrl}|ar`).digest('hex').slice(0, 16)
    await files.putVtt(storageKey, 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n', { content: 'fixture', ttlSeconds: 3600 })
    const prepared = await discovery.prepare(searchId, firstId, signal)
    signature = 'second'
    for await (const event of discovery.discover(ref, signal)) searchId = event.searchId
    expect(await discovery.page(searchId, 'ar')).toMatchObject({ total: 1, tracks: [{ id: firstId, preparedUrl: prepared!.url }] })
    const snapshot = JSON.parse((await store.get(`subtitle:discovery:${searchId}`))!)
    expect(snapshot.candidates[0].raw.url).toBe(`${identityUrl}?Signature=second`)
    expect(await discovery.prepare(searchId, firstId, signal)).toEqual(prepared)
  })
  it('rejects candidates outside a declared provider file scope at intake', async () => {
    const scoped: SubtitleSearchProvider = {
      ...provider('one', async () => [raw('one', 'en', 1), { ...raw('one', 'fr', 2), url: 'https://evil.example/fr.srt' }]),
      fileHosts: ['subs.example'],
    }
    const { discovery } = fixture([scoped])
    const events = await Array.fromAsync(discovery.discover(ref, signal))
    const outcome = events.find((event) => event.type === 'provider')
    if (outcome?.type !== 'provider') throw new Error('missing provider event')
    expect(outcome.provider).toMatchObject({ id: 'one', found: 1, failure: 'parse' })
    const searchId = events[0]!.searchId
    expect((await discovery.page(searchId, 'en'))?.total).toBe(1)
    expect((await discovery.page(searchId, 'fr'))?.total).toBe(0)
  })
  it('emits cached snapshot first, then independent provider outcomes and all language counts', async () => {
    let finishSlow!: (raws: RawSubtitle[]) => void
    const slow = new Promise<RawSubtitle[]>((resolve) => { finishSlow = resolve })
    const providers = [
      provider('a', async () => Array.from({ length: 27 }, (_, i) => raw('a', 'en', i))),
      provider('b', async () => [raw('b', 'ar', 1), raw('b', 'fr', 1)]),
      provider('c', async () => { throw new Error('upstream unavailable') }),
      provider('d', async () => [], false),
      provider('e', async () => slow),
      ...Array.from({ length: 7 }, (_, i) => provider(`empty-${i}`, async () => [])),
    ]
    const { discovery } = fixture(providers)
    const iterator = discovery.discover(ref, signal)
    const first = await iterator.next()
    expect(first.value).toMatchObject({ type: 'snapshot', languages: [] })
    const events = []
    for (let i = 0; i < 11; i++) events.push((await iterator.next()).value)
    expect(events.some((event) => event?.provider?.state === 'failed')).toBe(true)
    expect(events.some((event) => event?.provider?.state === 'skipped')).toBe(true)
    expect(events.some((event) => event?.languages?.some((language: { code: string; count: number }) => language.code === 'en' && language.count === 27))).toBe(true)
    finishSlow([])
    const rest = [await iterator.next(), await iterator.next()]
    expect(rest.at(-1)?.value?.type).toBe('complete')
    const searchId = first.value!.searchId
    expect(await discovery.page(searchId, 'en')).toMatchObject({ total: 27, nextCursor: 20 })
    expect(await discovery.page(searchId, 'en', 20)).toMatchObject({ total: 27, nextCursor: null })
    expect((await discovery.page(searchId, 'en', 20))?.tracks).toHaveLength(7)
    expect((await discovery.page(searchId, 'ar'))?.total).toBe(1)
  })

  it('prepares only a selected candidate and never exposes its raw URL in a page', async () => {
    const selected = raw('one', 'en', 1)
    const { discovery, files } = fixture([provider('one', async () => [selected])])
    let searchId = ''
    for await (const event of discovery.discover(ref, signal)) searchId = event.searchId
    const page = await discovery.page(searchId, 'en')
    expect(page?.tracks[0]).not.toHaveProperty('url')
    expect(JSON.stringify(page)).not.toContain(selected.url)
    const key = createHash('sha1').update(`one|${selected.url}|en`).digest('hex').slice(0, 16)
    await files.putVtt(key, 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n', { content: 'tmdb/movie/550/1/1/en', ttlSeconds: 3600 })
    const track = await discovery.prepare(searchId, page!.tracks[0]!.id, signal)
    expect(track?.url).toBe(`https://api.example/v1/subtitles/file/${key}`)
  })

  it('deduplicates repeated candidate URLs and rejects malformed upstream entries', async () => {
    const valid = raw('one', 'fr', 1)
    const { discovery } = fixture([provider('one', async () => [valid, valid, { ...valid, url: 'http://127.0.0.1/internal' }, { ...valid, lang: 'invalid' }])])
    let searchId = ''
    for await (const event of discovery.discover(ref, signal)) searchId = event.searchId
    expect((await discovery.page(searchId, 'fr'))?.total).toBe(1)
  })

  it('finishes with a timeout status when one provider never answers', async () => {
    vi.useFakeTimers()
    try {
      const never = new Promise<RawSubtitle[]>(() => {})
      const { discovery } = fixture([provider('slow', async () => never), provider('healthy', async () => [raw('healthy', 'ar', 1)])])
      const iterator = discovery.discover(ref, signal)
      expect((await iterator.next()).value?.type).toBe('snapshot')
      const healthy = await iterator.next()
      expect(healthy.value?.languages).toEqual([{ code: 'ar', count: 1 }])
      const timeout = iterator.next()
      await vi.advanceTimersByTimeAsync(8500)
      expect((await timeout).value?.provider?.state).toBe('timeout')
      expect((await iterator.next()).value?.type).toBe('complete')
    } finally { vi.useRealTimers() }
  })
})
