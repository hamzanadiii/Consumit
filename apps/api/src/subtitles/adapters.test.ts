import { createCipheriv } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { decodeNxshaPayload, encodeNxshaPayload } from '@consumit/provider-sdk'

import { createCastleSubsProvider } from './castlesubs.ts'
import type { SubtitleHttp } from './http.ts'
import { anizipEpisode } from './anizip.ts'
import { createAddic7edProvider } from './addic7ed.ts'
import { createAnimeToshoProvider } from './animetosho.ts'
import { createBanimeProvider } from './banime.ts'
import { createCineSrcProvider } from './cinesrc.ts'
import { createJimakuProvider } from './jimaku.ts'
import { createMeguAnimeProvider } from './meguanime.ts'
import { normTrackLang, normalizeTrackLanguage } from './lang.ts'
import { createNatsukiProvider, releaseTagRating } from './natsuki.ts'
import { createNxshaSubsProvider } from './nxshasubs.ts'
import { createRiveSubsProvider } from './rivesubs.ts'
import { createVdrkV2Provider } from './vdrkv2.ts'
import { createOpenSubtitlesProvider } from './opensubtitles.ts'
import { createSubDlProvider } from './subdl.ts'
import { createSubf2mProvider } from './subf2m.ts'
import { createSubSourceProvider } from './subsource.ts'
import { createTvSubtitlesProvider } from './tvsubtitles.ts'
import type { RawSubtitle } from './types.ts'
import { createVdrkProvider } from './vdrk.ts'
import { createYifyProvider } from './yify.ts'

function stubHttp(routes: { match: string; text: string; cookies?: string[] }[]): SubtitleHttp {
  const get = async (url: string) => {
    const route = routes.find((entry) => url.includes(entry.match))
    if (!route) throw new Error(`Unexpected GET ${url}`)
    return { text: route.text, cookies: route.cookies ?? [] }
  }
  return {
    get: get as SubtitleHttp['get'],
    post: (async () => {
      throw new Error('Unexpected POST')
    }) as SubtitleHttp['post'],
  }
}

const YIFY_PAGE = `<table>
<tr data-id="1"><td><span class="label">9</span></td><td><span class="sub-lang">English</span> YIFY-720p</a></td><td><a href="/subtitles/movie-man-english-yify-1">dl</a></td></tr>
<tr data-id="2"><td><span class="label">4</span></td><td><span class="sub-lang">French</span> release WEB-DL</a></td><td><a href="/subtitles/movie-man-french-yify-2">dl</a></td></tr>
</table>`

describe('yify', () => {
  const provider = createYifyProvider(stubHttp([{ match: 'movie-imdb', text: YIFY_PAGE, cookies: ['sess=abc'] }]))

  it('supports movies with an IMDb id only', () => {
    expect(provider.supports({ type: 'movie', imdbId: 'tt1234567' })).toBe(true)
    expect(provider.supports({ type: 'tv', imdbId: 'tt1234567' })).toBe(false)
    expect(provider.supports({ type: 'movie' })).toBe(false)
  })

  it('parses rows into gated zip candidates', async () => {
    const found = await provider.search({ type: 'movie', imdbId: 'tt1234567' }, new AbortController().signal)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'zip', provider: 'yify', needsExtract: true })
    expect(found[0]?.url).toBe('https://yifysubtitles.ch/subtitle/movie-man-english-yify-1.zip')
    expect(found[0]?.headers).toMatchObject({ Referer: expect.stringContaining('movie-imdb'), Cookie: 'sess=abc' })
  })
})

const TV_INDEX = `<a href="tvshow-42-7.html"><b>Example Show</b></a><a href="tvshow-9-2.html"><b>Other</b></a>`
const TV_SEASON = `<tr><td>1x01</td><td><a href="subtitle-11.html"><img alt="en"></a><a href="subtitle-12.html"><img alt="fr"></a></td></tr>`
const TV_SUBPAGE = `<a href="download-77.html">download</a>`
const TV_DLPAGE = `<script>var s1='https://cdn.example/';var s2='files/a.zip';</script>`

describe('tvsubtitles', () => {
  const provider = createTvSubtitlesProvider(stubHttp([
    { match: 'tvshows.html', text: TV_INDEX },
    { match: 'tvshow-42-1.html', text: TV_SEASON },
    { match: 'subtitle-11.html', text: TV_SUBPAGE },
    { match: 'subtitle-12.html', text: TV_SUBPAGE },
    { match: 'download-77.html', text: TV_DLPAGE },
  ]))

  it('supports TV and anime by title', () => {
    expect(provider.supports({ type: 'tv', title: 'Example Show' })).toBe(true)
    expect(provider.supports({ type: 'anime', title: 'Example Show' })).toBe(true)
    expect(provider.supports({ type: 'movie', title: 'Example Show' })).toBe(false)
  })

  it('resolves episode rows to zip candidates', async () => {
    const found = await provider.search({ type: 'tv', title: 'Example Show', season: 1, episode: 1 }, new AbortController().signal)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'zip', provider: 'tvsubtitles' })
    expect(found[0]?.url).toBe('https://cdn.example/files/a.zip')
  })
})

const SUB_LIST = `<a href="/subtitle/example-2024/english/100">YIFY 720p s01e02</a>
<a href="/subtitle/example-2024/french/101">YIFY 720p s01e02</a>`
const SUB_ENTRY = `<a href="https://api.subsource.net/v1/subtitle/download/${'a'.repeat(40)}">dl</a>`

describe('subsource', () => {
  const http = stubHttp([
    { match: '/subtitles/example-first-season', text: SUB_LIST },
    { match: '/subtitle/example-2024/english/100', text: SUB_ENTRY },
    { match: '/subtitle/example-2024/french/101', text: SUB_ENTRY },
  ])
  const provider = createSubSourceProvider(http)

  it('supports movies and TV with title and year, anime by title alone', () => {
    expect(provider.supports({ type: 'movie', title: 'Example', year: 2024 })).toBe(true)
    expect(provider.supports({ type: 'anime', title: 'Example' })).toBe(true)
    expect(provider.supports({ type: 'anime' })).toBe(false)
    expect(provider.supports({ type: 'movie', title: 'Example' })).toBe(false)
  })

  it('resolves entry pages to download zips', async () => {
    const found = await provider.search({ type: 'tv', title: 'Example', year: 2024, season: 1, episode: 2 }, new AbortController().signal)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'zip', provider: 'subsource' })
    expect(found[0]?.url).toContain('api.subsource.net')
  })

  it('answers anime queries on the TV slug path', async () => {
    const found = await provider.search({ type: 'anime', title: 'Example', episode: 2 }, new AbortController().signal)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'zip', provider: 'subsource' })
  })

  it('uses mapped TV numbering when the anime episode has a split-season mapping', async () => {
    const list = `<a href="/subtitle/example/english/100">Example S22E15 1080p</a><a href="/subtitle/example/english/101">Example S22E1100 1080p</a>`
    const mappedProvider = createSubSourceProvider(stubHttp([
      { match: '/subtitles/example-season', text: list },
      { match: '/subtitle/example/english/100', text: SUB_ENTRY },
      { match: '/subtitle/example/english/101', text: SUB_ENTRY },
    ]))
    const found = await mappedProvider.search({
      type: 'anime', title: 'Example', season: 22, episode: 15, absoluteEpisode: 1100,
    }, new AbortController().signal)
    expect(found).toHaveLength(1)
    expect(found[0]?.label).toContain('S22E15')
  })
})

function castleEncrypt(payload: unknown, securityKeyB64: string): string {
  const keyBytes = Buffer.from(securityKeyB64, 'base64')
  const suffix = Buffer.from('T!BgJB', 'utf8')
  const combined = Buffer.concat([keyBytes, suffix])
  const key = combined.length < 16 ? Buffer.concat([combined, Buffer.alloc(16 - combined.length, 0)]) : combined.subarray(0, 16)
  const cipher = createCipheriv('aes-128-cbc', key, key)
  return Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload), 'utf8')), cipher.final()]).toString('base64')
}

describe('castlesubs', () => {
  const secKey = Buffer.from('testkey12345678').toString('base64')
  const enc = (value: unknown) => castleEncrypt(value, secKey)
  const http: SubtitleHttp = {
    get: (async (url: string) => {
      if (url.includes('getSecurityKey')) return { text: JSON.stringify({ code: 200, data: secKey }), cookies: [] }
      if (url.includes('searchByKeyword')) return { text: enc({ data: { rows: [{ id: 7, title: 'Example' }] } }), cookies: [] }
      if (url.includes('/movie?')) {
        if (url.includes('movieId=7')) return { text: enc({ data: { seasons: [{ number: 1, movieId: 8 }], episodes: [] } }), cookies: [] }
        return { text: enc({ data: { episodes: [{ number: 2, id: 55, tracks: [{ languageId: '10', abbreviate: 'en' }] }] } }), cookies: [] }
      }
      throw new Error(`Unexpected GET ${url}`)
    }) as SubtitleHttp['get'],
    post: (async () => enc({ data: { subtitles: [
      { url: 'https://cdn.castle.example/sub123.vtt', title: 'English', abbreviate: 'en' },
      { url: 'https://cdn.castle.example/en.vtt', title: 'Albanian', abbreviate: '[ar] Albanian' },
      { url: 'https://cdn.castle.example/Arabic.vtt', title: 'Albanian', abbreviate: 'ar' },
      { url: 'https://cdn.castle.example/French.srt', title: 'Arabic', abbreviate: 'ar' },
    ] } })) as SubtitleHttp['post'],
  }
  const provider = createCastleSubsProvider(http)

  it('supports movies, TV, and anime by title', () => {
    expect(provider.supports({ type: 'movie', title: 'Example' })).toBe(true)
    expect(provider.supports({ type: 'anime', title: 'Example' })).toBe(true)
    expect(provider.supports({ type: 'anime' })).toBe(false)
  })

  it('harvests direct subtitle files through season resolution', async () => {
    const found = await provider.search({ type: 'tv', title: 'Example', year: 2024, season: 1, episode: 2 }, new AbortController().signal)
    expect(found).toHaveLength(4)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'vtt', provider: 'castlesubs' })
    expect(found[0]?.url).toBe('https://cdn.castle.example/sub123.vtt')
  })

  it('answers anime queries on the TV path', async () => {
    const found = await provider.search({ type: 'anime', title: 'Example', episode: 2 }, new AbortController().signal)
    expect(found).toHaveLength(4)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'vtt', provider: 'castlesubs' })
  })

  it('uses mapped TV numbering when the anime episode has a split-season mapping', async () => {
    const mappedHttp: SubtitleHttp = {
      get: (async (url: string) => {
        if (url.includes('getSecurityKey')) return { text: JSON.stringify({ code: 200, data: secKey }), cookies: [] }
        if (url.includes('searchByKeyword')) return { text: enc({ data: { rows: [{ id: 7, title: 'Example' }] } }), cookies: [] }
        if (url.includes('/movie?') && url.includes('movieId=7')) {
          return { text: enc({ data: { seasons: [{ number: 22, movieId: 8 }], episodes: [] } }), cookies: [] }
        }
        if (url.includes('/movie?') && url.includes('movieId=8')) {
          return { text: enc({ data: { episodes: [{ number: 15, id: 55, tracks: [{ languageId: '10', abbreviate: 'en' }] }] } }), cookies: [] }
        }
        throw new Error(`Unexpected GET ${url}`)
      }) as SubtitleHttp['get'],
      post: (async () => enc({ data: { subtitles: [{ url: 'https://cdn.castle.example/en.vtt', title: 'English', abbreviate: 'en' }] } })) as SubtitleHttp['post'],
    }
    const mappedProvider = createCastleSubsProvider(mappedHttp)
    const found = await mappedProvider.search({
      type: 'anime', title: 'Example', season: 22, episode: 15, absoluteEpisode: 1100,
    }, new AbortController().signal)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ lang: 'en', provider: 'castlesubs' })
  })

  it('trusts the file name over a mislabeled upstream language', async () => {
    const found = await provider.search({ type: 'tv', title: 'Example', year: 2024, season: 1, episode: 2 }, new AbortController().signal)
    const fixed = found.find((track) => track.url.endsWith('/en.vtt'))
    expect(fixed).toMatchObject({ lang: 'en', label: 'en' })
    expect(found.find((track) => track.url.endsWith('/Arabic.vtt'))).toMatchObject({ lang: 'ar', label: 'Arabic' })
    expect(found.find((track) => track.url.endsWith('/French.srt'))).toMatchObject({ lang: 'fr', label: 'French' })
  })
})

describe('vdrk', () => {
  const provider = createVdrkProvider(stubHttp([{ match: '/v1/movie/550', text: JSON.stringify([
    { file: 'https://cache.vdrk.site/a.vtt', label: 'English' },
    { file: 'https://cache.vdrk.site/b.vtt', label: 'Czech2' },
    { file: 'https://cache.vdrk.site/c.vtt', label: 'French hi' },
    { file: '', label: 'Broken' },
  ]) }]))

  it('supports TMDB-keyed movies and TV', () => {
    expect(provider.supports({ type: 'movie', tmdbId: 550 })).toBe(true)
    expect(provider.supports({ type: 'tv', tmdbId: 550, season: 1, episode: 2 })).toBe(true)
    expect(provider.supports({ type: 'anime', tmdbId: 37854, season: 1, episode: 1 })).toBe(true)
    expect(provider.supports({ type: 'anime', title: 'Naruto' })).toBe(false)
    expect(provider.supports({ type: 'movie' })).toBe(false)
  })

  it('normalizes labels and HI markers into direct VTT tracks', async () => {
    const found = await provider.search({ type: 'movie', tmdbId: 550 }, new AbortController().signal)
    expect(found).toHaveLength(3)
    expect(found[0]).toMatchObject({ lang: 'en', label: 'English', format: 'vtt', provider: 'vdrk' })
    expect(found[1]).toMatchObject({ lang: 'cs', label: 'Czech' })
    expect(found[2]).toMatchObject({ lang: 'fr', label: 'French [HI]', hi: true })
  })

  it('maps parenthesized VDRK labels to the base language', async () => {
    const regional = createVdrkProvider(stubHttp([{ match: '/v1/movie/551', text: JSON.stringify([
      { file: 'https://cache.vdrk.site/d.vtt', label: 'Spanish (LA)' },
      { file: 'https://cache.vdrk.site/e.vtt', label: 'Portuguese (BR)' },
    ]) }]))
    const found = await regional.search({ type: 'movie', tmdbId: 551 }, new AbortController().signal)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ lang: 'es' })
    expect(found[1]).toMatchObject({ lang: 'pt' })
  })
})

describe('subdl', () => {
  const http = stubHttp([{ match: '/subtitles?', text: JSON.stringify({
    status: true,
    subtitles: [
      { url: '/subtitle/1/en.srt', language: 'EN', name: 'WEB-DL', hi: false, release_name: 'Show.S01E01' },
      { language: 'FR', name: 'FR sub', hi: true, release_name: 'Show.S01E01', unpack_files: [
        { url: 'https://dl.subdl.com/subtitle/2/fr.srt', language: 'FR', name: 'FR', hi: false, season: 1, episode: 1 },
        { url: 'https://dl.subdl.com/subtitle/3/fr.srt', language: 'FR', name: 'FR', hi: false, season: 1, episode: 2 },
      ] },
    ],
  }) }])
  const provider = createSubDlProvider(http, 'test-key')

  it('declines without an API key', () => {
    expect(createSubDlProvider(http).supports({ type: 'movie', tmdbId: 1 })).toBe(false)
    expect(createSubDlProvider(http).supports({ type: 'anime', tmdbId: 1 })).toBe(false)
    expect(provider.supports({ type: 'movie', tmdbId: 1 })).toBe(true)
    expect(provider.supports({ type: 'anime', tmdbId: 1100, season: 1, episode: 1 })).toBe(true)
    expect(provider.supports({ type: 'anime', imdbId: 'tt1234567', season: 1, episode: 1 })).toBe(true)
    expect(provider.supports({ type: 'anime', anilistId: 21 })).toBe(false)
  })

  it('unpacks per-file subtitles and filters the episode', async () => {
    const found = await provider.search({ type: 'tv', tmdbId: 1100, season: 1, episode: 1 }, new AbortController().signal)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'srt', provider: 'subdl' })
    expect(found[0]?.url).toBe('https://dl.subdl.com/subtitle/1/en.srt')
    expect(found[1]).toMatchObject({ lang: 'fr' })
  })

  it('answers bridged anime queries as TV', async () => {
    const found = await provider.search({ type: 'anime', tmdbId: 1100, season: 1, episode: 1 }, new AbortController().signal)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'srt', provider: 'subdl' })
  })
})

describe('jimaku', () => {
  const http = stubHttp([{ match: '/entries/search', text: JSON.stringify([
    { id: 1, name: 'Show', files: [{ url: 'https://cdn.jimaku.example/e01.srt', name: '[Sub] Show - 01.srt' }, { url: 'https://cdn.jimaku.example/e02.srt', name: '[Sub] Show - 02.srt' }] },
  ]) }])
  const provider = createJimakuProvider(http, 'test-key')

  it('declines without a key or a non-anime query', () => {
    expect(createJimakuProvider(http).supports({ type: 'anime', anilistId: 21 })).toBe(false)
    expect(provider.supports({ type: 'anime', anilistId: 21 })).toBe(true)
    expect(provider.supports({ type: 'movie', tmdbId: 1 })).toBe(false)
  })

  it('prefers the requested episode file', async () => {
    const found = await provider.search({ type: 'anime', anilistId: 21, episode: 1 }, new AbortController().signal)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'srt', provider: 'jimaku' })
    expect(found[0]?.url).toContain('e01.srt')
  })
})

describe('opensubtitles', () => {
  const keys = { apiKey: 'key', user: 'user', pass: 'pass' }
  const http: SubtitleHttp = {
    get: (async (url: string) => {
      if (url.includes('/subtitles?')) {
        return { text: JSON.stringify({ data: [
          { attributes: { language: 'en', release: 'Show.S01E01', hearing_impaired: false, files: [{ file_id: 11, file_name: 'en.srt' }] } },
          { attributes: { language: 'fr', release: 'Show.S01E01', hearing_impaired: true, files: [{ file_id: 12, file_name: 'fr.srt' }] } },
        ] }), cookies: [] }
      }
      throw new Error(`Unexpected GET ${url}`)
    }) as SubtitleHttp['get'],
    post: (async (url: string) => {
      if (url.endsWith('/login')) return JSON.stringify({ token: 'tok' })
      if (url.endsWith('/download')) return JSON.stringify({ link: 'https://dl.os.example/f.srt' })
      throw new Error(`Unexpected POST ${url}`)
    }) as SubtitleHttp['post'],
  }
  const provider = createOpenSubtitlesProvider(http, keys)

  it('declines without credentials', () => {
    expect(createOpenSubtitlesProvider(http).supports({ type: 'movie', tmdbId: 1 })).toBe(false)
    expect(provider.supports({ type: 'movie', tmdbId: 1 })).toBe(true)
    expect(provider.supports({ type: 'anime', tmdbId: 1100, season: 1, episode: 1 })).toBe(true)
    expect(provider.supports({ type: 'anime', imdbId: 'tt1234567', season: 1, episode: 1 })).toBe(true)
    expect(provider.supports({ type: 'anime', anilistId: 1 })).toBe(false)
  })

  it('logs in and resolves download links', async () => {
    const found = await provider.search({ type: 'tv', tmdbId: 1100, season: 1, episode: 1 }, new AbortController().signal)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'srt', provider: 'opensubtitles' })
    expect(found[1]).toMatchObject({ lang: 'fr', hi: true })
  })

  it('answers bridged anime queries as TV', async () => {
    const found = await provider.search({ type: 'anime', tmdbId: 1100, season: 1, episode: 1 }, new AbortController().signal)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'srt', provider: 'opensubtitles' })
  })
})

describe('nxshasubs', () => {
  const payload = encodeNxshaPayload({ subtitles: [
    { uri: 'https://cdn.nxsha.example/en.srt', title: 'English', language: 'en', type: 'srt' },
    { uri: 'https://cdn.nxsha.example/fr.ass', title: 'French', language: 'fr', type: 'ass' },
    { uri: 'https://cdn.nxsha.example/pt.srt', title: 'Legenda', language: 'Brazilian Portuguese', type: 'srt' },
  ] })
  const decodedCheck = decodeNxshaPayload(payload) as { subtitles: unknown[] }
  if (decodedCheck.subtitles.length !== 3) throw new Error('Nxsha envelope fixture broken.')
  const provider = createNxshaSubsProvider(stubHttp([{ match: '/api/subtitles', text: JSON.stringify({ _hash: payload }) }]))

  it('supports TMDB-keyed movies and TV', () => {
    expect(provider.supports({ type: 'movie', tmdbId: 1 })).toBe(true)
    expect(provider.supports({ type: 'anime', tmdbId: 37854, season: 1, episode: 1 })).toBe(true)
    expect(provider.supports({ type: 'anime', title: 'Naruto' })).toBe(false)
    expect(provider.supports({ type: 'movie' })).toBe(false)
  })

  it('parses direct subtitle URIs with formats', async () => {
    const found: RawSubtitle[] = await provider.search({ type: 'movie', tmdbId: 1 }, new AbortController().signal)
    expect(found).toHaveLength(3)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'srt', provider: 'nxshasubs' })
    expect(found[1]).toMatchObject({ lang: 'fr', format: 'ass' })
  })

  it('normalizes full language names to codes', async () => {
    const found: RawSubtitle[] = await provider.search({ type: 'movie', tmdbId: 1 }, new AbortController().signal)
    expect(found[2]).toMatchObject({ lang: 'pt' })
  })
})

describe('vdrkv2', () => {
  const provider = createVdrkV2Provider(stubHttp([{ match: '/v2/movie/550', text: JSON.stringify([
    { file: 'https://cache.vdrk.site/a2.vtt', label: 'Arabic' },
    { file: 'https://cache.vdrk.site/b2.srt', label: 'Spanish hi' },
    { file: '', label: 'Broken' },
  ]) }]))

  it('supports TMDB-keyed movies and TV', () => {
    expect(provider.supports({ type: 'movie', tmdbId: 550 })).toBe(true)
    expect(provider.supports({ type: 'tv', tmdbId: 550, season: 1, episode: 2 })).toBe(true)
    expect(provider.supports({ type: 'anime', tmdbId: 37854, season: 1, episode: 1 })).toBe(true)
    expect(provider.supports({ type: 'anime', title: 'Naruto' })).toBe(false)
    expect(provider.supports({ type: 'movie' })).toBe(false)
  })

  it('queries the v2 endpoint and normalizes entries', async () => {
    const found = await provider.search({ type: 'movie', tmdbId: 550 }, new AbortController().signal)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ lang: 'ar', label: 'Arabic', format: 'vtt', provider: 'vdrkv2' })
    expect(found[1]).toMatchObject({ lang: 'es', label: 'Spanish [HI]', format: 'srt', hi: true })
  })
})

describe('rivesubs', () => {
  const provider = createRiveSubsProvider(stubHttp([
    { match: 'provider=flowcast', text: JSON.stringify({ data: { captions: [
      { file: 'https://cdn.example/flow-ar.srt', label: 'اَلْعَرَبِيَّةُ - FlowCast' },
      { file: 'https://cdn.example/flow-en.srt', label: 'English - FlowCast' },
    ] } }) },
    { match: 'provider=citadel', text: JSON.stringify({ data: { captions: [
      { file: 'https://cdn.example/flow-en.srt', label: 'English - Citadel' },
      { file: 'https://cdn.example/cit-fr.vtt', label: 'French - Citadel' },
    ] } }) },
    { match: 'provider=apex', text: JSON.stringify({ data: { sources: [] } }) },
  ]))

  it('supports TMDB-keyed movies and TV', () => {
    expect(provider.supports({ type: 'movie', tmdbId: 550 })).toBe(true)
    expect(provider.supports({ type: 'tv', tmdbId: 550, season: 1, episode: 2 })).toBe(true)
    expect(provider.supports({ type: 'anime', tmdbId: 37854, season: 1, episode: 1 })).toBe(true)
    expect(provider.supports({ type: 'movie' })).toBe(false)
  })

  it('fans out to flowcast/citadel/apex with script detection and dedupe', async () => {
    const found = await provider.search({ type: 'movie', tmdbId: 550 }, new AbortController().signal)
    expect(found).toHaveLength(3)
    expect(found[0]).toMatchObject({ lang: 'ar', format: 'srt', provider: 'rivesubs' })
    expect(found[1]).toMatchObject({ lang: 'en' })
    expect(found[2]).toMatchObject({ lang: 'fr', format: 'vtt' })
  })
  it('deduplicates signed copies of one file while retaining distinct files and correct native languages', async () => {
    const signed = (signature: string) => `https://cdn.example/ar.srt?Policy=fixture&Signature=${signature}&Key-Pair-Id=fixture`
    const captions = [
      { file: signed('one'), label: 'اَلْعَرَبِيَّةُ - FlowCast' },
      { file: signed('two'), label: 'اَلْعَرَبِيَّةُ - Citadel' },
      { file: 'https://cdn.example/ar-alternate.srt', label: 'اَلْعَرَبِيَّةُ - Apex' },
      { file: 'https://cdn.example/ur.srt', label: 'اُردُو - FlowCast' },
      { file: 'https://cdn.example/fr.srt', label: 'Français - FlowCast' },
      { file: 'https://cdn.example/bn.srt', label: 'বাংলা - FlowCast' },
    ]
    const selected = createRiveSubsProvider(stubHttp([{ match: 'provider=', text: JSON.stringify({ data: { captions } }) }]))
    const found = await selected.search({ type: 'movie', tmdbId: 550 }, new AbortController().signal)
    expect(found).toHaveLength(5)
    expect(found.filter((track) => track.lang === 'ar')).toHaveLength(2)
    expect(found.find((track) => track.label === 'اُردُو')?.lang).toBe('ur')
    expect(found.find((track) => track.label === 'Français')?.lang).toBe('fr')
    expect(found.find((track) => track.label === 'বাংলা')?.lang).toBe('bn')
    expect(found[0]?.url).toBe(signed('one'))
  })
})

describe('natsuki', () => {
  const provider = createNatsukiProvider(stubHttp([{ match: '/subs?tmdbId=550', text: JSON.stringify({ subtitles: [
    { sid: 1, language: 'English', langCode: 'en', url: 'https://files.example/en.srt', fileName: 'Fight.Club.1080p.BluRay.srt' },
    { sid: 2, language: 'Arabic', langCode: 'ar', url: 'https://files.example/ar.srt', fileName: 'cam.srt' },
    { sid: 3, language: 'French', langCode: 'fr', url: '', fileName: 'fr.srt' },
  ] }) }]), async () => ({ 'X-S-Sid': 'fixture', 'X-S-Ts': '1', 'X-S-Nonce': 'fixture', 'X-S-Sig': 'fixture' }))

  it('supports TMDB-keyed movies and TV', () => {
    expect(provider.supports({ type: 'movie', tmdbId: 550 })).toBe(true)
    expect(provider.supports({ type: 'tv', tmdbId: 550, season: 1, episode: 2 })).toBe(true)
    expect(provider.supports({ type: 'anime', tmdbId: 37854, season: 1, episode: 1 })).toBe(true)
    expect(provider.supports({ type: 'movie' })).toBe(false)
  })

  it('signs file URLs, filters preferred langs, and rates releases', async () => {
    const found = await provider.search({ type: 'movie', tmdbId: 550, langs: ['en', 'ar'] }, new AbortController().signal)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'srt', provider: 'natsuki', rating: 4 })
    expect(found[0]?.url).toContain('natsuki.hls.lol')
    expect(found[0]?.headers).toMatchObject({ Referer: 'https://atlantic.st/' })
    expect(found[1]).toMatchObject({ lang: 'ar', rating: -1 })
  })

  it('rates scene releases above cams', () => {
    expect(releaseTagRating('Movie.2160p.WEB-DL.srt')).toBe(4)
    expect(releaseTagRating('Movie.TELESYNC.srt')).toBe(-1)
    expect(releaseTagRating('subs.srt')).toBe(0)
  })
})

describe('normTrackLang', () => {
  it.each([
    ['فارسی', 'fa'], ['اُردُو', 'ur'], ['עברית', 'he'], ['বাংলা', 'bn'],
    ['Українська', 'uk'], ['Български', 'bg'], ['Српски', 'sr'],
    ['தமிழ்', 'ta'], ['తెలుగు', 'te'], ['한국어', 'ko'], ['Türkçe', 'tr'],
  ])('recognizes the native language %s without guessing from its shared script', (name, code) => {
    expect(normTrackLang(`${name} - FlowCast`)).toBe(code)
  })
  it('detects native-script labels instead of defaulting to English', () => {
    expect(normTrackLang('اَلْعَرَبِيَّةُ - FlowCast')).toBe('ar')
    expect(normTrackLang('English - Citadel')).toBe('en')
    expect(normTrackLang('French')).toBe('fr')
    expect(normTrackLang('日本語字幕こんにちは')).toBe('ja')
  })
})

describe('normalizeTrackLanguage', () => {
  it('uses a known display label when a streaming track has no language metadata', () => {
    expect(normalizeTrackLanguage('und', 'English - Citadel')).toBe('en')
    expect(normalizeTrackLanguage('zxx', 'العربية')).toBe('ar')
  })
  it('keeps provider language metadata authoritative and does not guess English', () => {
    expect(normalizeTrackLanguage('fr', 'English')).toBe('fr')
    expect(normalizeTrackLanguage('und', 'Commentary')).toBe('und')
  })
})

describe('anizip', () => {
  const payload = {
    mappings: { anilist_id: 21, mal_id: 21, themoviedb_id: 37854, imdb_id: 'tt0388629' },
    episodes: {
      '1': { anidbEid: 440, seasonNumber: 1, episodeNumber: 1 },
      '21': { anidbEid: 460, seasonNumber: 1, episodeNumber: 21 },
    },
  }

  it('extracts tmdb, anidb, and tvdb season/episode for a canonical episode', () => {
    expect(anizipEpisode(payload, 1)).toEqual({ tmdbId: 37854, imdbId: 'tt0388629', anidbEid: 440, season: 1, episode: 1 })
    expect(anizipEpisode(payload, 21)).toMatchObject({ anidbEid: 460, season: 1, episode: 21 })
  })

  it('falls back to season 1 plus the canonical number without an entry', () => {
    expect(anizipEpisode({ mappings: { themoviedb_id: 1 }, episodes: {} }, 7)).toEqual({ tmdbId: 1, season: 1, episode: 7 })
  })

  it('returns null when nothing maps', () => {
    expect(anizipEpisode({ mappings: {}, episodes: {} }, 1)).toBeNull()
    expect(anizipEpisode(null, 1)).toBeNull()
  })
})

describe('animetosho', () => {
  const provider = createAnimeToshoProvider(stubHttp([
    { match: 'mappings?anilist_id=21', text: JSON.stringify({
      mappings: { anilist_id: 21, themoviedb_id: 37854 },
      episodes: { '1': { anidbEid: 440, seasonNumber: 1, episodeNumber: 1 } },
    }) },
    { match: 'feed/json?eid=440', text: JSON.stringify([
      { id: 111, status: 'complete', timestamp: 200, title: '[Group] Show - 01 [1080p]' },
      { id: 110, status: 'skipped', timestamp: 300, title: '[Group] Show - 01 [480p]' },
    ]) },
    { match: 'show=torrent&id=111', text: JSON.stringify({ attachments: [
      { id: 1, type: 'subtitle', size: 10, url: 'https://storage.animetosho.net/releases/111/subtitles/track3.eng.ass.xz', info: { format: 'ASS', language: 'English', language_code: 'eng', default: true } },
      { id: 2, type: 'subtitle', size: 9, url: 'https://storage.animetosho.net/releases/111/subtitles/track2.spa.ass', info: { format: 'ASS', language: 'Latin American', language_code: 'spa' } },
      { id: 3, type: 'other', size: 1, url: 'https://storage.animetosho.net/releases/111/subtitles/attachments.7z', info: { format: 'ARCHIVE' } },
    ] }) },
  ]))

  it('supports anime by AniList id only', () => {
    expect(provider.supports({ type: 'anime', anilistId: 21 })).toBe(true)
    expect(provider.supports({ type: 'anime', title: 'Show' })).toBe(false)
    expect(provider.supports({ type: 'tv', tmdbId: 1 })).toBe(false)
  })

  it('resolves the episode through ani.zip and lists plain files first', async () => {
    const found = await provider.search({ type: 'anime', anilistId: 21, episode: 1, langs: ['en', 'es'] }, new AbortController().signal)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ lang: 'es', format: 'ass', provider: 'animetosho' })
    expect(found[0]?.url).toContain('track2.spa.ass')
    expect(found[1]).toMatchObject({ lang: 'en', format: 'ass', rating: 2 })
  })

  it('returns nothing when the episode has no AniDB mapping', async () => {
    const unmapped = createAnimeToshoProvider(stubHttp([
      { match: 'mappings?anilist_id=9', text: JSON.stringify({ mappings: {}, episodes: {} }) },
    ]))
    await expect(unmapped.search({ type: 'anime', anilistId: 9, episode: 1 }, new AbortController().signal)).resolves.toEqual([])
  })

  it('reuses the shared AniDB episode mapping instead of downloading AniZip again', async () => {
    const shared = createAnimeToshoProvider(stubHttp([{ match: 'feed/json?eid=278201', text: '[]' }]))
    await expect(shared.search({
      type: 'anime', anilistId: 21, episode: 1, absoluteEpisode: 1100, anidbEid: 278201,
    }, new AbortController().signal)).resolves.toEqual([])
  })
})

describe('cinesrc', () => {
  const posts: { url: string; body: string }[] = []
  const http: SubtitleHttp = {
    get: (async () => {
      throw new Error('Unexpected GET')
    }) as SubtitleHttp['get'],
    post: (async (url: string, body: string) => {
      posts.push({ url, body })
      return JSON.stringify({ subtitles: [
        { url: 'https://subs.bright67.online/c/a', language: 'English', display: 'English', format: 'srt' },
        { url: 'https://subs.bright67.online/c/a', language: 'English', format: 'srt' },
        { url: 'https://subs.bright67.online/c/b', language: 'Portuguese', display: 'Portuguese', format: 'ssa' },
        { url: 'https://subs.bright67.online/c/c', language: 'German', format: 'sub' },
        { url: 'https://subs.bright67.online/c/d', language: 'French', format: 'txt' },
      ] })
    }) as SubtitleHttp['post'],
  }
  const provider = createCineSrcProvider(http)
  const signal = () => new AbortController().signal

  it('supports TMDB-keyed queries only', () => {
    expect(provider.supports({ type: 'movie', tmdbId: 550 })).toBe(true)
    expect(provider.supports({ type: 'tv', tmdbId: 1396, season: 1, episode: 1 })).toBe(true)
    expect(provider.supports({ type: 'movie', title: 'Fight Club', imdbId: 'tt0137523' })).toBe(false)
  })

  it('posts TV coordinates and keeps convertible formats only', async () => {
    const found = await provider.search({ type: 'tv', tmdbId: 1396, season: 2, episode: 3 }, signal())
    expect(posts[0]?.url).toBe('https://cinesrc.st/api/subtitles/search')
    expect(JSON.parse(posts[0]!.body)).toMatchObject({ tmdbId: '1396', season: '2', episode: '3', builtInSubtitles: [] })
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'srt', provider: 'cinesrc' })
    expect(found[0]?.headers).toMatchObject({ Referer: 'https://cinesrc.st/', Origin: 'https://cinesrc.st' })
    expect(found[1]).toMatchObject({ lang: 'pt', format: 'ass' })
  })

  it('omits season/episode for movies and honors preferred languages', async () => {
    posts.length = 0
    const found = await provider.search({ type: 'movie', tmdbId: 550, langs: ['en'] }, signal())
    expect(JSON.parse(posts[0]!.body)).toEqual({ tmdbId: '550', builtInSubtitles: [] })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ lang: 'en' })
  })
})

describe('meguanime', () => {
  const TRACKS = { tracks: [
    { file: 'https://cdn.meguanime.com/p?u=one', label: 'English', kind: 'sub' },
    { file: 'https://cdn2.meguanime.com/p?u=two', label: 'Portuguese (- Portugues(Brasil))', kind: 'sub' },
    { file: 'https://cdn.meguanime.com/p?u=three', label: 'Bahasa Indonesia', kind: 'sub' },
    { file: 'https://cdn.meguanime.com/thumbs', label: 'thumb', kind: 'thumbnails' },
  ] }
  const urls: string[] = []
  const http: SubtitleHttp = {
    get: (async (url: string) => {
      urls.push(url)
      if (url.includes('/api/miruro')) throw new Error('Subtitle page HTTP 500.')
      return { text: JSON.stringify(TRACKS), cookies: [] }
    }) as SubtitleHttp['get'],
    post: (async () => {
      throw new Error('Unexpected POST')
    }) as SubtitleHttp['post'],
  }
  const provider = createMeguAnimeProvider(http)
  const signal = () => new AbortController().signal

  it('supports anime by AniList id only', () => {
    expect(provider.supports({ type: 'anime', anilistId: 21 })).toBe(true)
    expect(provider.supports({ type: 'anime', title: 'Show' })).toBe(false)
    expect(provider.supports({ type: 'tv', tmdbId: 1 })).toBe(false)
  })

  it('falls back from miruro to zoko with cleaned language labels', async () => {
    urls.length = 0
    const found = await provider.search({ type: 'anime', anilistId: 21, absoluteEpisode: 1100 }, signal())
    expect(urls[0]).toBe('https://meguanime.com/api/miruro?al=21&ep=1100&lang=sub')
    expect(urls[1]).toBe('https://meguanime.com/api/zoko?al=21&ep=1100&lang=sub')
    expect(found).toHaveLength(3)
    expect(found.map((entry) => entry.lang)).toEqual(['en', 'pt', 'id'])
    expect(found.every((entry) => entry.format === 'vtt' && entry.provider === 'meguanimesubs')).toBe(true)
  })

  it('drops tracks outside the preferred languages', async () => {
    const found = await provider.search({ type: 'anime', anilistId: 21, episode: 1, langs: ['pt'] }, signal())
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ lang: 'pt' })
  })

  it('returns nothing without an AniList id', async () => {
    await expect(provider.search({ type: 'anime', title: 'Show', episode: 1 }, signal())).resolves.toEqual([])
  })
})

describe('subf2m', () => {
  const FILLER = `<p>${'x'.repeat(600)}</p>`
  const page = (items: string) => `<html><body>${FILLER}<ul>${items}</ul></body></html>`
  const item = (lang: string, release: string, href: string) =>
    `<li class='item'><span class='language ${lang.toLowerCase()}'>${lang}</span><div><ul><li>${release}</li></ul></div><a class='download' href='${href}'>download</a></li>`
  const signal = () => new AbortController().signal

  it('supports movies, TV and anime by title', () => {
    const provider = createSubf2mProvider(stubHttp([]))
    expect(provider.supports({ type: 'movie', title: 'Fight Club' })).toBe(true)
    expect(provider.supports({ type: 'tv', title: 'Show' })).toBe(true)
    expect(provider.supports({ type: 'anime', title: 'Show' })).toBe(true)
    expect(provider.supports({ type: 'movie' })).toBe(false)
  })

  it('parses movie items into gated zip downloads', async () => {
    const provider = createSubf2mProvider(stubHttp([
      { match: '/subtitles/fight-club', text: page(
        item('English', 'Fight Club 1080p BluRay', '/subtitles/fight-club/english/17') +
        item('French', 'Fight Club FRENCH', '/subtitles/fight-club/french/18'),
      ) },
    ]))
    const found = await provider.search({ type: 'movie', title: 'Fight Club' }, signal())
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({
      url: 'https://subf2m.co/subtitles/fight-club/english/17/download',
      lang: 'en', format: 'zip', provider: 'subf2m', needsExtract: true,
      label: 'Fight Club 1080p BluRay',
    })
    expect(found[0]?.headers).toEqual({ Referer: 'https://subf2m.co/subtitles/fight-club/english/17' })
    expect(found[1]).toMatchObject({ lang: 'fr' })
  })

  it('keeps only the requested TV episode but retains season-wide packs', async () => {
    const provider = createSubf2mProvider(stubHttp([
      { match: '/subtitles/example-show-season-1', text: page(
        item('English', 'Example Show S01E02 Second', '/subtitles/example-show/english/21') +
        item('English', 'Example Show S01E01 Pilot', '/subtitles/example-show/english/20') +
        item('Spanish', 'Example Show S01E01 Pilot', '/subtitles/example-show/spanish/22') +
        item('French', 'Some Batch Without Tags', '/subtitles/example-show/french/23'),
      ) },
    ]))
    const found = await provider.search({ type: 'tv', title: 'Example Show', season: 1, episode: 1 }, signal())
    expect(found.map((entry) => entry.lang)).toEqual(['en', 'es', 'fr'])
    expect(found[0]?.label).toBe('Example Show S01E01 Pilot')
  })

  it('falls back to the bare slug when the season slug misses', async () => {
    // stubHttp matches by substring, so the season URL would hit the bare
    // route; this stub 404s every -season- path to exercise the fallback.
    const provider = createSubf2mProvider({
      get: (async (url: string) => {
        if (url.includes('-season-')) throw new Error('Subtitle page HTTP 404.')
        return { text: page(item('English', 'Other Show S01E01 Pilot', '/subtitles/other-show/english/1')), cookies: [] }
      }) as SubtitleHttp['get'],
      post: (async () => {
        throw new Error('Unexpected POST')
      }) as SubtitleHttp['post'],
    })
    const found = await provider.search({ type: 'tv', title: 'Other Show', season: 1, episode: 1 }, signal())
    expect(found).toHaveLength(1)
    expect(found[0]?.url).toBe('https://subf2m.co/subtitles/other-show/english/1/download')
  })

  it('falls back to the ordinal season slug when the digit slug misses', async () => {
    const urls: string[] = []
    const provider = createSubf2mProvider({
      get: (async (url: string) => {
        urls.push(url)
        if (url.includes('-second-season')) {
          return { text: page(item('English', 'Other Show S02E03 Third', '/subtitles/other-show/english/9')), cookies: [] }
        }
        if (url.includes('-season-')) throw new Error('Subtitle page HTTP 404.')
        throw new Error(`Unexpected GET ${url}`)
      }) as SubtitleHttp['get'],
      post: (async () => {
        throw new Error('Unexpected POST')
      }) as SubtitleHttp['post'],
    })
    const found = await provider.search({ type: 'tv', title: 'Other Show', season: 2, episode: 3 }, signal())
    expect(found).toHaveLength(1)
    expect(found[0]?.label).toBe('Other Show S02E03 Third')
    expect(urls).toEqual([
      'https://subf2m.co/subtitles/other-show-season-2',
      'https://subf2m.co/subtitles/other-show-second-season',
    ])
  })
})

describe('addic7ed', () => {
  const FILLER = `<p>${'x'.repeat(700)}</p>`
  const movieSearch = `<html><body><table>
<tr><td class="newsDate">12 Mar 2026</td><td>Version: WEB-DL 720p</td><td title="Hearing Impaired">HI</td><td><span class="language">English</span></td><td><a href="/original/85082/0">Download</a></td></tr>
</table>${FILLER}<table>
<tr><td class="newsDate">1 Mar 2026</td><td>Version: BDRip</td><td><span class="language">French</span></td><td><a href="/original/85083/0">Download</a></td></tr>
</table></body></html>`
  const showSearch = `<html><body>${FILLER}<a href="/show/42">Example Show</a><a href="/show/99">Other Show</a></body></html>`
  const tvRow = (season: number, ep: number, title: string, lang: string, path: string) =>
    `<tr class="epeven"><td>${season}</td><td>${ep}</td><td><a href="/serie/example-show/${season}/${ep}">${title}</a></td><td>${lang}</td><td class="c">WEB-DL</td><td>CC</td><td><a href="${path}">Download</a></td></tr>`
  const ajax = `<table>${tvRow(1, 1, 'Pilot', 'English', '/updated/1/99/0')}${tvRow(1, 1, 'Pilot', 'French', '/updated/2/98/0')}${tvRow(1, 2, 'Second', 'English', '/updated/3/97/0')}${tvRow(2, 1, 'Other', 'English', '/updated/4/96/0')}</table>`
  const signal = () => new AbortController().signal

  it('supports movies and TV by title', () => {
    const provider = createAddic7edProvider(stubHttp([]))
    expect(provider.supports({ type: 'movie', title: 'Fight Club' })).toBe(true)
    expect(provider.supports({ type: 'tv', title: 'Show' })).toBe(true)
    expect(provider.supports({ type: 'anime', title: 'Show' })).toBe(false)
  })

  it('parses movie rows with release and hearing-impaired flags', async () => {
    const provider = createAddic7edProvider(stubHttp([{ match: 'search.php', text: movieSearch }]))
    const found = await provider.search({ type: 'movie', title: 'Fight Club' }, signal())
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({
      url: 'https://www.addic7ed.com/original/85082/0',
      lang: 'en', format: 'srt', provider: 'addic7ed', hi: true, release: 'WEB-DL 720p',
      label: 'WEB-DL 720p [HI]',
    })
    expect(found[0]?.headers).toEqual({ Referer: 'https://www.addic7ed.com/' })
    expect(found[1]).toMatchObject({ lang: 'fr', hi: false, release: 'BDRip' })
  })

  it('honors preferred languages on movie rows', async () => {
    const provider = createAddic7edProvider(stubHttp([{ match: 'search.php', text: movieSearch }]))
    const found = await provider.search({ type: 'movie', title: 'Fight Club', langs: ['en'] }, signal())
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ lang: 'en' })
  })

  it('loads the show season over ajax and filters to one episode', async () => {
    const provider = createAddic7edProvider(stubHttp([
      { match: 'search.php', text: showSearch },
      { match: 'ajax_loadShow.php', text: ajax },
    ]))
    const found = await provider.search({ type: 'tv', title: 'Example Show', season: 1, episode: 1 }, signal())
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({
      url: 'https://www.addic7ed.com/updated/1/99/0',
      lang: 'en', label: 'S01E01 Pilot WEB-DL', release: 'S01E01 Pilot',
    })
    expect(found[0]?.headers).toEqual({ Referer: 'https://www.addic7ed.com/show/42' })
    expect(found[1]).toMatchObject({ lang: 'fr' })
  })

  it('drops rows from other seasons', async () => {
    const provider = createAddic7edProvider(stubHttp([
      { match: 'search.php', text: showSearch },
      { match: 'ajax_loadShow.php', text: ajax },
    ]))
    const found = await provider.search({ type: 'tv', title: 'Example Show', season: 2, episode: 1 }, signal())
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ label: 'S02E01 Other WEB-DL', release: 'S02E01 Other' })
  })

  // The real search page embeds the latest-season table plus a hidden
  // showID input — the page's /show/ links are only sidebar noise.
  const showSearchWithId = `<html><body>${FILLER}
<input type="hidden" name="showID" value="240"/><input type="hidden" name="season" value="5"/>
<table>${tvRow(5, 1, 'Backhand', 'English', '/updated/9/90/0')}${tvRow(5, 1, 'Backhand', 'French', '/updated/8/91/0')}</table>
</body></html>`

  function captureHttp(handlers: ((url: string) => { text: string } | null)[]) {
    const urls: string[] = []
    const http: SubtitleHttp = {
      get: (async (url: string) => {
        urls.push(url)
        for (const handler of handlers) {
          const hit = handler(url)
          if (hit) return { text: hit.text, cookies: [] }
        }
        throw new Error(`Unexpected GET ${url}`)
      }) as SubtitleHttp['get'],
      post: (async () => {
        throw new Error('Unexpected POST')
      }) as SubtitleHttp['post'],
    }
    return { urls, http }
  }

  it('answers from the embedded season table without an ajax round trip', async () => {
    const { urls, http } = captureHttp([(url) => (url.includes('search.php') ? { text: showSearchWithId } : null)])
    const provider = createAddic7edProvider(http)
    const found = await provider.search({ type: 'tv', title: 'Breaking Bad', season: 5, episode: 1 }, signal())
    expect(urls).toEqual(['https://www.addic7ed.com/search.php?search=Breaking%20Bad'])
    expect(found.map((entry) => entry.lang)).toEqual(['en', 'fr'])
    expect(found[0]?.headers).toEqual({ Referer: 'https://www.addic7ed.com/search.php?search=Breaking%20Bad' })
  })

  it('keys other seasons through the hidden showID input', async () => {
    const { urls, http } = captureHttp([
      (url) => (url.includes('search.php') ? { text: showSearchWithId } : null),
      (url) => (url.includes('ajax_loadShow.php') ? { text: ajax } : null),
    ])
    const provider = createAddic7edProvider(http)
    const found = await provider.search({ type: 'tv', title: 'Breaking Bad', season: 1, episode: 1 }, signal())
    expect(urls).toEqual([
      'https://www.addic7ed.com/search.php?search=Breaking%20Bad',
      'https://www.addic7ed.com/ajax_loadShow.php?show=240&season=1&langs=&hd=&hi=',
    ])
    expect(found).toHaveLength(2)
    expect(found[0]?.headers).toEqual({ Referer: 'https://www.addic7ed.com/show/240' })
  })

  it('refuses a wrong show when the search page only has sidebar links', async () => {
    const { urls, http } = captureHttp([(url) => (url.includes('search.php') ? { text: showSearch } : null)])
    const provider = createAddic7edProvider(http)
    const found = await provider.search({ type: 'tv', title: 'Never Mined', season: 1, episode: 1 }, signal())
    expect(found).toEqual([])
    expect(urls).toHaveLength(1)
  })
})

describe('banime', () => {
  const vtt = (cues: number) =>
    'WEBVTT\n\n' + Array.from({ length: cues }, (_, i) => `00:00:0${i % 10}.000 --> 00:00:0${i % 10}.500\ncue ${i}\n\n`).join('')
  const stub = (os: string, ank: string) => {
    const urls: string[] = []
    const http: SubtitleHttp = {
      get: (async (url: string) => {
        urls.push(url)
        return { text: url.includes('/api/os/') ? os : ank, cookies: [] }
      }) as SubtitleHttp['get'],
      post: (async () => {
        throw new Error('Unexpected POST')
      }) as SubtitleHttp['post'],
    }
    return { urls, provider: createBanimeProvider(http) }
  }
  const signal = () => new AbortController().signal

  it('supports anime by title only', () => {
    const { provider } = stub('', '')
    expect(provider.supports({ type: 'anime', title: 'Steins;Gate' })).toBe(true)
    expect(provider.supports({ type: 'tv', title: 'Steins;Gate', tmdbId: 1 })).toBe(false)
    expect(provider.supports({ type: 'anime' })).toBe(false)
  })

  it('returns both backends keyed by the canonical episode', async () => {
    const { urls, provider } = stub(vtt(10), vtt(12))
    const found = await provider.search({ type: 'anime', title: 'Steins;Gate', absoluteEpisode: 1100, episode: 3 }, signal())
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ lang: 'en', format: 'vtt', provider: 'banimesubs', label: 'English (OS)' })
    expect(found[1]).toMatchObject({ label: 'English (alt)' })
    expect(urls[0]).toBe('https://banime.dedyn.io/api/os/sub?title=Steins%3BGate&ep=1100&lang=en')
    expect(urls[1]).toBe('https://banime.dedyn.io/api/ank/sub?title=Steins%3BGate&ep=1100&lang=en')
  })

  it('rejects a backend whose cue count has not filled yet', async () => {
    const { provider } = stub('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\npending\n', vtt(11))
    const found = await provider.search({ type: 'anime', title: 'Show', episode: 1 }, signal())
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ label: 'English (alt)' })
  })
})
