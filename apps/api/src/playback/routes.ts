import { createHash, randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { playbackEventsSchema, playbackFailureRequestSchema, playbackProviderListSchema, playbackSessionSchema, playbackSwitchRequestSchema, resolvePlaybackRequestSchema, separateAudioListSchema, separateAudioSourceSchema } from '@consumit/contracts'
import { z } from 'zod'
import { isAllowedOrigin } from '../http/csrf.ts'
import { ApiError } from '../http/errors.ts'
import type { Playback } from './playback.ts'

export function registerPlaybackRoutes(app: FastifyInstance, deps: { playback: Playback; origin: string; secure: boolean; dev?: boolean }) {
  const cookieName = deps.secure ? '__Host-consumit-playback' : 'consumit-playback'
  const owner = (request: FastifyRequest) => {
    const token = request.cookies[cookieName]
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
    if (request.headers.origin && !isAllowedOrigin(request.headers, deps.origin, deps.dev)) throw new ApiError('FORBIDDEN', 'This playback request is not allowed.')
    const parsed = z.strictObject({ grant: z.string().min(29).max(3600).regex(/^[A-Za-z0-9_-]+$/) }).safeParse(request.query)
    if (!parsed.success) throw new ApiError('FORBIDDEN', 'Use a valid media capability.')
    reply.header('cache-control', 'private, no-store').header('access-control-allow-origin', deps.origin).header('vary', 'Origin')
    try {
      const text = await deps.playback.relayManifest(parsed.data.grant, deps.origin, AbortSignal.any([signal(request, reply), AbortSignal.timeout(12000)]))
      return reply.type('application/vnd.apple.mpegurl').send(text)
    } catch {
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
    reply.setCookie(cookieName, token, { httpOnly: true, secure: deps.secure, sameSite: 'lax', path: '/', maxAge: 4 * 3600 })
    reply.header('cache-control', 'private, no-store')
    return playbackSessionSchema.parse(await deps.playback.resolve(createHash('sha256').update(token).digest('hex'), parsed.data, signal(request, reply)))
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
