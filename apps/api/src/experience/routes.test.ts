import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultExperiencePreferences, experiencePreferencesSchema, type ExperiencePreferences } from '@consumit/contracts'
import { registerExperienceRoutes } from './routes.ts'
import { registerErrorHandlers } from '../http/errors.ts'
import { loadEnv } from '../config/env.ts'
import { createFakeIdentity } from '../identity/fake-identity.ts'
const apps: ReturnType<typeof Fastify>[] = []
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())) })
async function setup() {
  const app = Fastify(); apps.push(app); await app.register(cookie); registerErrorHandlers(app)
  const identity = createFakeIdentity(), rows = new Map<string, ExperiencePreferences>()
  registerExperienceRoutes(app, { env: loadEnv({ NODE_ENV: 'test', APP_ORIGIN: 'https://consumit.example' }), identity, repository: {
    read: async id => ({ preferences: rows.get(id) ?? defaultExperiencePreferences(), saved: rows.has(id) }),
    patch: async (id, patch) => { const preferences = experiencePreferencesSchema.parse({ ...(rows.get(id) ?? defaultExperiencePreferences()), ...patch }); rows.set(id, preferences); return { preferences, saved: true } },
  } })
  const sessions = []
  for (const name of ['first', 'second']) {
    await identity.register({ email: `${name}@example.com`, password: 'test-password-long-enough', username: name })
    const delivery = identity.notifier.deliveries.at(-1)!
    if (!('code' in delivery)) throw new Error('Expected verification')
    const session = await identity.verifyEmail({ email: `${name}@example.com`, code: delivery.code })
    sessions.push({ consumit_session: session.sessionToken })
  }
  return { app, first: sessions[0]!, second: sessions[1]! }
}
describe('private experience preferences', () => {
  it('requires authentication, keeps defaults off until chosen, and never uses a supplied member ID', async () => {
    const { app, first, second } = await setup()
    const url = '/v1/me/experience-preferences'
    expect((await app.inject({ url })).statusCode).toBe(401)
    const headers = { origin: 'https://consumit.example' }
    const changed = await app.inject({ method: 'PATCH', url, cookies: first, headers, payload: { audioLanguage: 'ar', subtitleLanguages: ['ar', 'fr'], animeAudio: 'dub' } })
    expect(changed.statusCode).toBe(200)
    expect(changed.headers['cache-control']).toBe('private, no-store')
    expect((await app.inject({ url: `${url}?memberId=first`, cookies: second })).json()).toEqual({ saved: false, preferences: defaultExperiencePreferences() })
    expect((await app.inject({ url, cookies: first })).json().preferences.audioLanguage).toBe('ar')
  })
  it('rejects foreign origins, ownership fields, duplicates and invalid preferences', async () => {
    const { app, first } = await setup(), url = '/v1/me/experience-preferences'
    expect((await app.inject({ method: 'PATCH', url, cookies: first, headers: { origin: 'https://evil.example' }, payload: { animeAudio: 'dub' } })).statusCode).toBe(403)
    for (const payload of [{ memberId: 'second', audioLanguage: 'en' }, { subtitleLanguages: ['en', 'en'] }, { subtitleLanguages: ['en', 'ar', 'fr', 'es'] }, { qualityHeight: 0 }, { guideVersion: 999 }, {}]) {
      expect((await app.inject({ method: 'PATCH', url, cookies: first, headers: { origin: 'https://consumit.example' }, payload })).statusCode).toBe(400)
    }
  })
  it('updates dismissal without losing playback choices', async () => {
    const { app, first } = await setup(), url = '/v1/me/experience-preferences', headers = { origin: 'https://consumit.example' }
    await app.inject({ method: 'PATCH', url, cookies: first, headers, payload: { qualityHeight: 720, subtitlesEnabled: false } })
    const response = await app.inject({ method: 'PATCH', url, cookies: first, headers, payload: { guideVersion: 1, guideStatus: 'completed', communityDismissed: true } })
    expect(response.json().preferences).toMatchObject({ qualityHeight: 720, subtitlesEnabled: false, guideStatus: 'completed', communityDismissed: true })
  })
})
