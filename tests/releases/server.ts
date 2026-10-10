import { readFile } from 'node:fs/promises'
import { buildApp } from '../../apps/api/src/app'
import { loadEnv } from '../../apps/api/src/config/env'
import { createFakeIdentity } from '../../apps/api/src/identity/fake-identity'
import { createFakeCatalog } from '../../apps/api/src/catalog/fake-catalog'
import type { ReleaseService } from '../../apps/api/src/releases/service'
import type { AnimeCatalog } from '../../apps/api/src/catalog/anilist/adapter'
import type { ReleaseEpisode, ReleaseProbeEvidence } from '../../packages/contracts/src/index'

process.env.NODE_ENV = 'test'
const origin = 'http://127.0.0.1:28112'
const identity = createFakeIdentity()
await identity.register({ email: 'releases@example.com', password: 'releases-fixture-password', username: 'release_fixture' })
const verification = identity.notifier.deliveries[0]!
if (!('code' in verification)) throw new Error('Fixture verification missing')
const session = await identity.verifyEmail({ email: 'releases@example.com', code: verification.code })
const episode: ReleaseEpisode = { ref: { kind: 'series', id: 1399, season: 2, episode: 3 }, title: 'The long-awaited return of a favorite series with a very long title', episodeTitle: 'A new beginning', imageUrl: null, releasedAt: new Date(Date.now() - 60_000).toISOString(), datePrecision: 'date', checkedAt: new Date().toISOString() }
let enabled = false, read = false, shelfMode = 'full', jobClaimed = false, evidence: ReleaseProbeEvidence | null = null
const id = 'b0297642-889f-4f10-8294-3c365ad166c2', leaseToken = 'da794c06-d43f-436d-9d84-6f21bf38d546'
const notifications = () => [{ id, episode, createdAt: new Date().toISOString(), readAt: read ? new Date().toISOString() : null }]
const env = loadEnv({ NODE_ENV: 'test', APP_ORIGIN: origin })
env.releases = { enabled: true, workerSecret: 'fixture-worker-secret-01234567890123456789' }
const releases = {
  shelf: async () => {
    if (shelfMode === 'error') throw new Error('Fixture outage')
    return { items: shelfMode === 'empty' ? [] : [episode, { ...episode, ref: { kind: 'anime', id: 21, season: 0, episode: 4 }, title: 'New anime episode', datePrecision: 'instant', checkedAt: null }], trackedCount: shelfMode === 'empty' ? 0 : 2, partial: shelfMode === 'partial' }
  },
  notifications: async (_owner: string, query: { filter: string }) => ({ items: query.filter === 'unread' && read ? [] : notifications(), unreadCount: read ? 0 : 1, nextCursor: null }),
  markRead: async () => { read = true }, preferences: async () => ({ newEpisodes: enabled }), setPreferences: async (_owner: string, next: boolean) => { enabled = next; return { newEpisodes: enabled } },
  authorizeJob: async (job: string, token: string) => job === id && token === leaseToken,
  claimCheck: async () => { if (jobClaimed) return null; jobClaimed = true; return { id, leaseToken, expiresAt: new Date(Date.now() + 90_000).toISOString(), ref: episode.ref } },
  source: async () => ({ src: `${origin}/v1/playback/relay-manifest?grant=${'fixture_'.repeat(5)}`, type: 'native', expiresAt: new Date(Date.now() + 90_000).toISOString(), providerId: 'fixture', revision: 'a'.repeat(64), region: 'US', audioLanguage: 'en', mediaHosts: [], mediaHostPatterns: [] }),
  finishCheck: async (_id: string, _token: string, result: ReleaseProbeEvidence) => { evidence = result },
} as unknown as ReleaseService
const anime = { trending: async () => ({ items: [], page: 1, totalPages: 0, totalResults: 0 }) } as unknown as AnimeCatalog
const app = await buildApp({ env, identity, animeCatalog: anime, catalog: createFakeCatalog({ titles: [{
  id: 693134, kind: 'movie', title: 'Northbound', originalTitle: 'Northbound', overview: 'A cinematic catalog fixture.',
  genreNames: ['Drama'], backdropUrl: null, posterUrl: null, logoUrl: null, popularity: 100, releaseDate: '2026-09-09', tmdbRating: 8, tmdbVoteCount: 100, year: 2026,
  cast: [], certification: null, countries: [], creators: [], heroBackdropUrl: null, homepageUrl: null, languages: ['English'], recommendations: [], runtimeMinutes: 90, status: 'Released', tagline: null,
}] }), releases })
app.get('/__fixtures/session', async () => ({ token: session.sessionToken, id, leaseToken }))
app.post('/__fixtures/reset', { config: { rateLimit: false } }, async request => { enabled = false; read = false; jobClaimed = false; evidence = null; shelfMode = (request.body as { mode?: string })?.mode ?? 'full'; return { ok: true } })
app.get('/__fixtures/evidence', async () => ({ evidence }))
app.get('/__fixtures/media', async (request, reply) => {
  const file = await readFile(new URL('../playback/media/reference.mp4', import.meta.url))
  const match = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
  const start = match ? Math.min(Number(match[1]), file.length - 1) : 0, end = match?.[2] ? Math.min(Number(match[2]), file.length - 1) : file.length - 1
  reply.header('content-type', 'video/mp4').header('accept-ranges', 'bytes')
  if (match) reply.code(206).header('content-range', `bytes ${start}-${end}/${file.length}`)
  return reply.send(file.subarray(start, end + 1))
})
// Existing playback routes own this path. Rewrite only in this fixture process.
app.addHook('onRequest', async (request, reply) => {
  if (!request.url.startsWith('/v1/playback/relay-manifest?grant=fixture_')) return
  const file = await readFile(new URL('../playback/media/reference.mp4', import.meta.url))
  const match = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
  const start = match ? Math.min(Number(match[1]), file.length - 1) : 0, end = match?.[2] ? Math.min(Number(match[2]), file.length - 1) : file.length - 1
  reply.header('content-type', 'video/mp4').header('accept-ranges', 'bytes')
  if (match) reply.code(206).header('content-range', `bytes ${start}-${end}/${file.length}`)
  return reply.send(file.subarray(start, end + 1))
})
await app.listen({ host: '0.0.0.0', port: 18561 })
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void app.close())
