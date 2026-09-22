import { describe, expect, it } from 'vitest'

import { buildApp } from '../app.ts'
import { createFakeSubtitleService, FAKE_SERVED_FILE_KEY } from './fake-subtitles.ts'

describe('subtitle routes', () => {
  it('aggregates tracks for a title independently of streaming providers', async () => {
    const app = await buildApp({ subtitles: createFakeSubtitleService() })
    try {
      const response = await app.inject({ method: 'GET', url: '/v1/subtitles?kind=movie&id=693134' })
      expect(response.statusCode).toBe(200)
      const body = response.json() as { subtitles: { id: string; label: string }[] }
      expect(body.subtitles.map((track) => track.label).sort()).toEqual(['English (castlesubs)', 'English (yify)'])
    } finally {
      await app.close()
    }
  })

  it('accepts preferred languages and tolerates malformed ones', async () => {
    const app = await buildApp({ subtitles: createFakeSubtitleService() })
    try {
      expect((await app.inject({ method: 'GET', url: '/v1/subtitles?kind=movie&id=1&langs=ar,fr,es' })).statusCode).toBe(200)
      expect((await app.inject({ method: 'GET', url: '/v1/subtitles?kind=movie&id=1&langs=!!!' })).statusCode).toBe(200)
    } finally {
      await app.close()
    }
  })

  it('rejects invalid subtitle queries', async () => {
    const app = await buildApp({ subtitles: createFakeSubtitleService() })
    try {
      expect((await app.inject({ method: 'GET', url: '/v1/subtitles?kind=movie' })).statusCode).toBe(400)
      expect((await app.inject({ method: 'GET', url: '/v1/subtitles?kind=anime&id=21&episode=20000' })).statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })

  it('serves cached VTT files and 404s misses', async () => {
    const app = await buildApp({ subtitles: createFakeSubtitleService() })
    try {
      const hit = await app.inject({ method: 'GET', url: `/v1/subtitles/file/${FAKE_SERVED_FILE_KEY}` })
      expect(hit.statusCode).toBe(200)
      expect(hit.headers['content-type']).toContain('text/vtt')
      expect(hit.body).toContain('WEBVTT')
      const miss = await app.inject({ method: 'GET', url: '/v1/subtitles/file/ffffffffffffffff' })
      expect(miss.statusCode).toBe(404)
      expect((await app.inject({ method: 'GET', url: '/v1/subtitles/file/nope' })).statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })
})
