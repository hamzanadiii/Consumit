import { describe, expect, it } from 'vitest'

import { buildApp } from '../app.ts'
import { createFakeAnilist } from './fake-anilist.ts'

describe('anilist routes', () => {
  it('searches anime and returns detail with identity and relations', async () => {
    const app = await buildApp({ anilist: createFakeAnilist() })
    try {
      const search = await app.inject({ method: 'GET', url: '/v1/anime/search?q=bebop' })
      expect(search.statusCode).toBe(200)
      expect(search.json().items[0]).toMatchObject({ anilistId: 1, title: 'Cowboy Bebop' })
      expect(search.json().meta.source).toBe('anilist')

      const detail = await app.inject({ method: 'GET', url: '/v1/anime/1' })
      expect(detail.statusCode).toBe(200)
      expect(detail.json().item.identity).toMatchObject({ anilistId: 1, malId: 1 })
      expect(detail.json().item.relations).toHaveLength(1)

      const missing = await app.inject({ method: 'GET', url: '/v1/anime/999999' })
      expect(missing.statusCode).toBe(404)
      expect(missing.json().error.code).toBe('CATALOG_NOT_FOUND')

      const invalid = await app.inject({ method: 'GET', url: '/v1/anime/search?q=x' })
      expect(invalid.statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })
})
