import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { ApiError } from '../http/errors.ts'
import { createEmbedToken, isEmbedDomainAllowed } from './embed-tokens.ts'
import type { Playback } from './playback.ts'

const tmdbIdParam = z.object({ tmdbId: z.string().regex(/^\d{1,12}$/) })
const tvParams = z.object({ tmdbId: z.string().regex(/^\d{1,12}$/), season: z.string().regex(/^\d{1,4}$/), episode: z.string().regex(/^\d{1,4}$/) })

export function registerEmbedRoutes(app: FastifyInstance, deps: {
  playback: Playback
  workerUrl: string | undefined
  hmacSecret: string | undefined
  allowedDomains: string | undefined
  origin: string
  dev?: boolean
}) {
  const rateLimitConfig = { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }

  function guardDomain(request: FastifyRequest) {
    const referer = request.headers.referer || request.headers.origin || ''
    if (!referer && !deps.dev) throw new ApiError('FORBIDDEN', 'Embed access requires a valid referer.')
    if (referer && deps.allowedDomains) {
      try {
        const hostname = new URL(referer).hostname
        if (!isEmbedDomainAllowed(hostname, deps.allowedDomains)) {
          throw new ApiError('FORBIDDEN', 'Domain not allowed for embedding.')
        }
      } catch (e) {
        if (e instanceof ApiError) throw e
        throw new ApiError('FORBIDDEN', 'Invalid referer origin.')
      }
    }
  }

  function proxyUrl(rawUrl: string, referer?: string): string {
    if (!deps.workerUrl) return rawUrl
    const params = new URLSearchParams({ url: rawUrl })
    if (referer) params.set('referer', referer)
    if (deps.hmacSecret) {
      const workerDomain = new URL(deps.workerUrl).hostname
      params.set('token', createEmbedToken(deps.hmacSecret, rawUrl, workerDomain))
    }
    return `${deps.workerUrl}/proxy?${params.toString()}`
  }

  app.get('/v1/embed/movie/:tmdbId', rateLimitConfig, async (request, reply) => {
    guardDomain(request)
    const parsed = tmdbIdParam.safeParse(request.params)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Provide a valid TMDB movie ID.')

    const controller = new AbortController()
    request.raw.on('close', () => controller.abort())
    const session = await deps.playback.resolve(`embed:${randomUUID()}`, {
      ref: { kind: 'movie', id: Number(parsed.data.tmdbId) },
      capabilities: { hls: true, dash: true, native: true, nativeHls: true },
      audioLanguage: 'en',
    }, controller.signal)

    reply.header('cache-control', 'public, max-age=60')
    reply.header('access-control-allow-origin', '*')
    return {
      success: true,
      type: 'movie',
      tmdbId: parsed.data.tmdbId,
      title: session.ref.id,
      sources: [{
        url: deps.workerUrl ? proxyUrl(session.source.src) : session.source.src,
        type: session.source.type,
        quality: session.source.qualityHint || 'Auto',
        provider: session.source.providerId,
        headers: {},
      }],
      subtitles: session.source.subtitles.map((s) => ({
        url: deps.workerUrl ? proxyUrl(s.url) : s.url,
        label: s.label,
        format: s.format,
      })),
    }
  })

  app.get('/v1/embed/tv/:tmdbId/:season/:episode', rateLimitConfig, async (request, reply) => {
    guardDomain(request)
    const parsed = tvParams.safeParse(request.params)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Provide valid TMDB TV ID, season, and episode numbers.')

    const controller = new AbortController()
    request.raw.on('close', () => controller.abort())
    const session = await deps.playback.resolve(`embed:${randomUUID()}`, {
      ref: {
        kind: 'series',
        id: Number(parsed.data.tmdbId),
        season: Number(parsed.data.season),
        episode: Number(parsed.data.episode),
      },
      capabilities: { hls: true, dash: true, native: true, nativeHls: true },
      audioLanguage: 'en',
    }, controller.signal)

    reply.header('cache-control', 'public, max-age=60')
    reply.header('access-control-allow-origin', '*')
    return {
      success: true,
      type: 'tv',
      tmdbId: parsed.data.tmdbId,
      season: parsed.data.season,
      episode: parsed.data.episode,
      title: session.ref.id,
      sources: [{
        url: deps.workerUrl ? proxyUrl(session.source.src) : session.source.src,
        type: session.source.type,
        quality: session.source.qualityHint || 'Auto',
        provider: session.source.providerId,
        headers: {},
      }],
      subtitles: session.source.subtitles.map((s) => ({
        url: deps.workerUrl ? proxyUrl(s.url) : s.url,
        label: s.label,
        format: s.format,
      })),
    }
  })
}
