import type { FastifyInstance } from 'fastify'
import { authorizedInternal } from '@consumit/server'
import { providerStateSchema, catalogContextRequestSchema, subtitleCatalogRequestSchema, resolverMetadataSchema, animeContextSchema, backgroundOperationSchema } from '@consumit/contracts/internal'
import type { ApiEnv } from '../config/env.ts'
import type { ProviderConfigStore } from '../admin/provider-config.ts'
import type { AnimeCatalog } from '../catalog/anilist/adapter.ts'
import type { CloudflareResolverOptions } from '../playback/cloudflare-resolver.ts'
import type { TitleMetadataResolver } from '../playback/tmdb-metadata.ts'
import type { SubtitleCatalog } from '../subtitles/catalog.ts'
import { ApiError } from '../http/errors.ts'

export function registerProductInternal(app: FastifyInstance, deps: { env: ApiEnv; config?: ProviderConfigStore | undefined; anime: Pick<AnimeCatalog, 'title'>; metadata: CloudflareResolverOptions['metadata']; tmdb?: TitleMetadataResolver | undefined; subtitles?: SubtitleCatalog | undefined; releaseRefresh: () => Promise<void>; catalogCleanup: () => Promise<void> }) {
  if (!deps.env.internal) return
  const options = { config: { rateLimit: false as const }, preHandler: async (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    reply.header('cache-control', 'private, no-store')
    if (!authorizedInternal(request.headers.authorization, deps.env.internal?.secret)) throw new ApiError('FORBIDDEN', 'This internal request is not allowed.')
  } }
  app.post('/v1/internal/playback/config', options, async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const revision = await deps.config?.getRevision?.() ?? 0
      const overrides = await deps.config?.getAll() ?? {}
      if (revision === (await deps.config?.getRevision?.() ?? 0)) return providerStateSchema.parse({ revision, overrides })
    }
    throw new ApiError('PLAYBACK_UNAVAILABLE', 'Provider configuration is changing. Retry shortly.', { retryable: true })
  })
  app.post('/v1/internal/playback/catalog', options, async request => {
    const parsed = catalogContextRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid canonical reference.')
    const { mode, ref, providerId } = parsed.data
    if (mode === 'anime' && ref.kind === 'anime') return animeContextSchema.parse(await deps.anime.title(Number(ref.id)))
    if (mode === 'tmdb' && ref.kind !== 'anime' && deps.tmdb) return resolverMetadataSchema.parse(await deps.tmdb(ref, AbortSignal.timeout(5000)))
    if (mode === 'worker' && providerId) return resolverMetadataSchema.parse(await deps.metadata(providerId, ref, AbortSignal.timeout(5000)))
    throw new ApiError('BAD_REQUEST', 'Use a compatible metadata operation.')
  })
  app.post('/v1/internal/playback/subtitles', options, async request => {
    const parsed = subtitleCatalogRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use bounded subtitle metadata.')
    if (parsed.data.operation === 'find') return await deps.subtitles?.find(parsed.data.ref, parsed.data.langs) ?? []
    await deps.subtitles?.save(parsed.data.ref, parsed.data.tracks)
    return { saved: true }
  })
  app.post('/v1/internal/jobs/run', options, async request => {
    const parsed = backgroundOperationSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a known background operation.')
    if (parsed.data.operation === 'release.refresh') await deps.releaseRefresh()
    else if (parsed.data.operation === 'catalog.cleanup') await deps.catalogCleanup()
    else throw new ApiError('BAD_REQUEST', 'This operation belongs to playback.')
    return { completed: true }
  })
}

