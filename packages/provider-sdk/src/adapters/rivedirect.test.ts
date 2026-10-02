import { describe, expect, it, vi } from 'vitest'
import type { ProviderHttp } from './http.ts'
import { createRiveApolloProvider } from './rivedirect.ts'

const input = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const master = 'https://peraspera.nbsycfzrpa4.workers.dev/title/master.m3u8'

describe('Rive Apollo direct adapter', () => {
  it('resolves direct HLS with the partner Referer hint', async () => {
    const http = vi.fn<ProviderHttp>(async (url) => ({
      status: 200,
      text: JSON.stringify({ data: { sources: [{ url: master, quality: '1080p', format: 'hls' }] } }),
      url,
    }))
    const result = await createRiveApolloProvider(http, () => 1_800_000_000_000).resolve(input, new AbortController().signal)

    expect(http).toHaveBeenCalledWith(
      'https://scrapper.rivestream.app/api/provider?provider=apollo&id=550',
      expect.objectContaining({ accept: 'application/json' }),
      expect.any(AbortSignal),
    )
    expect(result).toMatchObject({ ok: true, sources: [{ url: master, type: 'hls', qualityHint: '1080p', headers: { referer: 'https://atlantic.st/' } }] })
  })

  it('keeps malformed and empty provider responses out of the source list', async () => {
    const unavailable = vi.fn<ProviderHttp>(async (url) => ({ status: 200, text: '<html>down</html>', url }))
    expect(await createRiveApolloProvider(unavailable).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })

    const empty = vi.fn<ProviderHttp>(async (url) => ({ status: 200, text: JSON.stringify({ data: { sources: [] } }), url }))
    expect(await createRiveApolloProvider(empty).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
})
