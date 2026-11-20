import { describe, expect, it, vi } from 'vitest'
import { createNontonflixProvider, type ProviderHttp } from '../index.ts'

const signal = () => new AbortController().signal

describe('NontonFlix candidate adapter', () => {
  it('reports the production challenge response without imitating a browser or retaining cookies', async () => {
    const http = vi.fn<ProviderHttp>(async (url) => ({
      status: 403,
      url,
      text: 'Cloudflare challenge',
    }))

    const result = await createNontonflixProvider(http).resolve(
      { ref: { kind: 'movie', id: 550 }, region: 'US', audioLanguage: 'en' },
      signal(),
    )

    expect(result).toMatchObject({ ok: false, code: 'unavailable', retryable: true })
    expect(http).toHaveBeenCalledTimes(1)
    expect(http.mock.calls[0]?.[0]).toBe('https://nontonflix.com/')
    expect(http.mock.calls[0]?.[1]).toEqual({ accept: 'text/html' })
  })

  it('does not treat a reachable homepage as a playable source without an approved session route', async () => {
    const http = vi.fn<ProviderHttp>(async (url) => ({ status: 200, url, text: '<html>home</html>' }))

    const result = await createNontonflixProvider(http).resolve(
      { ref: { kind: 'series', id: 1396, season: 1, episode: 1 }, region: 'US', audioLanguage: 'en' },
      signal(),
    )

    expect(result).toMatchObject({ ok: false, code: 'unavailable', retryable: true })
    expect(http).toHaveBeenCalledTimes(1)
  })

  it('does not probe unsupported anime references', async () => {
    const http = vi.fn<ProviderHttp>()

    const result = await createNontonflixProvider(http).resolve(
      { ref: { kind: 'anime', id: 21, episode: 1 }, region: 'US', audioLanguage: 'en' },
      signal(),
    )

    expect(result).toMatchObject({ ok: false, code: 'empty', retryable: false })
    expect(http).not.toHaveBeenCalled()
  })
})
