import { playbackCookieName } from '@consumit/media-relay/authorization'
import type { PlaybackVerification } from './verification.ts'
import type { PlaybackStore } from './state.ts'
import { createHash, randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { playbackEventsSchema, playbackFailureRequestSchema, playbackProviderListSchema, playbackSessionSchema, playbackSwitchRequestSchema, resolvePlaybackRequestSchema, separateAudioListSchema, separateAudioSourceSchema } from '@consumit/contracts'
import { z } from 'zod'
import { isAllowedOrigin } from '../http/csrf.ts'
import { ApiError } from '../http/errors.ts'
import type { Playback } from './playback.ts'

export function registerPlaybackRoutes(app: FastifyInstance, deps: { playback: Playback; origin: string; secure: boolean; dev?: boolean; verification?: PlaybackVerification | undefined; isMember?: ((request: FastifyRequest) => Promise<boolean>) | undefined; store?: PlaybackStore | undefined }) {
  const cookieName = playbackCookieName(deps.secure)
  const owner = (request: FastifyRequest, audience: 'browser' | 'cast' = 'browser') => {
    const token = request.cookies[playbackCookieName(deps.secure, audience)]
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new ApiError('UNAUTHENTICATED', 'Start playback to create a session.')
    return createHash('sha256').update(token).digest('hex')
  }
  const guard = (request: FastifyRequest) => {
    if (!isAllowedOrigin(request.headers, deps.origin, deps.dev)) throw new ApiError('FORBIDDEN', 'This playback request is not allowed.')
  }
  const id = (request: FastifyRequest) => {
    const parsed = z.object({ id: z.uuid() }).safeParse(request.params)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid playback session.')
    return parsed.data.id
  }
  function signal(request: FastifyRequest, reply: FastifyReply) {
    // Three bounded resolution tiers can consume up to sixty seconds.
    request.raw.setTimeout?.(70_000)
    const controller = new AbortController()
    request.raw.once('aborted', () => controller.abort())
    reply.raw.once('close', () => controller.abort())
    return controller.signal
  }
  const config = { rateLimit: { max: 20, timeWindow: '1 minute' } }
  app.get('/v1/playback/relay-manifest', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (request.headers['sec-fetch-site'] === 'cross-site') throw new ApiError('FORBIDDEN', 'This playback request is not allowed.')
    if (request.headers.origin && !isAllowedOrigin(request.headers, deps.origin, deps.dev)) throw new ApiError('FORBIDDEN', 'This playback request is not allowed.')
    const parsed = z.strictObject({ grant: z.string().min(29).max(3600).regex(/^[A-Za-z0-9_-]+$/) }).safeParse(request.query)
    if (!parsed.success) throw new ApiError('FORBIDDEN', 'Use a valid media capability.')
    reply.header('cache-control', 'private, no-store').header('access-control-allow-origin', deps.origin).header('vary', 'Origin')
    const audience = request.cookies[playbackCookieName(deps.secure, 'cast')] && !request.cookies[cookieName] ? 'cast' : 'browser'
    const scope = { owner: owner(request, audience), audience } as const
    try {
      const text = await deps.playback.relayManifest(parsed.data.grant, deps.dev ? undefined : deps.origin, scope, AbortSignal.any([signal(request, reply), AbortSignal.timeout(12000)]))
      return reply.type('application/vnd.apple.mpegurl').send(text)
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError('PLAYBACK_UNAVAILABLE', 'This media playlist is unavailable.', { retryable: true })
    }
  })
  for (const action of ['audio', 'audio/prepare'] as const) app.post(`/v1/playback/:id/${action}`, { config }, async (request, reply) => {
    guard(request)
    const parsed = z.object({ sourceId: z.string().min(1).max(160), trackId: z.string().regex(/^[a-f0-9]{32}$/).optional() }).safeParse(request.body)
    if (!parsed.success || (action === 'audio/prepare' && !parsed.data.trackId)) throw new ApiError('BAD_REQUEST', 'Choose an available audio track.')
    reply.header('cache-control', 'private, no-store')
    if (action === 'audio') return separateAudioListSchema.parse({ tracks: await deps.playback.listAudio(owner(request), id(request), parsed.data.sourceId, signal(request, reply)) })
    return separateAudioSourceSchema.parse(await deps.playback.prepareAudio(owner(request), id(request), parsed.data.sourceId, parsed.data.trackId!, signal(request, reply)))
  })
  app.post('/v1/playback/resolve', { config }, async (request, reply) => {
    guard(request)
    const parsed = resolvePlaybackRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Choose a movie or an exact episode and supported delivery formats.')
    let token = request.cookies[cookieName]
    if (!token || !/^[a-f0-9]{64}$/.test(token)) token = randomBytes(32).toString('hex')
    const ownerId = createHash('sha256').update(token).digest('hex')
    if (deps.verification && !await deps.isMember?.(request)) await deps.verification.verify(ownerId, parsed.data.turnstileToken)
    reply.setCookie(cookieName, token, { httpOnly: true, secure: deps.secure, sameSite: 'lax', path: '/', maxAge: 4 * 3600 })
    reply.header('cache-control', 'private, no-store')
    return playbackSessionSchema.parse(await deps.playback.resolve(ownerId, parsed.data, signal(request, reply), request.headers.origin ?? deps.origin))
  })
  app.post('/v1/playback/:id/cast-handoff', { config }, async (request, reply) => {
    guard(request)
    const parsed = z.strictObject({ sourceId: z.string().min(1).max(160) }).safeParse(request.body)
    if (!parsed.success || !deps.store || !deps.playback.castSource) throw new ApiError('BAD_REQUEST', 'Choose the current relay source.')
    const ownerId = owner(request), sessionId = id(request)
    await deps.playback.castSource(ownerId, sessionId, parsed.data.sourceId, ownerId)
    const handoffToken = randomBytes(32).toString('hex')
    await deps.store.set(`cast:${createHash('sha256').update(handoffToken).digest('hex')}`, JSON.stringify({ owner: ownerId, session: sessionId, sourceId: parsed.data.sourceId }), 60)
    reply.header('cache-control', 'private, no-store')
    return { handoffToken, expiresAt: new Date(Date.now() + 60000).toISOString() }
  })
  app.post('/v1/playback/cast/claim', { config }, async (request, reply) => {
    guard(request)
    const parsed = z.strictObject({ handoffToken: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(request.body)
    if (!parsed.success || !deps.store || !deps.playback.castSource) throw new ApiError('BAD_REQUEST', 'Use a valid cast handoff.')
    const raw = await deps.store.take(`cast:${createHash('sha256').update(parsed.data.handoffToken).digest('hex')}`)
    if (!raw) throw new ApiError('FORBIDDEN', 'Cast handoff expired or was already used.')
    const handoff = z.strictObject({ owner: z.string(), session: z.uuid(), sourceId: z.string() }).parse(JSON.parse(raw))
    const name = playbackCookieName(deps.secure, 'cast')
    const existing = request.cookies[name]
    const token = existing && /^[a-f0-9]{64}$/.test(existing) ? existing : randomBytes(32).toString('hex')
    const source = await deps.playback.castSource(handoff.owner, handoff.session, handoff.sourceId, createHash('sha256').update(token).digest('hex'))
    reply.setCookie(name, token, { httpOnly: true, secure: deps.secure, sameSite: 'lax', path: '/', maxAge: 4 * 3600 })
    reply.header('cache-control', 'private, no-store')
    return source
  })
  app.post('/v1/playback/providers', { config }, async (request, reply) => {
    guard(request)
    const parsed = resolvePlaybackRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Choose a movie or an exact episode and supported delivery formats.')
    reply.header('cache-control', 'private, no-store')
    return playbackProviderListSchema.parse({ providers: await deps.playback.listProviders(parsed.data, signal(request, reply)) })
  })
  app.post('/v1/playback/:id/switch', { config }, async (request, reply) => {
    guard(request)
    const parsed = playbackSwitchRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Choose an available playback provider.')
    reply.header('cache-control', 'private, no-store')
    return playbackSessionSchema.parse(await deps.playback.switchProvider(owner(request), id(request), parsed.data.providerId, signal(request, reply), parsed.data.preferences))
  })
  for (const action of ['refresh', 'fallback'] as const) app.post(`/v1/playback/:id/${action}`, { config }, async (request, reply) => {
    guard(request)
    const parsed = playbackFailureRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Provide the failed playback source.')
    reply.header('cache-control', 'private, no-store')
    return playbackSessionSchema.parse(await deps.playback.recover(owner(request), id(request), parsed.data, action === 'refresh', signal(request, reply)))
  })
  app.post('/v1/playback/:id/events', { bodyLimit: 8192, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    guard(request)
    const parsed = playbackEventsSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Provide a bounded playback event batch.')
    await deps.playback.events(owner(request), id(request), parsed.data)
    return reply.code(204).send()
  })
}
