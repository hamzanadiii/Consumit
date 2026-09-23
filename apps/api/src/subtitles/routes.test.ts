import { describe, expect, it } from 'vitest'

import { buildApp } from '../app.ts'
import { createFakeIdentity } from '../identity/fake-identity.ts'
import { createFakeSubtitleService, FAKE_SERVED_FILE_KEY } from './fake-subtitles.ts'
import { createFakeSubtitlePreferences } from './preferences.ts'

async function loginAs(identity: ReturnType<typeof createFakeIdentity>, email: string) {
  const username = email.split('@')[0]!
  await identity.register({ email, password: 'password12345', username })
  const delivery = identity.notifier.deliveries.findLast((d) => d.kind === 'verification' && 'code' in d && d.email === email)
  if (!delivery || !('code' in delivery)) throw new Error(`No verification code for ${email}`)
  const result = await identity.verifyEmail({ code: delivery.code, email })
  return result.sessionToken
}

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

  it('shifts cues with offsetMs and rejects out-of-range offsets', async () => {
    const app = await buildApp({ subtitles: createFakeSubtitleService() })
    try {
      const shifted = await app.inject({ method: 'GET', url: `/v1/subtitles/file/${FAKE_SERVED_FILE_KEY}?offsetMs=2000` })
      expect(shifted.statusCode).toBe(200)
      expect(shifted.body).toContain('00:02.000 --> 00:06.000')
      expect((await app.inject({ method: 'GET', url: `/v1/subtitles/file/${FAKE_SERVED_FILE_KEY}?offsetMs=999999` })).statusCode).toBe(400)
      expect((await app.inject({ method: 'GET', url: `/v1/subtitles/file/${FAKE_SERVED_FILE_KEY}?offsetMs=nope` })).statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })

  it('stores and recalls per-member sync corrections behind auth', async () => {
    const identity = createFakeIdentity()
    const preferences = createFakeSubtitlePreferences()
    const app = await buildApp({ identity, subtitles: createFakeSubtitleService(), subtitlePreferences: preferences })
    try {
      // Anonymous reads are rejected; anonymous writes fail the CSRF
      // guard before auth even runs. Authenticated writes need Origin.
      expect((await app.inject({ method: 'GET', url: '/v1/subtitles/preferences?kind=movie&id=550' })).statusCode).toBe(401)
      expect((await app.inject({ method: 'PUT', url: '/v1/subtitles/preferences', payload: { ref: { kind: 'movie', id: 550 }, offsetMs: 1500 } })).statusCode).toBe(403)
      const token = await loginAs(identity, 'subs@example.com')
      const cookies = { consumit_session: token }
      const headers = { origin: 'http://localhost:3000' }
      const empty = await app.inject({ method: 'GET', url: '/v1/subtitles/preferences?kind=movie&id=550', cookies })
      expect(empty.statusCode).toBe(200)
      expect(empty.json()).toEqual({ preference: { ref: { kind: 'movie', id: 550 }, trackId: null, offsetMs: 0 } })
      const saved = await app.inject({ method: 'PUT', url: '/v1/subtitles/preferences', cookies, headers, payload: { ref: { kind: 'movie', id: 550 }, trackId: 'sub-yify-test', offsetMs: 1500 } })
      expect(saved.statusCode).toBe(200)
      expect(saved.json()).toEqual({ preference: { ref: { kind: 'movie', id: 550 }, trackId: 'sub-yify-test', offsetMs: 1500 } })
      const recalled = await app.inject({ method: 'GET', url: '/v1/subtitles/preferences?kind=series&id=1396&season=1&episode=1', cookies })
      expect(recalled.json()).toEqual({ preference: { ref: { kind: 'series', id: 1396, season: 1, episode: 1 }, trackId: null, offsetMs: 0 } })
      expect((await app.inject({ method: 'PUT', url: '/v1/subtitles/preferences', cookies, headers, payload: { ref: { kind: 'movie', id: 550 }, offsetMs: 999999 } })).statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })

  it('serves originals where stored and 404s otherwise', async () => {
    const app = await buildApp({ subtitles: createFakeSubtitleService() })
    try {
      // The fake has no original storage: honest 404, invalid keys 400.
      expect((await app.inject({ method: 'GET', url: `/v1/subtitles/original/${FAKE_SERVED_FILE_KEY}` })).statusCode).toBe(404)
      expect((await app.inject({ method: 'GET', url: '/v1/subtitles/original/nope' })).statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })
})
