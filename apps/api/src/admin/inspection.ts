import type { FastifyInstance, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { playbackRefSchema } from '@consumit/contracts'
import { suppliesVideo, validatedSources, type ProviderRegistration } from '@consumit/provider-sdk'
import type { PlaybackStore } from '../playback/state.ts'
import { ApiError } from '../http/errors.ts'
import { isProviderRemoved } from './provider-config.ts'
import type { PlaybackRelay } from '../playback/relay.ts'

const inputSchema = z.strictObject({
  providerId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  ref: playbackRefSchema,
  audioLanguage: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/).default('en'),
  scope: z.enum(['configured', 'scout']).default('configured'),
})

export function registerProviderInspection(app: FastifyInstance, deps: {
  authorize: (request: FastifyRequest) => Promise<unknown>
  guard: (request: FastifyRequest) => void
  providers: readonly ProviderRegistration[]
  catalog?: (() => readonly ProviderRegistration[]) | undefined
  recipes?: readonly { id: string }[] | undefined
  store: PlaybackStore
  region: string
  relay?: PlaybackRelay | undefined
  origin: string
}) {
  app.get('/v1/admin/providers/scout', async (request, reply) => {
    await deps.authorize(request)
    reply.header('cache-control', 'private, no-store')
    return { candidates: (deps.catalog?.() ?? []).map((provider) => ({
      id: provider.adapter.id, mediaKinds: provider.mediaKinds, regions: provider.approvedRegions,
      mediaHosts: provider.mediaHosts, upstreamGroup: provider.upstreamGroup,
      configured: deps.providers.some((row) => row.adapter.id === provider.adapter.id && !isProviderRemoved(row)),
      separateAudio: Boolean(provider.adapter.separateAudio),
    })) }
  })
  app.get('/v1/admin/providers/scout/:id/recipe', async (request, reply) => {
    await deps.authorize(request)
    const { id } = request.params as { id: string }
    const recipe = deps.recipes?.find((row) => row.id === id)
    if (!recipe) throw new ApiError('NOT_FOUND', 'Reviewed provider recipe not found.')
    reply.header('cache-control', 'private, no-store')
    return { recipe: { ...recipe, enabled: false } }
  })
  app.post('/v1/admin/providers/inspect', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (request, reply) => {
    await deps.authorize(request)
    deps.guard(request)
    // The API's ordinary 15s socket limit would close before the adapter's
    // 15s deadline can report a timeout. Keep this authenticated route bounded
    // above that deadline without changing ordinary API connection limits.
    request.raw.setTimeout?.(20_000)
    const parsed = inputSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Choose a reviewed provider, title, and audio language.')
    const input = parsed.data
    // Installed providers use their saved registration even in Scout. A
    // disabled recipe must not silently change a Proxy test into Direct.
    const roster = input.scope === 'scout' ? [...deps.providers, ...(deps.catalog?.() ?? [])] : deps.providers
    const provider = roster.find((row) => row.adapter.id === input.providerId && !isProviderRemoved(row))
    if (!provider || !suppliesVideo(provider) || !provider.mediaKinds.includes(input.ref.kind)) throw new ApiError('BAD_REQUEST', 'Choose a video provider that serves this title kind.')
    if (!provider.approvedRegions.includes(deps.region)) throw new ApiError('BAD_REQUEST', `Provider is not configured for ${deps.region}.`)
    const owner = randomUUID()
    if (!await deps.store.claim(`admin-test:${input.providerId}`, owner, 20)) throw new ApiError('CONFLICT', 'Wait 20 seconds before testing this provider again.', { retryable: true })
    const groupKey = `admin-inspect-group:${provider.upstreamGroup}`
    if (!await deps.store.claim(groupKey, owner, 20)) throw new ApiError('CONFLICT', 'Another test is using this upstream group. Wait and retry.', { retryable: true })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const disconnect = () => { if (!reply.raw.writableEnded) controller.abort() }
    reply.raw.on('close', disconnect)
    const started = performance.now()
    const elapsed = () => Math.round(performance.now() - started)
    try {
      const result = await Promise.race([
        provider.adapter.resolve({ ref: input.ref, region: deps.region, audioLanguage: input.audioLanguage }, controller.signal),
        new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Inspection cancelled')), { once: true })),
      ])
      const valid = result.ok ? validatedSources(result, provider, Date.now()) : []
      const proxy = provider.deliveryMode === 'relay'
      // A disabled provider can be tested in isolation without enabling its
      // live registration. The independent Worker approval still applies.
      const registration = { ...provider, enabled: true }
      const preview = proxy ? valid.find(source => deps.relay?.permits({ source, registration })) : valid[0]
      const expiry = preview ? proxy ? Math.min(Date.parse(preview.expiresAt) - 5000, Date.now() + 90_000) : Date.parse(preview.expiresAt) : 0
      const previewSrc = preview ? proxy ? await deps.relay?.issue({ source: preview, registration, subtitles: [], delivery: 'direct' }, expiry, deps.origin) : preview.url : undefined
      reply.header('cache-control', 'private, no-store')
      return {
        providerId: input.providerId, ok: valid.length > 0 && (!proxy || Boolean(previewSrc)), elapsedMs: elapsed(), region: deps.region,
        delivery: provider.deliveryMode ?? 'direct',
        code: proxy && valid.length && !previewSrc ? 'proxy_unavailable' : result.ok ? valid.length ? 'resolved' : 'invalid_sources' : result.code,
        rejectedSources: result.ok ? result.sources.length - valid.length : 0,
        sources: valid.map((source) => ({ key: source.key, type: source.type, language: source.language,
          host: new URL(source.url).hostname, qualityHint: source.qualityHint, subtitleCount: source.subtitles.length })),
        // Private, ephemeral browser preview. Never put this field in reports, telemetry or logs.
        ...(preview && previewSrc ? { preview: { src: previewSrc, type: preview.type, qualityHint: preview.qualityHint, expiresAt: new Date(expiry).toISOString(), delivery: proxy ? 'relay' : 'direct' } } : {}),
      }
    } catch {
      reply.header('cache-control', 'private, no-store')
      return { providerId: input.providerId, ok: false, code: controller.signal.aborted ? 'timeout' : 'error', elapsedMs: elapsed(), region: deps.region, rejectedSources: 0, sources: [] }
    } finally {
      clearTimeout(timeout)
      reply.raw.off('close', disconnect)
      await deps.store.release(groupKey, owner)
    }
  })
}
