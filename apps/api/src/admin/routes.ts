import type { FastifyInstance, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { playbackRefSchema, providerRoleSchema, providerDeliveryModeSchema, type PlaybackRef } from '@consumit/contracts'

import type { ApiEnv } from '../config/env.ts'
import { isAllowedOrigin } from '../http/csrf.ts'
import { ApiError } from '../http/errors.ts'
import { requestMember } from '../http/request-member.ts'
import type { Identity } from '../identity/identity.ts'
import type { IdentityRepository } from '../identity/repository.ts'
import { sessionCookieName } from '../identity/session.ts'
import type { ProbeStatus } from '../playback/probe.ts'
import type { PlaybackStore } from '../playback/state.ts'
import { validatedSources, suppliesVideo, type ProviderRegistration } from '@consumit/provider-sdk'
import type { Playback } from '../playback/playback.ts'
import type { SubtitleService } from '../subtitles/subtitles.ts'
import type { ProviderConfigStore } from './provider-config.ts'
import { applyOrdersInPlace, applyOverridesInPlace, configuredProviderRegions, isProviderRemoved, orderedProviderIds, providerKinds, type ProviderKind, type ProviderOverridePatch } from './provider-config.ts'
import { aggregateProviderMetrics, readProviderAlerts, readProviderMetrics, type MetricsSnapshot } from './provider-metrics.ts'
import { registerProviderInspection } from './inspection.ts'
import { createMemoryPlaybackStore } from '../playback/state.ts'
import { createPlaybackRelay } from '../playback/relay.ts'

function parseBody<T extends Record<string, unknown>>(request: FastifyRequest, fields: (keyof T)[]): T {
  const body = request.body as Record<string, unknown> | undefined
  if (!body || typeof body !== 'object') throw new ApiError('BAD_REQUEST', 'Request body required.')
  for (const field of fields) {
    if (body[field as string] === undefined) throw new ApiError('BAD_REQUEST', `Missing field: ${String(field)}.`)
  }
  return body as T
}

export function registerAdminRoutes(
  app: FastifyInstance,
  deps: { env: ApiEnv; identity: Identity; repository?: IdentityRepository | undefined; providers?: readonly ProviderRegistration[] | undefined; scoutCatalog?: (() => readonly ProviderRegistration[]) | undefined; scoutRecipes?: readonly { id: string }[] | undefined; providerOrders?: Record<ProviderKind, string[]> | undefined; playbackStore?: PlaybackStore | undefined; playback?: Playback | undefined; subtitles?: SubtitleService | undefined; providerConfig?: ProviderConfigStore | undefined; probeStatus?: (() => Promise<ProbeStatus> | ProbeStatus) | undefined },
) {
  const { env, identity, repository, providers = [], providerOrders, playbackStore, playback, subtitles, providerConfig, probeStatus } = deps
  const cookieName = sessionCookieName(env)
  let metricsCache: { at: number; data: MetricsSnapshot | null } | null = null
  let metricsPending: Promise<MetricsSnapshot | null> | null = null
  async function metricsSnapshot(): Promise<MetricsSnapshot | null> {
    if (!env.adminMetricsUrl) return null
    if (metricsCache && Date.now() - metricsCache.at < 15_000) return metricsCache.data
    // Health and metrics panels load together. Share their bounded query batch,
    // including a short negative cache when the optional collector is offline.
    metricsPending ??= readProviderMetrics(env.adminMetricsUrl).catch(() => null).then(data => {
      metricsCache = { at: Date.now(), data }; return data
    }).finally(() => { metricsPending = null })
    return metricsPending
  }

  function guardMutation(request: FastifyRequest) {
    if (!isAllowedOrigin(request.headers, env.appOrigin, env.nodeEnv !== 'production')) {
      throw new ApiError('FORBIDDEN', 'Cross-site requests are not allowed.')
    }
  }

  async function requireAdmin(request: FastifyRequest) {
    const token = request.cookies?.[cookieName]
    if (typeof token !== 'string' || token.length === 0) {
      throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.')
    }
    const member = await requestMember(request, identity, cookieName)
    if (!member) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.')
    if (member.role !== 'admin') throw new ApiError('FORBIDDEN', 'Admin access required.')
    return member
  }

  registerProviderInspection(app, { authorize: requireAdmin, guard: guardMutation, providers,
    catalog: deps.scoutCatalog, recipes: deps.scoutRecipes, store: playbackStore ?? createMemoryPlaybackStore(), region: env.tmdbRegion, origin: env.appOrigin,
    relay: env.playback?.relay ? createPlaybackRelay(env.playback.relay) : undefined })

  // --- Provider management ---

  app.get('/v1/admin/subtitles', async (request, reply) => {
    await requireAdmin(request)
    reply.header('cache-control', 'private, no-store')
    return { providers: subtitles?.discovery?.diagnostics() ?? [] }
  })

  app.post('/v1/admin/subtitles/test', { config: { rateLimit: { max: 4, timeWindow: '1 minute' } } }, async (request, reply) => {
    await requireAdmin(request)
    guardMutation(request)
    const parsed = playbackRefSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Choose a movie or an exact episode to test.')
    const discovery = subtitles?.discovery
    if (!discovery) throw new ApiError('BAD_REQUEST', 'Subtitle discovery is unavailable.')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 14_000)
    let searchId = ''
    let languages: { code: string; count: number }[] = []
    try {
      for await (const event of discovery.discover(parsed.data, controller.signal)) {
        searchId = event.searchId
        languages = event.languages
      }
      const candidates = await discovery.testCandidates(searchId)
      await Promise.allSettled(candidates.map((candidateId) => discovery.prepare(searchId, candidateId, controller.signal)))
      reply.header('cache-control', 'private, no-store')
      return { providers: discovery.diagnostics(), languages: languages.length, tracks: languages.reduce((total, language) => total + language.count, 0) }
    } finally { clearTimeout(timer) }
  })

  app.get('/v1/admin/providers', async (request, reply) => {
    await requireAdmin(request)
    void reply.header('cache-control', 'private, no-store')
    return {
      readiness: {
        configuredRows: providers.filter((provider) => !isProviderRemoved(provider)).length,
        enabledRows: providers.filter((provider) => provider.enabled).length,
        removedRows: providers.filter(isProviderRemoved).length,
      },
      providers: providers.map((p) => ({
        id: p.adapter.id,
        removed: isProviderRemoved(p),
        enabled: p.enabled,
        role: p.role ?? 'video',
        deliveryMode: p.deliveryMode ?? 'direct',
        proxyApproved: Boolean(env.playback?.relay?.providers[p.adapter.id]?.length),
        audioCapabilities: { separateAudio: 'unverified', languages: [...p.adapter.audioLanguages ?? []], health: 'untested' },
        regions: [...p.approvedRegions],
        configuredRegions: [...configuredProviderRegions(p)],
        mediaHosts: [...p.mediaHosts],
        upstreamGroup: p.upstreamGroup,
        concurrency: p.concurrency,
        requestsPerMinute: p.requestsPerMinute,
        priority: p.priority ?? 0,
        mediaKinds: [...p.mediaKinds],
      })),
    }
  })

  app.get('/v1/admin/providers/health', async (request, reply) => {
    await requireAdmin(request)
    void reply.header('cache-control', 'private, no-store')
    const probed = await probeStatus?.() ?? {}
    const metrics = await metricsSnapshot()
    const kinds = ['movie', 'series', 'anime'] as const
    const result: Record<string, Array<{ id: string; region: string; enabled: boolean; probe: ProbeStatus[string] | null; status: 'healthy' | 'degraded' | 'down' | 'unknown' | 'disabled'; circuit: { failures: number; playbackFailures: number; openUntil: number; outcomes: number; success: number; latencyMs: number } | null }>> = {}
    for (const kind of kinds) {
      const circuits = playback?.providerStatus?.(kind) ?? []
      result[kind] = providers
        .filter((p) => !isProviderRemoved(p) && suppliesVideo(p) && p.mediaKinds.includes(kind))
        .flatMap((p) => [...new Set(p.approvedRegions)].map((region) => {
          const probe = probed[`${p.adapter.id}:${kind}:${region}`] ?? null
          const current = circuits.find((entry) => entry.id === p.adapter.id)
          const open = Boolean(current && current.openUntil > Date.now())
          const fresh = Boolean(probe && Date.now() - probe.at <= Math.max(10 * 60_000, (env.playback?.probeIntervalMs ?? 0) * 2))
          const trend = metrics ? aggregateProviderMetrics(metrics, p.adapter.id, kind, region) : null
          const observations = (trend?.starts ?? 0) + (trend?.playbackFailures ?? 0)
          const failureShare = observations ? (trend?.playbackFailures ?? 0) / observations : 0
          const status = !p.enabled ? 'disabled' : fresh && !probe?.ok && open || observations >= 10 && failureShare >= 0.5 ? 'down' : !fresh ? 'unknown' : !probe?.ok || open || observations >= 10 && failureShare >= 0.1 ? 'degraded' : observations >= 10 ? 'healthy' : 'unknown'
          return { id: p.adapter.id, region, enabled: p.enabled, probe, status, circuit: current ? { failures: current.failures, playbackFailures: current.playbackFailures, openUntil: current.openUntil, outcomes: current.outcomes, success: current.success, latencyMs: current.latency } : null }
        }))
    }
    return result
  })

  app.get('/v1/admin/providers/metrics', async (request, reply) => {
    await requireAdmin(request)
    void reply.header('cache-control', 'private, no-store')
    const data = await metricsSnapshot()
    return { available: data !== null, windowMinutes: 15, metrics: data ?? {} }
  })

  app.get('/v1/admin/providers/alerts', async (request, reply) => {
    await requireAdmin(request)
    void reply.header('cache-control', 'private, no-store')
    if (!env.adminMetricsUrl) return { available: false, alerts: [] }
    try { return { available: true, alerts: await readProviderAlerts(env.adminMetricsUrl) } }
    catch { return { available: false, alerts: [] } }
  })

  app.post('/v1/admin/providers/:id/retest', async (request) => {
    guardMutation(request)
    await requireAdmin(request)
    const { id } = request.params as { id: string }
    const provider = providers.find((entry) => entry.adapter.id === id && !isProviderRemoved(entry))
    if (!provider) throw new ApiError('NOT_FOUND', 'Provider not found.')
    if (!suppliesVideo(provider)) throw new ApiError('BAD_REQUEST', 'This provider is assigned to audio. Separate audio verification is not available yet.')
    const body = request.body as { region?: unknown; kind?: unknown } | undefined
    const requestedRegion = body?.region ?? env.tmdbRegion
    if (typeof requestedRegion !== 'string' || !/^[A-Z]{2}$/.test(requestedRegion) || !provider.approvedRegions.includes(requestedRegion)) throw new ApiError('BAD_REQUEST', 'Choose a configured provider region.')
    const kind = body?.kind ?? provider.mediaKinds[0]
    if (kind !== 'movie' && kind !== 'series' && kind !== 'anime' || !provider.mediaKinds.includes(kind)) throw new ApiError('BAD_REQUEST', 'Choose a supported title kind.')
    const lock = randomUUID()
    if (playbackStore && !await playbackStore.claim(`admin-retest-cooldown:${id}:${kind}:${requestedRegion}`, lock, 60)) throw new ApiError('CONFLICT', 'Please wait a minute before retesting this provider.', { retryable: true })
    if (!playbackStore || !await playbackStore.claim(`admin-retest:${id}:${kind}:${requestedRegion}`, lock, 60)) throw new ApiError('CONFLICT', 'A provider retest is already running.', { retryable: true })
    try {
      const ref = kind === 'anime' ? { kind, id: 21, episode: 1 } as const : kind === 'series' ? { kind, id: 1399, season: 1, episode: 1 } as const : { kind, id: 550 } as const
      const controller = new AbortController()
      const budgetMs = Math.min(Math.max(provider.attemptMs ?? 10_000, 10_000), 15_000)
      const timeout = setTimeout(() => controller.abort(), budgetMs)
      try {
        const started = Date.now()
        const result = await Promise.race([
          provider.adapter.resolve({ ref, region: requestedRegion, audioLanguage: 'en' }, controller.signal),
          new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })),
        ])
        const playable = result.ok && validatedSources(result, provider, Date.now()).length > 0
        const record = { ok: playable, ms: Date.now() - started, at: started, ...(!result.ok ? { code: result.code } : !playable ? { code: 'invalid-source' } : {}) }
        await playbackStore.set(`probe:${id}:${kind}:${requestedRegion}`, JSON.stringify(record), 1800)
        return { providerId: id, kind, region: requestedRegion, ...record }
      } catch {
        const record = { ok: false, ms: budgetMs, at: Date.now(), code: controller.signal.aborted ? 'timeout' : 'error' }
        await playbackStore.set(`probe:${id}:${kind}:${requestedRegion}`, JSON.stringify(record), 1800)
        return { providerId: id, kind, region: requestedRegion, ...record }
      } finally { clearTimeout(timeout) }
    } finally { await playbackStore.release(`admin-retest:${id}:${kind}:${requestedRegion}`, lock) }
  })

  app.post('/v1/admin/providers/:id/circuit/reset', async (request) => {
    guardMutation(request)
    await requireAdmin(request)
    const { id } = request.params as { id: string }
    const body = parseBody<{ kind: 'movie' | 'series' | 'anime' }>(request, ['kind'])
    const provider = providers.find((entry) => entry.adapter.id === id && !isProviderRemoved(entry) && entry.mediaKinds.includes(body.kind))
    if (!provider || !['movie', 'series', 'anime'].includes(body.kind)) throw new ApiError('BAD_REQUEST', 'Choose a supported provider and title kind.')
    if (!playback?.resetProviderCircuit) throw new ApiError('PLAYBACK_UNAVAILABLE', 'Provider controls are unavailable.', { retryable: true })
    await playback.resetProviderCircuit(id, body.kind)
    return { id, kind: body.kind, reset: true }
  })

  app.post('/v1/admin/providers/test', async (request) => {
    guardMutation(request)
    await requireAdmin(request)
    const body = parseBody<{ providerId: string; ref: PlaybackRef; audioLanguage?: string }>(request, ['providerId', 'ref'])
    const parsedRef = playbackRefSchema.safeParse(body.ref)
    if (!parsedRef.success) throw new ApiError('BAD_REQUEST', 'Choose a valid movie or episode.')
    if (body.audioLanguage && !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(body.audioLanguage)) throw new ApiError('BAD_REQUEST', 'Choose a valid audio language.')
    const provider = providers.find((p) => p.adapter.id === body.providerId && !isProviderRemoved(p))
    if (!provider) throw new ApiError('BAD_REQUEST', `Provider "${body.providerId}" not found.`)
    if (!suppliesVideo(provider)) throw new ApiError('BAD_REQUEST', 'This provider is assigned to audio. Separate audio verification is not available yet.')
    if (!provider.mediaKinds.includes(parsedRef.data.kind)) throw new ApiError('BAD_REQUEST', 'Provider does not serve this title kind.')
    if (playbackStore && !await playbackStore.claim(`admin-test:${body.providerId}`, randomUUID(), 15)) throw new ApiError('CONFLICT', 'Please wait before testing this provider again.', { retryable: true })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new DOMException('Test timed out', 'TimeoutError')), 15_000)
    try {
      const result = await Promise.race([
        provider.adapter.resolve({ ref: parsedRef.data, region: env.tmdbRegion, audioLanguage: body.audioLanguage ?? 'en' }, controller.signal),
        new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })),
      ])
      const valid = result.ok ? validatedSources(result, provider, Date.now()) : []
      return {
        providerId: body.providerId,
        ok: result.ok && valid.length > 0,
        ...(result.ok ? { sourceCount: valid.length, sources: valid.map((s) => ({ key: s.key, type: s.type, language: s.language, qualityHint: s.qualityHint })) } : { code: result.code, retryable: result.retryable }),
      }
    } catch {
      return { providerId: body.providerId, ok: false, code: 'error', error: 'Provider resolution failed.' }
    } finally {
      clearTimeout(timeout)
    }
  })

  // --- Provider config (runtime overrides) ---

  if (providerConfig) {
    // Removal is a durable tombstone over the configured adapter. Never edit
    // the base media file or erase member progress and playback sessions.
    async function setRemoved(request: FastifyRequest, removed: boolean) {
      guardMutation(request)
      const actor = await requireAdmin(request)
      const { id } = request.params as { id: string }
      if (!providers.some((provider) => provider.adapter.id === id)) throw new ApiError('NOT_FOUND', 'Provider not found.')
      try { await providerConfig!.setOverride(id, { removed, enabled: false }, actor.id) }
      catch (cause) {
        if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'P2034') throw new ApiError('CONFLICT', 'Provider settings changed concurrently. Refresh and retry.', { retryable: true })
        throw new ApiError('INTERNAL', 'Provider change was not saved. No change was applied.', { cause })
      }
      const overrides = await providerConfig!.getAll()
      applyOverridesInPlace(providers, overrides)
      if (providerOrders) applyOrdersInPlace(providerOrders, providers, overrides)
      return { id, removed, enabled: false }
    }
    app.delete('/v1/admin/providers/:id', (request) => setRemoved(request, true))
    app.post('/v1/admin/providers/:id/restore', (request) => setRemoved(request, false))

    app.get('/v1/admin/providers/order/:kind', async (request, reply) => {
      await requireAdmin(request)
      const { kind } = request.params as { kind: ProviderKind }
      if (!providerKinds.includes(kind)) throw new ApiError('BAD_REQUEST', 'Choose Movies, Series, or Anime.')
      reply.header('cache-control', 'private, no-store')
      return { kind, providerIds: orderedProviderIds(providers, await providerConfig.getAll(), kind), revision: await providerConfig.getRevision?.() ?? 0 }
    })

    app.put('/v1/admin/providers/order/:kind', async (request) => {
      guardMutation(request)
      const actor = await requireAdmin(request)
      const { kind } = request.params as { kind: ProviderKind }
      if (!providerKinds.includes(kind)) throw new ApiError('BAD_REQUEST', 'Choose Movies, Series, or Anime.')
      const body = request.body as { providerIds?: unknown; revision?: unknown } | undefined
      const expected = providers.filter((provider) => !isProviderRemoved(provider) && suppliesVideo(provider) && provider.mediaKinds.includes(kind)).map((provider) => provider.adapter.id)
      if (!Array.isArray(body?.providerIds) || body.providerIds.length !== expected.length || new Set(body.providerIds).size !== expected.length || !body.providerIds.every((id) => typeof id === 'string' && expected.includes(id))) throw new ApiError('BAD_REQUEST', 'Send each configured provider for this kind exactly once.')
      if (!Number.isInteger(body.revision) || (body.revision as number) < 0) throw new ApiError('BAD_REQUEST', 'Provide the current order revision.')
      if (!providerConfig.setOrder) throw new ApiError('PLAYBACK_UNAVAILABLE', 'Provider ordering is unavailable.')
      let saved: boolean
      try { saved = await providerConfig.setOrder(kind, body.providerIds, body.revision as number, actor.id) }
      catch (cause) {
        if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'P2034') throw new ApiError('CONFLICT', 'Provider order changed. Refresh and retry.', { retryable: true })
        throw cause
      }
      if (!saved) throw new ApiError('CONFLICT', 'Provider order changed. Refresh and retry.', { retryable: true })
      const overrides = await providerConfig.getAll()
      if (providerOrders) applyOrdersInPlace(providerOrders, providers, overrides)
      return { kind, providerIds: orderedProviderIds(providers, overrides, kind), revision: await providerConfig.getRevision?.() ?? 0 }
    })

    app.get('/v1/admin/providers/changes', async (request, reply) => {
      await requireAdmin(request)
      void reply.header('cache-control', 'private, no-store')
      return { changes: providerConfig.listChanges ? await providerConfig.listChanges(30) : [] }
    })

    app.get('/v1/admin/providers/config', async (request, reply) => {
      await requireAdmin(request)
      void reply.header('cache-control', 'private, no-store')
      const overrides = await providerConfig.getAll()
      return { overrides }
    })

    app.patch('/v1/admin/providers/:id/config', async (request) => {
      guardMutation(request)
      const actor = await requireAdmin(request)
      const { id } = request.params as { id?: string }
      const provider = providers.find((provider) => provider.adapter.id === id && !isProviderRemoved(provider))
      if (!id || !provider) throw new ApiError('BAD_REQUEST', 'Choose a configured provider. Restore a removed provider before editing it.')
      const body = request.body as Record<string, unknown> ?? {}
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((field) => !['enabled', 'role', 'deliveryMode', 'priority', 'regions', 'requestsPerMinute', 'concurrency'].includes(field))) throw new ApiError('BAD_REQUEST', 'Provide supported provider settings only.')
      const patch: ProviderOverridePatch = {}
      if ('deliveryMode' in body) {
        const parsed = providerDeliveryModeSchema.safeParse(body.deliveryMode)
        if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Choose Direct, Proxy or Embed video delivery.')
        // Classification never grants hosts or activates the Worker. An
        // unapproved proxy row is excluded from playback by the relay gate.
        const frame = ['reanimeframe', 'megaplayframe', 'apiplayerframe', 'embedapiframe', 'vsembedframe'].includes(provider.adapter.id)
        if (frame !== (parsed.data === 'embed')) throw new ApiError('BAD_REQUEST', 'Embed delivery belongs to frame providers; media providers use Direct or Proxy.')
        patch.deliveryMode = parsed.data
      }
      if ('role' in body) {
        const parsed = providerRoleSchema.safeParse(body.role)
        if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Choose Video source, Audio source, or Both.')
        patch.role = parsed.data
      }
      if ('enabled' in body) {
        if (typeof body.enabled !== 'boolean') throw new ApiError('BAD_REQUEST', 'Enabled must be true or false.')
        patch.enabled = body.enabled
      }
      if ('priority' in body) {
        const p = body.priority
        if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p > 100) throw new ApiError('BAD_REQUEST', 'Priority must be an integer from 0-100.')
        patch.priority = p
      }
      if ('regions' in body) {
        const r = body.regions
        if (!Array.isArray(r) || r.length === 0 || r.length > 16 || new Set(r).size !== r.length || !r.every((v) => typeof v === 'string' && /^[A-Z]{2}$/.test(v) && configuredProviderRegions(provider).includes(v))) {
          throw new ApiError('BAD_REQUEST', 'Choose one or more distinct regions from the base provider configuration.')
        }
        patch.regions = r
      }
      if ('requestsPerMinute' in body) {
        const rpm = body.requestsPerMinute
        if (typeof rpm !== 'number' || !Number.isInteger(rpm) || rpm < 1 || rpm > 120) throw new ApiError('BAD_REQUEST', 'RPM must be an integer from 1-120.')
        patch.requestsPerMinute = rpm
      }
      if ('concurrency' in body) {
        const c = body.concurrency
        if (typeof c !== 'number' || !Number.isInteger(c) || c < 1 || c > 4) throw new ApiError('BAD_REQUEST', 'Concurrency must be an integer from 1-4.')
        patch.concurrency = c
      }
      if (Object.keys(patch).length === 0) throw new ApiError('BAD_REQUEST', 'Provide at least one field to update.')
      try { await providerConfig.setOverride(id, patch, actor.id) }
      catch (cause) {
        if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'P2034') throw new ApiError('CONFLICT', 'Provider settings changed concurrently. Refresh and retry.', { retryable: true })
        throw new ApiError('INTERNAL', 'Provider settings were not saved. No change was applied.', { cause })
      }
      const overrides = await providerConfig.getAll()
      applyOverridesInPlace(providers, overrides)
      if (providerOrders) applyOrdersInPlace(providerOrders, providers, overrides)
      return { id, ...patch }
    })

    app.delete('/v1/admin/providers/:id/config', async (request, reply) => {
      guardMutation(request)
      const actor = await requireAdmin(request)
      const { id } = request.params as { id?: string }
      if (!id || !providers.some((provider) => provider.adapter.id === id)) throw new ApiError('BAD_REQUEST', 'Choose a configured provider.')
      try { await providerConfig.removeOverride(id, actor.id) }
      catch (cause) {
        if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'P2034') throw new ApiError('CONFLICT', 'Provider settings changed concurrently. Refresh and retry.', { retryable: true })
        throw new ApiError('INTERNAL', 'Provider settings were not reset. No change was applied.', { cause })
      }
      // Hot-apply: restore provider to base config
      const overrides = await providerConfig.getAll()
      applyOverridesInPlace(providers, overrides)
      if (providerOrders) applyOrdersInPlace(providerOrders, providers, overrides)
      return reply.code(204).send()
    })
  }

  // --- Member management ---

  if (repository) {
    app.get('/v1/admin/members', async (request, reply) => {
      await requireAdmin(request)
      void reply.header('cache-control', 'private, no-store')
      const query = request.query as { limit?: string; offset?: string }
      const limit = Math.min(Math.max(parseInt(query.limit ?? '50', 10) || 50, 1), 200)
      const offset = Math.max(parseInt(query.offset ?? '0', 10) || 0, 0)
      const { members, total } = await repository.listAll(limit, offset)
      return {
        members: members.map((m) => ({
          id: m.id,
          email: m.email,
          username: m.profile.username,
          displayName: m.profile.displayName,
          role: m.role === 'ADMIN' ? 'admin' : 'member',
          createdAt: m.createdAt.toISOString(),
          emailVerified: m.emailVerifiedAt !== null,
        })),
        total,
        limit,
        offset,
      }
    })

    app.post('/v1/admin/members/:id/role', async (request) => {
      guardMutation(request)
      const actor = await requireAdmin(request)
      const { id } = request.params as { id?: string }
      if (!id) throw new ApiError('BAD_REQUEST', 'Member ID required.')
      const { role } = parseBody<{ role: string }>(request, ['role'])
      if (role !== 'admin' && role !== 'member') throw new ApiError('BAD_REQUEST', 'Role must be "admin" or "member".')
      if (id === actor.id && role === 'member') throw new ApiError('BAD_REQUEST', 'You cannot remove your own admin access.')
      const updated = await repository.setRole(id, role === 'admin' ? 'ADMIN' : 'MEMBER')
      if (!updated) throw new ApiError('NOT_FOUND', 'Member not found.')
      return { id: updated.id, role: updated.role === 'ADMIN' ? 'admin' : 'member' }
    })
  }

  // --- Service health ---

  app.get('/v1/admin/health', async (request, reply) => {
    await requireAdmin(request)
    void reply.header('cache-control', 'private, no-store')
    const result: { api: 'ok'; store: 'ok' | 'error' } = { api: 'ok', store: 'ok' }
    if (playbackStore) {
      try {
        await playbackStore.set('_health_check', '1', 10)
        await playbackStore.get('_health_check')
      } catch {
        result.store = 'error'
      }
    }
    return result
  })
}
