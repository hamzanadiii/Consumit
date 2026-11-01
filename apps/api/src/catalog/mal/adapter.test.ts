import { expect, it, vi } from 'vitest'
import { createMalCatalog } from './adapter.ts'

it.each([['2026-01-22', 'winter'], ['2026-04-22', 'spring'], ['2026-07-22', 'summer'], ['2026-10-22', 'fall']])('uses the current season for MAL fallback discovery on %s', async (date, season) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${date}T12:00:00Z`))
  try {
    const fetch = vi.fn(async (_input: string | URL | Request) => Response.json({ data: [], paging: {} }))
    const source = createMalCatalog({ clientId: 'test-client', fetch, identity: { remember: async () => {}, malIdForAniList: async () => null, aniListIdForMal: async () => null } })
    const result = await source.trending(1, 20)
    const url = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(url.pathname).toBe(`/v2/anime/season/2026/${season}`)
    expect(result).toMatchObject({ discoveryBasis: 'seasonal-popularity' })
  } finally { vi.useRealTimers() }
})
