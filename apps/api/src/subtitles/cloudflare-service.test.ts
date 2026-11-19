import { expect, it, vi } from 'vitest'
import { createCloudflareSubtitleService } from './cloudflare-service.ts'

it('dispatches canonical movie references without provider downloads or legacy conversion', async () => {
  const searchId = '11111111-1111-4111-a111-111111111111'
  const fetcher = vi.fn<(input: URL, init?: RequestInit) => Promise<Response>>(async (input, init) => {
    expect(new URL(String(input)).hostname).toBe('subtitles.example.com')
    expect(JSON.parse(String(init?.body))).toMatchObject({ operation: 'discover', ref: { kind: 'movie', id: 550 } })
    expect(JSON.parse(String(init?.body)).ref).not.toHaveProperty('season')
    return Response.json({ events: [{ type: 'complete', searchId, languages: [] }] })
  })
  const service = createCloudflareSubtitleService({ origin: 'https://subtitles.example.com', secret: 's'.repeat(40), query: async () => ({ type: 'movie', tmdbId: 550 }), fetch: fetcher })
  await Array.fromAsync(service.discovery!.discover({ kind: 'movie', id: 550, season: 1, episode: 1 }, new AbortController().signal))
  expect(fetcher).toHaveBeenCalledTimes(1)
  await expect(service.file('1234567890abcdef')).rejects.toThrow('Cloudflare route')
  expect(await service.search({ kind: 'movie', id: 550 }, new AbortController().signal)).toEqual([])
  expect(fetcher).toHaveBeenCalledTimes(1)
})
