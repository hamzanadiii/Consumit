import { randomUUID } from 'node:crypto'
import type { ApiEnv } from '../../api/src/config/env.ts'
import { ApiError } from '../../api/src/http/errors.ts'
import { inspectProviderSources } from '../../api/src/playback/inspection.ts'
import { createPlaybackRelay } from '../../api/src/playback/relay.ts'
import { isProviderRemoved } from '../../api/src/admin/provider-config.ts'
import { aggregateProviderMetrics, readProviderMetrics, type MetricsSnapshot } from '../../api/src/admin/provider-metrics.ts'
import { suppliesVideo, validatedSources, type ProviderRegistration } from '@consumit/provider-sdk'
import type { DiagnosticOperation } from '@consumit/contracts/internal'
import type { PlaybackRef } from '@consumit/contracts'
import type { ProbeStatus } from '../../api/src/playback/probe.ts'
import type { SubtitleService } from '../../api/src/subtitles/subtitles.ts'
import type { Playback } from '../../api/src/playback/playback.ts'
import type { PlaybackStore } from '../../api/src/playback/state.ts'

export type DiagnosticResult = { statusCode: number; body: unknown }
type ScoutCatalog = (() => readonly ProviderRegistration[]) | undefined

const statusByCode: Record<string, number> = { BAD_REQUEST: 400, NOT_FOUND: 404, CONFLICT: 409, PLAYBACK_UNAVAILABLE: 503 }
function errorResult(error: unknown): DiagnosticResult {
  if (error instanceof ApiError) return { statusCode: statusByCode[error.code] ?? 500, body: { error: error.code } }
  return { statusCode: 502, body: { error: 'PLAYBACK_UNAVAILABLE' } }
}

export function createDiagnostics(deps: {
  env: ApiEnv
  providers: readonly ProviderRegistration[]
  store: PlaybackStore
  playback: Playback
  subtitles: SubtitleService
  probeStatus?: (() => Promise<ProbeStatus>) | undefined
  scoutCatalog?: ScoutCatalog
  scoutRecipes?: readonly { id: string }[]
}) {
  const { env, providers, store, playback, subtitles } = deps
  let metricsCache: { at: number; data: MetricsSnapshot | null } | null = null
  let metricsPending: Promise<MetricsSnapshot | null> | null = null
  async function metricsSnapshot(): Promise<MetricsSnapshot | null> {
    if (!env.adminMetricsUrl) return null
    if (metricsCache && Date.now() - metricsCache.at < 15_000) return metricsCache.data
    metricsPending ??= readProviderMetrics(env.adminMetricsUrl).catch(() => null).then(data => {
      metricsCache = { at: Date.now(), data }; return data
    }).finally(() => { metricsPending = null })
    return metricsPending
  }

  function findProvider(providerId: string): ProviderRegistration {
    const provider = providers.find((entry) => entry.adapter.id === providerId && !isProviderRemoved(entry))
    if (!provider) throw new ApiError('NOT_FOUND', 'Provider not found.')
    return provider
  }

  async function subtitlesList(): Promise<DiagnosticResult> {
    return { statusCode: 200, body: { providers: subtitles.discovery?.diagnostics() ?? [] } }
  }

  async function subtitlesTest(ref: PlaybackRef): Promise<DiagnosticResult> {
    const discovery = subtitles.discovery
    if (!discovery) throw new ApiError('BAD_REQUEST', 'Subtitle discovery is unavailable.')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 14_000)
    let searchId = ''
    let languages: { code: string; count: number }[] = []
    try {
      for await (const event of discovery.discover(ref, controller.signal)) {
        searchId = event.searchId
        languages = event.languages
      }
      const candidates = await discovery.testCandidates(searchId)
      await Promise.allSettled(candidates.map((candidateId) => discovery.prepare(searchId, candidateId, controller.signal)))
      return { statusCode: 200, body: { providers: discovery.diagnostics(), languages: languages.length, tracks: languages.reduce((total, language) => total + language.count, 0) } }
    } finally { clearTimeout(timer) }
  }

  async function providersHealth(): Promise<DiagnosticResult> {
    const probed = await deps.probeStatus?.() ?? {}
    const metrics = await metricsSnapshot()
    const kinds = ['movie', 'series', 'anime'] as const
    const result: Record<string, Array<{ id: string; region: string; enabled: boolean; probe: ProbeStatus[string] | null; status: 'healthy' | 'degraded' | 'down' | 'unknown' | 'disabled'; circuit: { failures: number; playbackFailures: number; openUntil: number; outcomes: number; success: number; latencyMs: number } | null }>> = {}
    for (const kind of kinds) {
      const circuits = playback.providerStatus?.(kind) ?? []
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
    return { statusCode: 200, body: result }
  }

  async function providersTest(providerId: string, ref: PlaybackRef, audioLanguage?: string): Promise<DiagnosticResult> {
    const provider = findProvider(providerId)
    if (!suppliesVideo(provider)) throw new ApiError('BAD_REQUEST', 'This provider is assigned to audio. Separate audio verification is not available yet.')
    if (!provider.mediaKinds.includes(ref.kind)) throw new ApiError('BAD_REQUEST', 'Provider does not serve this title kind.')
    if (audioLanguage && !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(audioLanguage)) throw new ApiError('BAD_REQUEST', 'Choose a valid audio language.')
    if (!await store.claim(`admin-test:${providerId}`, randomUUID(), 15)) throw new ApiError('CONFLICT', 'Please wait before testing this provider again.', { retryable: true })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new DOMException('Test timed out', 'TimeoutError')), 15_000)
    try {
      const result = await Promise.race([
        provider.adapter.resolve({ ref, region: env.tmdbRegion, audioLanguage: audioLanguage ?? 'en' }, controller.signal),
        new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })),
      ])
      const valid = result.ok ? validatedSources(result, provider, Date.now()) : []
      return { statusCode: 200, body: {
        providerId,
        ok: result.ok && valid.length > 0,
        ...(result.ok ? { sourceCount: valid.length, sources: valid.map((s) => ({ key: s.key, type: s.type, language: s.language, qualityHint: s.qualityHint })) } : { code: result.code, retryable: result.retryable }),
      } }
    } catch {
      return { statusCode: 200, body: { providerId, ok: false, code: 'error', error: 'Provider resolution failed.' } }
    } finally {
      clearTimeout(timeout)
    }
  }

  async function providersRetest(providerId: string, requestedRegion: string | undefined, kind: 'movie' | 'series' | 'anime' | undefined): Promise<DiagnosticResult> {
    const provider = findProvider(providerId)
    if (!suppliesVideo(provider)) throw new ApiError('BAD_REQUEST', 'This provider is assigned to audio. Separate audio verification is not available yet.')
    const region = requestedRegion ?? env.tmdbRegion
    if (typeof region !== 'string' || !/^[A-Z]{2}$/.test(region) || !provider.approvedRegions.includes(region)) throw new ApiError('BAD_REQUEST', 'Choose a configured provider region.')
    const resolvedKind = kind ?? provider.mediaKinds[0]
    if (resolvedKind !== 'movie' && resolvedKind !== 'series' && resolvedKind !== 'anime' || !provider.mediaKinds.includes(resolvedKind)) throw new ApiError('BAD_REQUEST', 'Choose a supported title kind.')
    const lock = randomUUID()
    if (!await store.claim(`admin-retest-cooldown:${providerId}:${resolvedKind}:${region}`, lock, 60)) throw new ApiError('CONFLICT', 'Please wait a minute before retesting this provider.', { retryable: true })
    if (!await store.claim(`admin-retest:${providerId}:${resolvedKind}:${region}`, lock, 60)) throw new ApiError('CONFLICT', 'A provider retest is already running.', { retryable: true })
    try {
      const ref = resolvedKind === 'anime' ? { kind: resolvedKind, id: 21, episode: 1 } as const : resolvedKind === 'series' ? { kind: resolvedKind, id: 1399, season: 1, episode: 1 } as const : { kind: resolvedKind, id: 550 } as const
      const controller = new AbortController()
      const budgetMs = Math.min(Math.max(provider.attemptMs ?? 10_000, 10_000), 15_000)
      const timeout = setTimeout(() => controller.abort(), budgetMs)
      try {
        const started = Date.now()
        const result = await Promise.race([
          provider.adapter.resolve({ ref, region, audioLanguage: 'en' }, controller.signal),
          new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })),
        ])
        const playable = result.ok && validatedSources(result, provider, Date.now()).length > 0
        const record = { ok: playable, ms: Date.now() - started, at: started, ...(!result.ok ? { code: result.code } : !playable ? { code: 'invalid-source' } : {}) }
        await store.set(`probe:${providerId}:${resolvedKind}:${region}`, JSON.stringify(record), 1800)
        return { statusCode: 200, body: { providerId, kind: resolvedKind, region, ...record } }
      } catch {
        const record = { ok: false, ms: budgetMs, at: Date.now(), code: controller.signal.aborted ? 'timeout' : 'error' }
        await store.set(`probe:${providerId}:${resolvedKind}:${region}`, JSON.stringify(record), 1800)
        return { statusCode: 200, body: { providerId, kind: resolvedKind, region, ...record } }
      } finally { clearTimeout(timeout) }
    } finally { await store.release(`admin-retest:${providerId}:${resolvedKind}:${region}`, lock) }
  }

  async function circuitReset(providerId: string, kind: 'movie' | 'series' | 'anime'): Promise<DiagnosticResult> {
    const provider = providers.find((entry) => entry.adapter.id === providerId && !isProviderRemoved(entry) && entry.mediaKinds.includes(kind))
    if (!provider || !['movie', 'series', 'anime'].includes(kind)) throw new ApiError('BAD_REQUEST', 'Choose a supported provider and title kind.')
    if (!playback.resetProviderCircuit) throw new ApiError('PLAYBACK_UNAVAILABLE', 'Provider controls are unavailable.', { retryable: true })
    await playback.resetProviderCircuit(providerId, kind)
    return { statusCode: 200, body: { id: providerId, kind, reset: true } }
  }

  async function providersInspect(providerId: string, ref: PlaybackRef, audioLanguage: string, scope: 'configured' | 'scout'): Promise<DiagnosticResult> {
    const roster = scope === 'scout' ? [...providers, ...(deps.scoutCatalog?.() ?? [])] : providers
    const provider = roster.find((row) => row.adapter.id === providerId && !isProviderRemoved(row))
    if (!provider || !suppliesVideo(provider) || !provider.mediaKinds.includes(ref.kind)) throw new ApiError('BAD_REQUEST', 'Choose a video provider that serves this title kind.')
    if (!provider.approvedRegions.includes(env.tmdbRegion)) throw new ApiError('BAD_REQUEST', `Provider is not configured for ${env.tmdbRegion}.`)
    const owner = randomUUID()
    if (!await store.claim(`admin-test:${providerId}`, owner, 20)) throw new ApiError('CONFLICT', 'Wait 20 seconds before testing this provider again.', { retryable: true })
    const groupKey = `admin-inspect-group:${provider.upstreamGroup}`
    if (!await store.claim(groupKey, owner, 20)) throw new ApiError('CONFLICT', 'Another test is using this upstream group. Wait and retry.', { retryable: true })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const started = performance.now()
    const elapsed = () => Math.round(performance.now() - started)
    try {
      const { result, sources: valid } = await inspectProviderSources(provider, { ref, region: env.tmdbRegion, audioLanguage }, controller.signal, store)
      const relay = env.playback?.relay ? createPlaybackRelay(env.playback.relay) : undefined
      const proxy = provider.deliveryMode === 'relay'
      const registration = { ...provider, enabled: true }
      const preview = proxy ? valid.find(source => relay?.permits({ source, registration })) : valid[0]
      const expiry = preview ? proxy ? Math.min(Date.parse(preview.expiresAt) - 5000, Date.now() + 90_000) : Date.parse(preview.expiresAt) : 0
      const previewSrc = preview ? proxy ? await relay?.issue({ source: preview, registration, subtitles: [], delivery: 'direct' }, expiry, env.appOrigin) : preview.url : undefined
      return { statusCode: 200, body: {
        providerId, ok: valid.length > 0 && (!proxy || Boolean(previewSrc)), elapsedMs: elapsed(), region: env.tmdbRegion,
        delivery: provider.deliveryMode ?? 'direct',
        code: proxy && valid.length && !previewSrc ? 'proxy_unavailable' : result.ok ? valid.length ? 'resolved' : 'invalid_sources' : result.code,
        rejectedSources: result.ok ? result.sources.length - valid.length : 0,
        sources: valid.map((source) => ({ key: source.key, type: source.type, language: source.language,
          host: new URL(source.url).hostname, qualityHint: source.qualityHint, subtitleCount: source.subtitles.length })),
        ...(preview && previewSrc ? { preview: { src: previewSrc, type: preview.type, qualityHint: preview.qualityHint, ...(preview.frameSandbox ? { frameSandbox: preview.frameSandbox } : {}), expiresAt: new Date(expiry).toISOString(), delivery: proxy ? 'relay' : 'direct' } } : {}),
      } }
    } catch {
      return { statusCode: 200, body: { providerId, ok: false, code: controller.signal.aborted ? 'timeout' : 'error', elapsedMs: elapsed(), region: env.tmdbRegion, rejectedSources: 0, sources: [] } }
    } finally {
      clearTimeout(timeout)
      await store.release(groupKey, owner)
    }
  }

  return async function dispatch(operation: DiagnosticOperation): Promise<DiagnosticResult> {
    try {
      switch (operation.operation) {
        case 'subtitles.list': return await subtitlesList()
        case 'subtitles.test': return await subtitlesTest(operation.ref)
        case 'providers.health': return await providersHealth()
        case 'providers.test': return await providersTest(operation.providerId, operation.ref, operation.audioLanguage)
        case 'providers.inspect': return await providersInspect(operation.providerId, operation.ref, operation.audioLanguage, operation.scope)
        case 'providers.retest': return await providersRetest(operation.providerId, operation.region, operation.kind)
        case 'providers.circuit-reset': return await circuitReset(operation.providerId, operation.kind)
        default: return { statusCode: 400, body: { error: 'BAD_REQUEST' } }
      }
    } catch (error) { return errorResult(error) }
  }
}
