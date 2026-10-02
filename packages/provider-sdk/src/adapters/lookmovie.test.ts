import { describe, expect, it, vi } from 'vitest'
import type { ProviderHttp } from './http.ts'
import { createLookmovieProvider } from './lookmovie.ts'

const input = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const metadata = vi.fn(async () => ({ title: 'Fight Club', year: 1999 }))

describe('Lookmovie direct adapter', () => {
  it('selects the matching movie and returns bounded HTTPS media and subtitle candidates', async () => {
    const http = vi.fn<ProviderHttp>(async (url) => url.includes('/v1/movies?')
      ? {
          status: 200,
          text: JSON.stringify({ items: [
            { id_movie: 'wrong-year', title: 'Fight Club', year: 2000 },
            { id_movie: 'fight-club', title: 'Fight Club', year: 1999 },
          ] }),
          url,
        }
      : {
          status: 200,
          text: JSON.stringify({
            streams: {
              '1080p': 'https://cdn.example/movie/1080.m3u8?expires=1800001000',
              '720p': 'https://cdn.example/movie/720.m3u8?expires=1800001000',
              '480p': 'javascript:alert(1)',
            },
            subtitles: [
              { url: 'https://subs.example/en.vtt', language: 'English' },
              { url: 'javascript:alert(1)', language: 'Bad URL' },
            ],
          }),
          url,
        })

    const result = await createLookmovieProvider(http, metadata, () => 1_800_000_000_000)
      .resolve(input, new AbortController().signal)

    expect(result).toMatchObject({
      ok: true,
      sources: [
        { url: 'https://cdn.example/movie/1080.m3u8?expires=1800001000', type: 'hls', height: 1080, subtitles: [{ language: 'English', url: 'https://subs.example/en.vtt', format: 'vtt' }] },
        { url: 'https://cdn.example/movie/720.m3u8?expires=1800001000', type: 'hls', height: 720 },
      ],
    })
    expect(http).toHaveBeenCalledTimes(2)
    expect(http).toHaveBeenNthCalledWith(1,
      'https://lmscript.xyz/v1/movies?filters[q]=Fight%20Club',
      expect.objectContaining({ accept: 'application/json' }),
      expect.any(AbortSignal),
    )
    expect(http).toHaveBeenNthCalledWith(2,
      'https://lmscript.xyz/v1/movies/view?expand=streams,subtitles&id=fight-club',
      expect.any(Object),
      expect.any(AbortSignal),
    )
  })

  it('rejects unsupported kinds and movies without a matching year/title result', async () => {
    const http = vi.fn<ProviderHttp>(async (url) => ({
      status: 200,
      text: JSON.stringify({ items: [{ id_movie: 12, title: 'Fight Club', year: 2000 }] }),
      url,
    }))
    const provider = createLookmovieProvider(http, metadata)

    expect(await provider.resolve({ ...input, ref: { kind: 'series', id: 550, season: 1, episode: 1 } }, new AbortController().signal))
      .toMatchObject({ ok: false, code: 'empty' })
    expect(await provider.resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).toHaveBeenCalledTimes(1)
  })
})
