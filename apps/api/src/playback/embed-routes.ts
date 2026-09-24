import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { ProviderRegistration } from '@consumit/provider-sdk'
import { ApiError } from '../http/errors.ts'
import { proxyUrl } from './embed-tokens.ts'
import type { Playback } from './playback.ts'

const tmdbIdParam = z.object({ tmdbId: z.string().regex(/^\d{1,12}$/) })
const tvParams = z.object({ tmdbId: z.string().regex(/^\d{1,12}$/), season: z.string().regex(/^\d{1,4}$/), episode: z.string().regex(/^\d{1,4}$/) })
/** Optional preferred language for provider resolution (`?lang=it`). */
const langQuery = z.object({ lang: z.string().regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i).max(16).optional() })

function audioLanguageFrom(request: { query: unknown }): string {
  const parsed = langQuery.safeParse(request.query ?? {})
  return parsed.success && parsed.data.lang ? parsed.data.lang.toLowerCase() : 'en'
}

export function registerEmbedRoutes(app: FastifyInstance, deps: {
  playback: Playback
  workerUrl: string | undefined
  hmacSecret: string | undefined
  providers: readonly ProviderRegistration[]
}) {
  const rateLimitConfig = { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }

  function sourceUrl(rawUrl: string, providerId: string): string {
    if (!deps.workerUrl) return rawUrl
    const provider = deps.providers.find((entry) => entry.adapter.id === providerId)
    if (!provider || !deps.hmacSecret) throw new ApiError('PLAYBACK_UNAVAILABLE', 'The playback source is temporarily unavailable.', { retryable: true })
    if (!provider.proxy) return rawUrl
    const worker = new URL(deps.workerUrl)
    const candidate = new URL(rawUrl)
    if (candidate.origin === worker.origin && candidate.pathname === '/proxy' && candidate.searchParams.has('token')) return rawUrl
    return proxyUrl(deps.workerUrl, deps.hmacSecret, rawUrl, provider)
  }

  app.get('/v1/embed/movie/:tmdbId', rateLimitConfig, async (request, reply) => {
    const parsed = tmdbIdParam.safeParse(request.params)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Provide a valid TMDB movie ID.')

    const controller = new AbortController()
    request.raw.on('close', () => controller.abort())
    const session = await deps.playback.resolve(`embed:${randomUUID()}`, {
      ref: { kind: 'movie', id: Number(parsed.data.tmdbId) },
      capabilities: { hls: true, dash: true, native: true, nativeHls: true },
      audioLanguage: audioLanguageFrom(request),
    }, controller.signal)

    reply.header('cache-control', 'public, max-age=60')
    reply.header('access-control-allow-origin', '*')
    return {
      success: true,
      type: 'movie',
      tmdbId: parsed.data.tmdbId,
      title: session.ref.id,
      sources: [{
        url: sourceUrl(session.source.src, session.source.providerId),
        type: session.source.type,
        quality: session.source.qualityHint || 'Auto',
        provider: session.source.providerId,
        headers: {},
      }],
      subtitles: session.source.subtitles.map((s) => ({
        url: sourceUrl(s.url, session.source.providerId),
        label: s.label,
        format: s.format,
      })),
    }
  })

  app.get('/v1/embed/tv/:tmdbId/:season/:episode', rateLimitConfig, async (request, reply) => {
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
      audioLanguage: audioLanguageFrom(request),
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
        url: sourceUrl(session.source.src, session.source.providerId),
        type: session.source.type,
        quality: session.source.qualityHint || 'Auto',
        provider: session.source.providerId,
        headers: {},
      }],
      subtitles: session.source.subtitles.map((s) => ({
        url: sourceUrl(s.url, session.source.providerId),
        label: s.label,
        format: s.format,
      })),
    }
  })
}
