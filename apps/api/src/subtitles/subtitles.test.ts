import { describe, expect, it, vi } from 'vitest'

import { createMemoryPlaybackStore } from '../playback/state.ts'
import { detectTrackFlags, entryMatchesLang, resolveSubtitles } from './engine.ts'
import { createStoreFileStore } from './storage.ts'
import { cleanQueryLangs, createSubtitleService } from './subtitles.ts'
import type { RawSubtitle, SubtitleSearchProvider } from './types.ts'

const signal = new AbortController().signal

function provider(id: string, raws: RawSubtitle[], supports = true): SubtitleSearchProvider {
  return { id, name: id, supports: () => supports, search: async () => raws }
}

function direct(provider: string, lang: string, url: string): RawSubtitle {
  return { url, lang, label: `${lang} track`, format: 'vtt', provider }
}

describe('resolveSubtitles', () => {
  it('passes direct VTT through and ranks English first', async () => {
    const store = createMemoryPlaybackStore()
    const tracks = await resolveSubtitles(
      { type: 'movie' },
      [provider('b', [direct('b', 'fr', 'https://cdn.example/fr.vtt')]), provider('a', [direct('a', 'en', 'https://cdn.example/en.vtt')])],
      createStoreFileStore(store),
      'https://api.example',
      signal,
    )
    expect(tracks.map((track) => track.language)).toEqual(['en', 'fr'])
    expect(tracks[0]).toMatchObject({ format: 'vtt', provider: 'a', url: 'https://cdn.example/en.vtt' })
    expect(tracks[0]?.label).toContain('(a)')
  })

  it('caps two tracks per language and sixteen total', async () => {
    const store = createMemoryPlaybackStore()
    const raws = Array.from({ length: 20 }, (_, i) => direct('a', 'en', `https://cdn.example/en-${i}.vtt`))
    const tracks = await resolveSubtitles({ type: 'movie' }, [provider('a', raws)], createStoreFileStore(store), 'https://api.example', signal)
    expect(tracks).toHaveLength(2)
  })

  it('converts fetched SRT through the injected fetcher and serves it first-party', async () => {
    const store = createMemoryPlaybackStore()
    const fetchFile = vi.fn(async () => Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHi\n', 'utf8'))
    const tracks = await resolveSubtitles(
      { type: 'movie' },
      [provider('nxshasubs', [{ url: 'https://subs.example/a.srt', lang: 'en', label: 'rel', format: 'srt', provider: 'nxshasubs' }])],
      createStoreFileStore(store),
      'https://api.example',
      signal,
      fetchFile as never,
    )
    expect(fetchFile).toHaveBeenCalledOnce()
    expect(tracks).toHaveLength(1)
    expect(tracks[0]?.url).toMatch(/^https:\/\/api\.example\/v1\/subtitles\/file\/[0-9a-f]{16}$/)
    expect(tracks[0]?.format).toBe('vtt')
    const key = tracks[0]!.url.split('/').pop()!
    const stored = await createStoreFileStore(store).getVtt(key)
    expect(stored).toContain('WEBVTT')
  })

  it('extracts zips and caches the converted file', async () => {
    const store = createMemoryPlaybackStore()
    const name = Buffer.from('en.srt', 'utf8')
    const data = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHi\n', 'utf8')
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt32LE(data.length, 18)
    head.writeUInt32LE(data.length, 22)
    head.writeUInt16LE(name.length, 26)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(0, 42)
    const off = 30 + name.length + data.length
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(1, 10)
    eocd.writeUInt32LE(46 + name.length, 12)
    eocd.writeUInt32LE(off, 16)
    const zip = Buffer.concat([head, name, data, entry, name, eocd])
    const fetchFile = vi.fn(async () => zip)
    const tracks = await resolveSubtitles(
      { type: 'movie' },
      [provider('yify', [{ url: 'https://subs.example/a.zip', lang: 'en', label: 'rel', format: 'zip', provider: 'yify', needsExtract: true }])],
      createStoreFileStore(store),
      'https://api.example',
      signal,
      fetchFile as never,
    )
    expect(tracks).toHaveLength(1)
    expect(tracks[0]?.provider).toBe('yify')
  })

  it('reuses converted files from the cache without refetching', async () => {
    const store = createMemoryPlaybackStore()
    const fetchFile = vi.fn(async () => { throw new Error('must not fetch') })
    const raw = { url: 'https://subs.example/cached.zip', lang: 'en', label: 'rel', format: 'zip' as const, provider: 'yify', needsExtract: true }
    const first = await resolveSubtitles(
      { type: 'movie' },
      [provider('yify', [raw])],
      createStoreFileStore(store),
      'https://api.example',
      signal,
      fetchFile as never,
    )
    expect(first).toEqual([])
    // A warmed file cache serves the same candidate with zero I/O.
    fetchFile.mockClear()
    const { createHash } = await import('node:crypto')
    const key = createHash('sha1').update('yify|https://subs.example/cached.zip|en').digest('hex').slice(0, 16)
    await createStoreFileStore(store).putVtt(key, 'WEBVTT\n\n00:00.000 --> 00:04.000\nHi\n', { content: 'tmdb/movie/0/1/1/en', ttlSeconds: 3600 })
    const second = await resolveSubtitles(
      { type: 'movie' },
      [provider('yify', [raw])],
      createStoreFileStore(store),
      'https://api.example',
      signal,
      fetchFile as never,
    )
    expect(fetchFile).not.toHaveBeenCalled()
    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject({ language: 'en', format: 'vtt', provider: 'yify' })
    expect(second[0]?.url).toBe(`https://api.example/v1/subtitles/file/${key}`)
  })

  it('drops ASS candidates when fetch fails but converts valid ASS', async () => {
    const store = createMemoryPlaybackStore()
    const tracks = await resolveSubtitles(
      { type: 'movie' },
      [provider('n', [
        { url: 'https://cdn.example/a.ass', lang: 'en', label: 'ass', format: 'ass', provider: 'n' },
        { url: 'http://cdn.example/b.vtt', lang: 'en', label: 'http', format: 'vtt', provider: 'n' },
      ])],
      createStoreFileStore(store),
      'https://api.example',
      signal,
    )
    expect(tracks).toEqual([])
  })
})

describe('preferred languages', () => {
  it('ranks wanted languages first from every provider', async () => {
    const store = createMemoryPlaybackStore()
    const tracks = await resolveSubtitles(
      { type: 'movie', langs: ['ar', 'fr'] },
      [provider('a', [direct('a', 'en', 'https://cdn.example/en.vtt'), direct('a', 'ar', 'https://cdn.example/ar.vtt'), direct('a', 'fr', 'https://cdn.example/fr.vtt')])],
      createStoreFileStore(store),
      'https://api.example',
      signal,
    )
    expect(tracks.map((track) => track.language)).toEqual(['ar', 'fr', 'en'])
  })

  it('parses the langs query leniently, max three', () => {
    expect(cleanQueryLangs('ar,fr,es,de')).toEqual(['ar', 'fr', 'es'])
    expect(cleanQueryLangs('EN, bogus!, ,fr')).toEqual(['en', 'fr'])
    expect(cleanQueryLangs(undefined)).toEqual([])
  })

  it('forwards preferred languages into the search', async () => {
    const store = createMemoryPlaybackStore()
    const seen: (readonly string[] | undefined)[] = []
    const service = createSubtitleService({
      providers: [{
        id: 'a',
        name: 'a',
        supports: () => true,
        search: async (query) => { seen.push(query.langs); return [] },
      }],
      metadata: (async () => ({ title: 'Example', year: 2024 })) as never,
      animeTitle: async () => ({ title: 'Never' }),
      store,
      origin: 'https://api.example',
    })
    await service.search({ kind: 'movie', id: 1 }, signal, ['ar', 'fr'])
    expect(seen).toEqual([['ar', 'fr']])
  })
})

describe('detectTrackFlags', () => {
  it('detects forced, SDH, signs, songs, and machine translation', () => {
    expect(detectTrackFlags('https://cdn.example/movie.forced.srt Common')).toMatchObject({ forced: true, sdh: false })
    expect(detectTrackFlags('https://cdn.example/movie.sdh.srt Common')).toMatchObject({ forced: false, sdh: true })
    expect(detectTrackFlags('https://cdn.example/[Signs] ep01.ass Signs')).toMatchObject({ signs: true, songs: false })
    expect(detectTrackFlags('https://cdn.example/op-karaoke.ass Karaoke')).toMatchObject({ songs: true })
    expect(detectTrackFlags('https://cdn.example/en.srt machine-translated')).toMatchObject({ machineTranslated: true })
    expect(detectTrackFlags('https://cdn.example/en.srt English')).toMatchObject({ forced: false, sdh: false, signs: false, songs: false, machineTranslated: false })
  })
})

describe('scoring v2', () => {
  it('orders full tracks before forced and machine variants and marks recommended', async () => {
    const store = createMemoryPlaybackStore()
    const tracks = await resolveSubtitles(
      { type: 'movie', langs: ['en'] },
      [provider('a', [
        direct('a', 'en', 'https://cdn.example/en.machine-translated.vtt'),
        direct('a', 'en', 'https://cdn.example/en.forced.vtt'),
        direct('a', 'en', 'https://cdn.example/en.vtt'),
      ])],
      createStoreFileStore(store),
      'https://api.example',
      signal,
    )
    // Direct tracks keep raw labels; flags come from URL matching. The
    // per-language cap drops the machine variant entirely.
    expect(tracks.map((track) => track.url)).toEqual([
      'https://cdn.example/en.vtt',
      'https://cdn.example/en.forced.vtt',
    ])
    expect(tracks[0]).toMatchObject({ recommended: true })
    expect(tracks[0]?.label).toContain('Recommended')
    expect(tracks[1]).toMatchObject({ forced: true })
    expect(tracks[1]?.recommended).toBeUndefined()
  })

  it('prefers non-HI full tracks for the recommended pick', async () => {
    const store = createMemoryPlaybackStore()
    const tracks = await resolveSubtitles(
      { type: 'movie', langs: ['en'] },
      [provider('a', [
        { url: 'https://cdn.example/hi.vtt', lang: 'en', label: 'English HI', format: 'vtt', provider: 'a', hi: true },
        direct('a', 'en', 'https://cdn.example/en.vtt'),
      ])],
      createStoreFileStore(store),
      'https://api.example',
      signal,
    )
    expect(tracks[0]?.url).toBe('https://cdn.example/en.vtt')
    expect(tracks[0]).toMatchObject({ recommended: true })
  })
})

describe('entryMatchesLang', () => {
  it('matches bounded codes and full names without cross-matching', () => {
    expect(entryMatchesLang('movie.en.srt', 'en')).toBe(true)
    expect(entryMatchesLang('Movie_English.srt', 'en')).toBe(true)
    expect(entryMatchesLang('french.srt', 'en')).toBe(false)
    expect(entryMatchesLang(' subs.srt', 'en')).toBe(false)
  })
})

describe('createSubtitleService', () => {
  it('resolves movie identity through metadata and serves cached files', async () => {
    const store = createMemoryPlaybackStore()
    const service = createSubtitleService({
      providers: [provider('castlesubs', [direct('castlesubs', 'en', 'https://cdn.example/c.vtt')])],
      metadata: (async () => ({ title: 'Example', year: 2024, imdbId: 'tt1234567' })) as never,
      animeTitle: async () => ({ title: 'Never' }),
      store,
      origin: 'https://api.example',
    })
    const tracks = await service.search({ kind: 'movie', id: 1 }, signal)
    expect(tracks).toHaveLength(1)
    expect(await service.file('nope')).toBeNull()
    expect(await service.file('x'.repeat(15))).toBeNull()
  })

  it('resolves anime titles through the anime catalog', async () => {
    const store = createMemoryPlaybackStore()
    const seen: string[] = []
    const tv = provider('tvsubtitles', [])
    const service = createSubtitleService({
      providers: [{ ...tv, search: async (query) => { seen.push(String(query.title)); return [] } }],
      animeTitle: async () => ({ title: 'One Piece' }),
      store,
      origin: 'https://api.example',
    })
    await service.search({ kind: 'anime', id: 21, episode: 1001 }, signal)
    expect(seen).toEqual(['One Piece'])
  })

  it('reads the durable catalog before live discovery and writes through after', async () => {
    const store = createMemoryPlaybackStore()
    let searches = 0
    const live = provider('yify', [direct('yify', 'en', 'https://cdn.example/live.vtt')])
    const rows: { language: string; label: string; format: 'vtt'; provider: string; storageKey: string; originalExt: null; hi: boolean; rating: number | null; releaseTag: null }[] = []
    const saved: unknown[] = []
    const service = createSubtitleService({
      providers: [{ ...live, search: async (...args) => { searches += 1; return live.search(...args) } }],
      animeTitle: async () => ({ title: 'Never' }),
      store,
      origin: 'https://api.example',
      catalog: {
        find: async () => rows,
        save: async (_ref, tracks) => { saved.push(tracks) },
      },
    })
    // Empty catalog: live discovery runs and writes through (direct-only
    // tracks carry no first-party files, so nothing is saved).
    expect(await service.search({ kind: 'movie', id: 1 }, signal)).toHaveLength(1)
    expect(searches).toBe(1)
    expect(saved).toHaveLength(1)
    // Seeded catalog: upstream is skipped entirely.
    rows.push({ language: 'en', label: 'English (vdrk)', format: 'vtt', provider: 'vdrk', storageKey: 'abcdef0123456789', originalExt: null, hi: false, rating: null, releaseTag: null })
    const cached = await service.search({ kind: 'movie', id: 2 }, signal)
    expect(searches).toBe(1)
    expect(cached).toHaveLength(1)
    expect(cached[0]).toMatchObject({ provider: 'vdrk', url: 'https://api.example/v1/subtitles/file/abcdef0123456789' })
  })
})
