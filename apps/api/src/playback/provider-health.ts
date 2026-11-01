import { suppliesVideo, type MediaKind, type ProviderRegistration } from '@consumit/provider-sdk'
import type { ProviderRoute } from './route-registry.ts'
import type { ProbeResult, ProbeStatus } from './probe.ts'
import type { ProviderRouteEvidenceSnapshot } from '../admin/provider-metrics.ts'

type Circuit = { id: string; failures: number; playbackFailures: number; openUntil: number; outcomes: number; success: number; latency: number }
type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown' | 'disabled'
type HealthEvidence = { firstFrame: number; advanced: number; seeked: number; resumed: number }
export type ProviderHealthRow = {
  id: string; region: string; kind: MediaKind; purpose: 'video' | 'audio'; enabled: boolean
  delivery: 'direct' | 'relay' | 'embed'; routeVersion: string | null
  status: HealthStatus; lookupStatus: HealthStatus; deliveryStatus: 'healthy' | 'degraded' | 'unknown' | 'disabled'
  stage: 'lookup' | 'delivery' | 'playback'; lastSuccessAt: number | null; latencyMs: number | null
  failureCategory: string | null; probe: ProbeResult | null; evidence: HealthEvidence
  circuit: { failures: number; playbackFailures: number; openUntil: number; outcomes: number; success: number; latencyMs: number } | null
}

const safeFailureCategories = new Set(['empty', 'timeout', 'malformed', 'unavailable', 'cancelled', 'blocked', 'rate_limited', 'invalid-source', 'error', 'route_unapproved', 'circuit_open', 'playback_unverified'])

/** Central provider route health policy shared by the API and playback diagnostics. */
export function buildProviderHealthRows(input: {
  providers: readonly ProviderRegistration[]
  probes: ProbeStatus
  circuits?: readonly Circuit[]
  evidence?: ProviderRouteEvidenceSnapshot
  routeVersion?: string
  findRoute?: (provider: string, kind: MediaKind, region: string, delivery: 'direct' | 'relay' | 'embed', purpose: 'video' | 'audio') => ProviderRoute | null
  probeIntervalMs: number
  now?: number
}): Record<'movie' | 'series' | 'anime' | 'audio', ProviderHealthRow[]> {
  const now = input.now ?? Date.now()
  const result: Record<'movie' | 'series' | 'anime' | 'audio', ProviderHealthRow[]> = { movie: [], series: [], anime: [], audio: [] }
  const kinds: MediaKind[] = ['movie', 'series', 'anime']
  for (const provider of input.providers) {
    const purposes: Array<'video' | 'audio'> = [
      ...(suppliesVideo(provider) ? ['video' as const] : []),
      ...(provider.role === 'audio' || provider.role === 'both' ? ['audio' as const] : []),
    ]
    const delivery = provider.deliveryMode ?? 'direct'
    for (const kind of kinds.filter(value => provider.mediaKinds.includes(value))) for (const region of new Set(provider.approvedRegions)) for (const purpose of purposes) {
      const key = purpose === 'audio' ? `${provider.adapter.id}:audio:${kind}:${region}` : `${provider.adapter.id}:${kind}:${region}`
      const probe = input.probes[key] ?? null
      const route = input.findRoute?.(provider.adapter.id, kind, region, delivery, purpose) ?? null
      const routeIsRequired = Boolean(input.findRoute)
      const routeApproved = !routeIsRequired || Boolean(route)
      const version = route?.version ?? provider.routeVersion ?? input.routeVersion ?? null
      const playback = version && (delivery === 'direct' || delivery === 'relay')
        ? input.evidence?.[`${provider.adapter.id}:${kind}:${region}:${delivery}:${purpose}:${version}`] : undefined
      const evidence: HealthEvidence = {
        firstFrame: playback?.firstFrame ?? 0,
        advanced: playback?.advanced ?? 0,
        seeked: playback?.seeked ?? 0,
        resumed: playback?.resumed ?? 0,
      }
      const playable = purpose === 'video' && delivery !== 'embed' && evidence.firstFrame > 0 && evidence.advanced > 0 && evidence.seeked > 0 && evidence.resumed > 0
      const deliveryStatus = !provider.enabled ? 'disabled' : playable ? 'healthy' : playback?.failures ? 'degraded' : 'unknown'
      const current = input.circuits?.find(entry => entry.id === provider.adapter.id) ?? null
      const open = Boolean(current && current.openUntil > now)
      const fresh = Boolean(probe && now - probe.at <= Math.max(10 * 60_000, input.probeIntervalMs * 2))
      const lookupStatus: HealthStatus = !provider.enabled ? 'disabled'
        : !fresh ? 'unknown'
          : !probe?.ok ? open ? 'down' : 'degraded'
            : open ? 'degraded' : 'healthy'
      let status: HealthStatus
      let stage: ProviderHealthRow['stage']
      let failureCategory: string | null = null
      if (!provider.enabled) { status = 'disabled'; stage = 'lookup' }
      else if (!routeApproved) { status = 'degraded'; stage = 'delivery'; failureCategory = 'route_unapproved' }
      else if (!fresh) { status = 'unknown'; stage = 'lookup'; failureCategory = 'unavailable' }
      else if (!probe?.ok) { status = open ? 'down' : 'degraded'; stage = 'lookup'; failureCategory = probe?.code ?? 'unavailable' }
      else if (open) { status = 'degraded'; stage = 'playback'; failureCategory = 'circuit_open' }
      else if (playable) { status = 'healthy'; stage = 'playback' }
      else { status = 'degraded'; stage = delivery === 'embed' ? 'delivery' : 'playback'; failureCategory = playback?.failures ? 'unavailable' : 'playback_unverified' }
      if (failureCategory && !safeFailureCategories.has(failureCategory)) failureCategory = 'unavailable'
      result[purpose === 'audio' ? 'audio' : kind].push({
        id: provider.adapter.id, region, kind, purpose, enabled: provider.enabled, delivery, routeVersion: version,
        status, lookupStatus, deliveryStatus, stage,
        lastSuccessAt: playable ? playback?.lastSuccessAt ?? null : null,
        latencyMs: probe?.ms ?? current?.latency ?? null,
        failureCategory, probe, evidence,
        circuit: current ? { failures: current.failures, playbackFailures: current.playbackFailures, openUntil: current.openUntil, outcomes: current.outcomes, success: current.success, latencyMs: current.latency } : null,
      })
    }
  }
  return result
}
