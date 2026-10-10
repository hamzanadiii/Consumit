import { readFile } from 'node:fs/promises'
import { buildApp } from '../../apps/api/src/app'
import { loadEnv } from '../../apps/api/src/config/env'
import { createFakeIdentity } from '../../apps/api/src/identity/fake-identity'
import { createFakeCatalog } from '../../apps/api/src/catalog/fake-catalog'
import { unavailableMemberData } from '../../apps/api/src/member-data/unavailable-member-data'
import type { MemberData } from '../../apps/api/src/member-data/member-data'
import type { ExperienceRepository } from '../../apps/api/src/experience/repository'
import type { Playback } from '../../apps/api/src/playback/playback'
import type { AnimeCatalog } from '../../apps/api/src/catalog/anilist/adapter'
import { defaultExperiencePreferences, experiencePreferencesSchema, hasPlaybackPreferences, type ExperiencePreferences, type CatalogRef, type ResolvePlaybackRequest, type PlaybackSession } from '../../packages/contracts/src/index'
import { movieDetail, seriesDetail } from '../../apps/web/src/test/catalog-fixtures'
import { ApiError } from '../../apps/api/src/http/errors'

process.env.NODE_ENV = 'test'
const origin = 'http://127.0.0.1:28114'
const identity = createFakeIdentity()
await identity.register({ username: 'experience_fixture', email: 'experience@example.test', password: 'experience-fixture-password' })
const delivery = identity.notifier.deliveries[0]!
if (!('code' in delivery)) throw new Error('Missing fixture code')
const session = await identity.verifyEmail({ email: 'experience@example.test', code: delivery.code })
const values = new Map<string, ExperiencePreferences>(), favorites = new Map<string, readonly CatalogRef[]>()
let saveFailure = false
const requests: ResolvePlaybackRequest[] = []
const experience: ExperienceRepository = {
  async read(owner) { return { preferences: values.get(owner) ?? defaultExperiencePreferences(), saved: values.has(owner) } },
  async patch(owner, patch) {
    if (saveFailure) throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Fixture save unavailable.')
    const preferences = experiencePreferencesSchema.parse({ ...(values.get(owner) ?? defaultExperiencePreferences()), ...patch, ...(hasPlaybackPreferences(patch) ? { playbackConfigured: true } : {}) })
    values.set(owner, preferences); return { preferences, saved: true }
  },
}
const memberData: MemberData = {
  ...unavailableMemberData,
  async setFavorites(owner, refs) { favorites.set(owner, refs) },
  async progress() { return null },
  async librarySnapshot(owner) { return { diary: { items: [], nextCursor: null }, lists: { items: [], nextCursor: null }, saved: { items: [], nextCursor: null }, favorites: (favorites.get(owner) ?? []).map((ref, index) => ({ ...ref, position: index + 1, origin: 'native', sourceKey: null })) } },
  async profile(username, viewer) {
    const member = await identity.repository.findByUsername(username)
    if (!member || viewer !== member.record.id) return null
    const record = member.record
    const profile = { ...record.profile, createdAt: record.createdAt.toISOString(), usernameChangedAt: record.profile.usernameChangedAt?.toISOString() ?? null, nextUsernameChangeAt: null }
    return { canonicalUsername: username, profile, favorites: (favorites.get(viewer) ?? []).map((ref, index) => ({ ...ref, position: index + 1, origin: 'native', sourceKey: null })), diary: [], lists: [], reviews: [], ratingDistribution: Array.from({ length: 10 }, (_, index) => ({ value: index + 1, count: 0 })), social: { followers: 0, following: 0 }, statistics: { lists: 0, diaryEntries: 0, reviews: 0, watched: 0 } }
  },
}
function mediaSession(input: ResolvePlaybackRequest): PlaybackSession {
  const expiresAt = new Date(Date.now() + 3600_000).toISOString()
  return { id: '13b84bb4-2a78-47ba-abbd-274f58a67256', ref: input.ref, source: { id: 'fixture-media', providerId: 'fixture', type: 'native', delivery: 'direct', src: `${origin}/v1/playback/relay-manifest?grant=${'fixture_'.repeat(5)}`, expiresAt, subtitles: [{ id: 'fr', label: 'French', language: 'fr', url: 'https://experience-media.example/french.vtt', format: 'vtt' }], skipSegments: [], qualityHint: '720p' }, expiresAt, fallbackCount: 0, capabilities: { refresh: true, fallback: true, externalSubtitles: true } }
}
const playback: Playback = {
  async resolve(_owner, input) { requests.push(input); return mediaSession(input) },
  async recover() { return mediaSession(requests.at(-1)!) },
  async listProviders() { return [{ id: 'fixture', label: 'Fixture', available: true, delivery: 'direct' }] },
  async switchProvider() { return mediaSession(requests.at(-1)!) },
  async listAudio() { return [] }, async prepareAudio() { throw new Error('No fixture alternate audio') },
  async events() {}, async relayManifest() { throw new Error('No fixture relay') },
}
const anime = { trending: async () => ({ items: [], page: 1, totalPages: 0, totalResults: 0 }) } as unknown as AnimeCatalog
const titles = [movieDetail, seriesDetail].map(title => ({ ...title, title: title.kind === 'movie' ? 'Northbound — a remarkably long title for a quiet evening at home' : title.title, posterUrl: null, backdropUrl: null, recommendations: [] }))
const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test', APP_ORIGIN: origin }), identity, memberData, experience, playback, animeCatalog: anime, catalog: createFakeCatalog({ titles }) })
const visualSessions = new Map<string, typeof session>()
app.get('/__fixtures/session', async request => {
  const label = (request.query as { label?: string }).label
  if (!label) return { token: session.sessionToken, member: session.member }
  if (!/^(desktop|mobile)-(dark|light)$/.test(label)) throw new Error('Invalid fixture label')
  let scoped = visualSessions.get(label)
  if (!scoped) {
    const name = `visual_${label.replaceAll('-', '_')}`
    await identity.register({ username: name, email: `${name}@example.test`, password: 'experience-fixture-password' })
    const delivery = identity.notifier.deliveries.findLast(item => item.kind === 'verification')!
    if (!('code' in delivery)) throw new Error('Missing visual fixture code')
    scoped = await identity.verifyEmail({ email: `${name}@example.test`, code: delivery.code })
    visualSessions.set(label, scoped)
  }
  return { token: scoped.sessionToken, member: scoped.member }
})
app.get('/__fixtures/state', async () => ({ requests, preferences: [...values.entries()], favorites: [...favorites.entries()] }))
app.get('/__fixtures/code', async () => ({ code: identity.notifier.deliveries.findLast(item => item.kind === 'verification') }))
app.post('/__fixtures/reset', { config: { rateLimit: false } }, async request => {
  const body = request.body as { saveFailure?: boolean; preferences?: ExperiencePreferences; memberId?: string }
  values.clear(); favorites.clear(); requests.length = 0; saveFailure = body?.saveFailure ?? false
  if (body?.preferences) values.set(body.memberId ?? session.member.id, body.preferences)
  return { ok: true }
})
app.post('/__fixtures/recover', async () => { saveFailure = false; return { ok: true } })
app.get('/v1/experience-fixture/subtitles', async (_request, reply) => reply.type('text/vtt').send('WEBVTT\n\n00:00:00.000 --> 00:00:30.000\nSous-titres de démonstration.\n'))
app.get('/v1/experience-fixture/media', async (request, reply) => {
  const file = await readFile(new URL('../playback/media/reference.mp4', import.meta.url))
  const match = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
  const start = match ? Math.min(Number(match[1]), file.length - 1) : 0, end = match?.[2] ? Math.min(Number(match[2]), file.length - 1) : file.length - 1
  reply.type('video/mp4').header('accept-ranges', 'bytes')
  if (match) reply.code(206).header('content-range', `bytes ${start}-${end}/${file.length}`)
  return reply.send(file.subarray(start, end + 1))
})
app.addHook('onRequest', async (request, reply) => {
  if (!request.url.startsWith('/v1/playback/relay-manifest?grant=fixture_')) return
  const file = await readFile(new URL('../playback/media/reference.mp4', import.meta.url))
  const match = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
  const start = match ? Math.min(Number(match[1]), file.length - 1) : 0, end = match?.[2] ? Math.min(Number(match[2]), file.length - 1) : file.length - 1
  reply.type('video/mp4').header('accept-ranges', 'bytes')
  if (match) reply.code(206).header('content-range', `bytes ${start}-${end}/${file.length}`)
  return reply.send(file.subarray(start, end + 1))
})
await app.listen({ host: '0.0.0.0', port: 18563 })
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void app.close())
