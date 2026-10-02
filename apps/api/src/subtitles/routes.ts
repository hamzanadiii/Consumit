import { playbackRefSchema, subtitlePreferenceResponseSchema, subtitlePreferenceSchema, subtitleTrackSchema, subtitlesResponseSchema } from '@consumit/contracts'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { metrics } from '@opentelemetry/api'
import { z } from 'zod'
import { Readable } from 'node:stream'

import type { ApiEnv } from '../config/env.ts'
import { ApiError } from '../http/errors.ts'
import { isAllowedOrigin } from '../http/csrf.ts'
import type { Identity } from '../identity/identity.ts'
import { sessionCookieName } from '../identity/session.ts'
import type { SubtitlePreferences } from './preferences.ts'
import { SubtitleError } from './errors.ts'
import { cleanQueryLangs, type SubtitleService } from './subtitles.ts'

const querySchema = z.object({
  kind: z.enum(['movie', 'series', 'anime']),
  id: z.coerce.number().int().positive(),
  season: z.coerce.number().int().min(1).max(100).optional().default(1),
  episode: z.coerce.number().int().min(1).max(10000).optional().default(1),
  /** Member's preferred subtitle languages, comma-separated, max 3 in
   *  priority order. Malformed codes are dropped, never rejected. */
  langs: z.string().trim().max(64).optional(),
})

const fileParamsSchema = z.object({ key: z.string().min(1).max(64) })
const discoveryPageSchema = z.object({
  searchId: z.uuid(), language: z.string().regex(/^[a-z]{2,3}$/), cursor: z.coerce.number().int().min(0).max(100000).default(0),
  langs: z.string().max(64).optional(),
})
const discoverySearchSchema = z.object({ searchId: z.uuid(), q: z.string().trim().min(1).max(80), cursor: z.coerce.number().int().min(0).max(100000).default(0) })
const prepareBodySchema = z.object({ searchId: z.uuid(), candidateId: z.string().min(1).max(128) })
const fileQuerySchema = z.object({
  /** Per-member sync correction in milliseconds (±120s). Shifted variants
   *  are served and cached without touching the source file. */
  offsetMs: z.coerce.number().int().min(-120000).max(120000).optional(),
})

const preferenceRefQuerySchema = z.object({
  kind: z.enum(['movie', 'series', 'anime']),
  id: z.coerce.number().int().positive(),
  season: z.coerce.number().int().min(1).max(100).optional(),
  episode: z.coerce.number().int().min(1).max(10000).optional(),
})

/** Flat query params into a validated playback ref. Movies carry no
 *  season/episode; series default to 1/1; anime needs an episode. */
function preferenceRef(query: z.infer<typeof preferenceRefQuerySchema>) {
  const ref = query.kind === 'movie'
    ? { kind: query.kind, id: query.id }
    : query.kind === 'anime'
      ? { kind: query.kind, id: query.id, episode: query.episode ?? 1 }
      : { kind: query.kind, id: query.id, season: query.season ?? 1, episode: query.episode ?? 1 }
  const parsed = playbackRefSchema.safeParse(ref)
  if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a movie, an exact series episode, or an anime episode.')
  return parsed.data
}

function invalidQuery(message: string): never {
  throw new ApiError('BAD_REQUEST', message)
}

function sendSubtitleError(error: unknown): never {
  if (error instanceof SubtitleError || error instanceof ApiError) throw error
  throw new SubtitleError('SUBTITLES_UNAVAILABLE', 'Subtitles are temporarily unavailable. Try again.', {
    cause: error,
    retryable: true,
  })
}

export function registerSubtitleRoutes(
  app: FastifyInstance,
  deps: { subtitles: SubtitleService; env?: ApiEnv | undefined; identity?: Identity | undefined; preferences?: SubtitlePreferences | undefined },
) {
  const meter = metrics.getMeter('consumit.subtitles')
  const searches = meter.createCounter('subtitle.searches')
  const searchDuration = meter.createHistogram('subtitle.search.duration', { unit: 'ms' })
  const preferenceDeps = deps.env && deps.identity && deps.preferences
    ? { env: deps.env, identity: deps.identity, preferences: deps.preferences }
    : null

  async function viewer(request: FastifyRequest): Promise<string> {
    if (!preferenceDeps) throw new SubtitleError('SUBTITLES_UNAVAILABLE', 'Subtitle preferences are unavailable on this server.', { retryable: true })
    const token = request.cookies?.[sessionCookieName(preferenceDeps.env)]
    if (!token) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.')
    const member = await preferenceDeps.identity.getSession(token)
    if (!member) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.')
    return member.id
  }

  function guardMutation(request: FastifyRequest) {
    if (!preferenceDeps) throw new SubtitleError('SUBTITLES_UNAVAILABLE', 'Subtitle preferences are unavailable on this server.', { retryable: true })
    if (!isAllowedOrigin(request.headers, preferenceDeps.env.appOrigin, preferenceDeps.env.nodeEnv !== 'production')) {
      throw new ApiError('FORBIDDEN', 'Cross-site requests are not allowed.')
    }
  }

  // Aggregated captions for one title/episode across every subtitle
  // provider plus the member's streaming-provider tracks downstream — the
  // menu never depends on which streaming provider is selected.
  app.get('/v1/subtitles', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery('Use a title kind, a positive numeric id, and a valid season/episode.')
    const startedAt = Date.now()
    let outcome = 'failed'
    try {
      const controller = new AbortController()
      // Under the 15s server request bound so failures stay clean 503s.
      const timer = setTimeout(() => controller.abort(), 14_000)
      try {
        const subtitles = await deps.subtitles.search(
          { kind: parsed.data.kind, id: parsed.data.id, season: parsed.data.season, episode: parsed.data.episode },
          controller.signal,
          cleanQueryLangs(parsed.data.langs),
        )
        reply.header('cache-control', 'public, max-age=300, s-maxage=900')
        const response = subtitlesResponseSchema.parse({ subtitles })
        outcome = 'success'
        return response
      } finally {
        clearTimeout(timer)
      }
    } catch (error) {
      return sendSubtitleError(error)
    } finally {
      searches.add(1, { outcome, kind: parsed.data.kind })
      searchDuration.record(Date.now() - startedAt, { outcome, kind: parsed.data.kind })
    }
  })

  app.get('/v1/subtitles/discover', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!deps.subtitles.discovery) throw new SubtitleError('SUBTITLES_UNAVAILABLE', 'Subtitle discovery is unavailable.')
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery('Use a title kind, numeric id, and valid season/episode.')
    const { kind, id, season, episode } = parsed.data
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 13_000)
    const stream = Readable.from((async function* () {
      try {
        for await (const event of deps.subtitles.discovery!.discover({ kind, id, season, episode }, controller.signal)) {
          yield `${JSON.stringify(event)}\n`
        }
      } finally { clearTimeout(timer) }
    })())
    reply.header('cache-control', 'no-store')
    reply.header('x-accel-buffering', 'no')
    return reply.type('application/x-ndjson; charset=utf-8').send(stream)
  })

  app.get('/v1/subtitles/discover/page', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!deps.subtitles.discovery) throw new SubtitleError('SUBTITLES_UNAVAILABLE', 'Subtitle discovery is unavailable.')
    const parsed = discoveryPageSchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery('Use a discovery id, language, and nonnegative cursor.')
    const page = await deps.subtitles.discovery.page(parsed.data.searchId, parsed.data.language, parsed.data.cursor, cleanQueryLangs(parsed.data.langs))
    if (!page) throw new SubtitleError('SUBTITLES_NOT_FOUND', 'Search subtitles again.')
    reply.header('cache-control', 'no-store')
    return page
  })

  app.get('/v1/subtitles/discover/search', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!deps.subtitles.discovery) throw new SubtitleError('SUBTITLES_UNAVAILABLE', 'Subtitle discovery is unavailable.')
    const parsed = discoverySearchSchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery('Use a discovery id, search term, and nonnegative cursor.')
    const result = await deps.subtitles.discovery.search(parsed.data.searchId, parsed.data.q, parsed.data.cursor)
    if (!result) throw new SubtitleError('SUBTITLES_NOT_FOUND', 'Search subtitles again.')
    reply.header('cache-control', 'no-store')
    return result
  })

  app.post('/v1/subtitles/discover/prepare', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!deps.subtitles.discovery) throw new SubtitleError('SUBTITLES_UNAVAILABLE', 'Subtitle discovery is unavailable.')
    if (deps.env && !isAllowedOrigin(request.headers, deps.env.appOrigin, deps.env.nodeEnv !== 'production')) throw new ApiError('FORBIDDEN', 'Cross-site requests are not allowed.')
    const parsed = prepareBodySchema.safeParse(request.body)
    if (!parsed.success) return invalidQuery('Use a valid discovery and candidate id.')
    const track = await deps.subtitles.discovery.prepare(parsed.data.searchId, parsed.data.candidateId, AbortSignal.timeout(10_000))
    if (!track) throw new SubtitleError('SUBTITLES_NOT_FOUND', 'This subtitle is unavailable. Choose another track.')
    reply.header('cache-control', 'no-store')
    return subtitleTrackSchema.parse(track)
  })

  // First-party converted VTT bytes. Same-origin, immutable, long-lived:
  // the player treats these exactly like any cached media-adjacent file.
  app.get('/v1/subtitles/file/:key', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = fileParamsSchema.safeParse(request.params)
    if (!parsed.success || !/^[0-9a-f]{16}$/.test(parsed.data.key)) return invalidQuery('Use a valid subtitle file key.')
    const query = fileQuerySchema.safeParse(request.query)
    if (!query.success) return invalidQuery('offsetMs must be whole milliseconds within ±120 seconds.')
    const vtt = await deps.subtitles.file(parsed.data.key, query.data.offsetMs)
    if (!vtt) throw new SubtitleError('SUBTITLES_NOT_FOUND', 'This subtitle file expired. Search subtitles again.')
    reply.header('content-type', 'text/vtt; charset=utf-8')
    // Shifted variants are per-member corrections: cacheable by URL (the
    // offset rides the query string) but never shared across keys.
    reply.header('cache-control', query.data.offsetMs ? 'public, max-age=604800' : 'public, max-age=604800, immutable')
    return vtt
  })

  // Original source bytes (srt/vtt/ass) kept for future styled rendering.
  // Same key as the converted file; unavailable on backends without
  // original storage (store-backed deployments).
  app.get('/v1/subtitles/original/:key', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = fileParamsSchema.safeParse(request.params)
    if (!parsed.success || !/^[0-9a-f]{16}$/.test(parsed.data.key)) return invalidQuery('Use a valid subtitle file key.')
    const original = await deps.subtitles.original(parsed.data.key)
    if (!original) throw new SubtitleError('SUBTITLES_NOT_FOUND', 'No original file is stored for this subtitle.')
    reply.header('content-type', original.ext === 'ass' || original.ext === 'ssa' ? 'text/plain; charset=utf-8' : original.ext === 'srt' ? 'application/x-subrip; charset=utf-8' : 'text/vtt; charset=utf-8')
    reply.header('cache-control', 'public, max-age=604800, immutable')
    return reply.send(original.bytes)
  })

  // Per-member sync correction for one title/episode. Session-authenticated;
  // one row per member/content. Crowdsourced correction reads this table
  // later without ever rewriting shared files.
  app.get('/v1/subtitles/preferences', async (request) => {
    const memberId = await viewer(request)
    const query = preferenceRefQuerySchema.safeParse(request.query)
    if (!query.success) return invalidQuery('Use a title kind, a positive numeric id, and a valid season/episode.')
    const ref = preferenceRef(query.data)
    const record = await preferenceDeps!.preferences.get(memberId, ref)
    return subtitlePreferenceResponseSchema.parse({
      preference: { ref, trackId: record?.trackId ?? null, offsetMs: record?.offsetMs ?? 0 },
    })
  })

  app.put('/v1/subtitles/preferences', async (request) => {
    guardMutation(request)
    const memberId = await viewer(request)
    const parsed = subtitlePreferenceSchema.safeParse(request.body)
    if (!parsed.success) return invalidQuery('Provide a title reference with an optional track and an offset within ±120 seconds.')
    const record = await preferenceDeps!.preferences.set(memberId, parsed.data.ref, { trackId: parsed.data.trackId, offsetMs: parsed.data.offsetMs })
    return subtitlePreferenceResponseSchema.parse({
      preference: { ref: parsed.data.ref, trackId: record.trackId, offsetMs: record.offsetMs },
    })
  })
}
