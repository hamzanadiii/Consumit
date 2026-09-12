import { randomUUID } from 'node:crypto'
import { metrics } from '@opentelemetry/api'
import { playbackProviderListSchema, playbackSessionSchema, type PlaybackEvents, type PlaybackFailureRequest, type PlaybackProvider, type PlaybackSession, type ResolvePlaybackRequest } from '@consumit/contracts'
import { sourceIdentity, type ProviderRegistration } from '@consumit/provider-sdk'
import { ApiError } from '../http/errors.ts'
import { collectSubtitleCandidates, createResolver, dedupeSubtitleTracks, type ResolvedSource, type SubtitleCandidate } from './resolver.ts'
import { createCapabilityRegistry, type CapabilityRegistry } from './delivery.ts'
import type { PlaybackStore } from './state.ts'

type SessionRecord = { owner: string; input: ResolvePlaybackRequest; session: PlaybackSession; excluded: string[]; group: string }
export interface Playback {
  resolve(owner: string, input: ResolvePlaybackRequest, signal: AbortSignal): Promise<PlaybackSession>
  recover(owner: string, id: string, failure: PlaybackFailureRequest, refresh: boolean, signal: AbortSignal): Promise<PlaybackSession>
  listProviders(input: ResolvePlaybackRequest, signal: AbortSignal): Promise<PlaybackProvider[]>
  switchProvider(owner: string, id: string, providerId: string, signal: AbortSignal): Promise<PlaybackSession>
  events(owner: string, id: string, events: PlaybackEvents): Promise<void>
}
const unavailable = () => new ApiError('PLAYBACK_UNAVAILABLE', 'No compatible playback source is available.', { retryable: true })

export function createPlayback({ providers, store, region, deliveryPlanner, deliveryRegistry }: { providers: readonly ProviderRegistration[]; store: PlaybackStore; region: string; deliveryPlanner?: boolean; deliveryRegistry?: CapabilityRegistry }): Playback {
  // One registry shared across resolution (wired in app.ts). The resolver
  // gates every source on measured direct playability; planners disabled
  // means permissive mode (trust adapter declarations).
  const registry = deliveryRegistry ?? createCapabilityRegistry(store)
  const plannerOn = deliveryPlanner ?? false
  const resolver = createResolver(providers, { region, store, delivery: { registry, enabled: plannerOn } })
  const events = metrics.getMeter('consumit.playback').createCounter('playback.events')
  const timing = metrics.getMeter('consumit.playback').createHistogram('playback.client.duration', { unit: 'ms' })
  const recoveryLocks = new Set<string>()

  async function read(owner: string, id: string) {
    const raw = await store.get(`session:${id}`)
    if (!raw) throw new ApiError('NOT_FOUND', 'This playback session expired. Start playback again.', { retryable: true })
    const record = JSON.parse(raw) as SessionRecord
    if (record.owner !== owner || Date.parse(record.session.expiresAt) <= Date.now()) throw new ApiError('NOT_FOUND', 'Playback session not found.')
    return record
  }

  async function save(owner: string, input: ResolvePlaybackRequest, resolved: ResolvedSource, previous?: SessionRecord) {
    const { source, registration } = resolved
    const expiry = Math.min(Date.parse(source.expiresAt) - 5000, Date.now() + 30 * 60_000)
    // Direct-only architecture: the session hands the browser the upstream
    // URL untouched. The resolver already gated playability, so there is
    // nothing to mint, rewrite, or lease here.
    const src = source.url
    // Captions aggregate across every provider that answered, plus the tracks
    // the member already had: a video fallback never takes the subtitles down
    // with it. Only upstream https WebVTT survives — legacy lease paths from
    // pre-removal sessions fail closed here and refresh into direct tracks.
    const carried: SubtitleCandidate[] = (previous?.session.source.subtitles ?? [])
      .filter((track) => track.format === 'vtt' && track.url.startsWith('https://'))
      .map((track) => ({ track, hosts: [], headers: {} }))
    const subtitles = dedupeSubtitleTracks([
      ...collectSubtitleCandidates([source], registration),
      ...resolved.subtitles,
      ...carried,
    ])
      .map(({ track }) => track)
      .filter((track) => track.format === 'vtt' && track.url.startsWith('https://'))
    const session: PlaybackSession = {
      id: previous?.session.id ?? randomUUID(), ref: input.ref,
      source: { id: sourceIdentity(registration.adapter.id, input.ref, source.key), providerId: registration.adapter.id, type: source.type, src, ...(source.qualityHint ? { qualityHint: source.qualityHint } : {}), expiresAt: new Date(expiry).toISOString(), subtitles: subtitles.filter((track) => track.format === 'vtt') },
      expiresAt: previous?.session.expiresAt ?? new Date(Date.now() + 4 * 3600_000).toISOString(),
      fallbackCount: previous?.session.fallbackCount ?? 0,
      capabilities: { refresh: true, fallback: (previous?.session.fallbackCount ?? 0) < 3, externalSubtitles: subtitles.some((track) => track.format === 'vtt') },
    }
    playbackSessionSchema.parse(session)
    await store.set(`session:${session.id}`, JSON.stringify({ owner, input, session, group: registration.upstreamGroup, excluded: previous?.excluded ?? [] } satisfies SessionRecord), (Date.parse(session.expiresAt) - Date.now()) / 1000)
    return session
  }

  return {
    async resolve(owner, input, signal) {
      const result = await resolver.resolve(input, signal)
      if (!result || signal.aborted) throw unavailable()
      return save(owner, input, result)
    },
    async listProviders(input, signal) {
      const eligible = providers
        .filter((registration) => registration.enabled && registration.approvedRegions.includes(region))
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      const settled = await Promise.allSettled(eligible.map(async (registration) => {
        const result = await resolver.resolve(input, signal, [], registration.adapter.id, true)
        if (!result || signal.aborted) return null
        const { source } = result
        // Pass this provider's caption tracks alongside its label so the
        // player can offer every answering provider's subtitles — not just
        // the winner's — without another resolve round or slower first frame.
        // Upstream https WebVTT only; no leases, no minting.
        const subtitles = dedupeSubtitleTracks([
          ...collectSubtitleCandidates([source], registration),
          ...result.subtitles,
        ])
          .map(({ track }) => track)
          .filter((track) => track.format === 'vtt' && track.url.startsWith('https://'))
        return {
          id: registration.adapter.id, label: registration.adapter.id,
          detail: source.qualityHint ?? `${source.type} · ${source.language}`,
          subtitles,
        } satisfies PlaybackProvider
      }))
      const seen = new Set<string>()
      const listed: PlaybackProvider[] = []
      for (const entry of settled) {
        if (entry.status !== 'fulfilled' || !entry.value || seen.has(entry.value.id)) continue
        seen.add(entry.value.id)
        listed.push(entry.value)
      }
      return playbackProviderListSchema.parse({ providers: listed }).providers
    },
    async switchProvider(owner, id, providerId, signal) {
      if (recoveryLocks.has(id)) throw new ApiError('CONFLICT', 'Playback is already recovering.', { retryable: true })
      recoveryLocks.add(id)
      try {
        const record = await read(owner, id)
        const target = providers.find((registration) => registration.adapter.id === providerId && registration.enabled && registration.approvedRegions.includes(region))
        if (!target) throw new ApiError('BAD_REQUEST', 'Choose an available playback provider.')
        if (record.session.source.providerId === providerId) return record.session
        // Manual switches ride outside the automatic fallback budget and never
        // extend the exclusion history: the member explicitly chose this
        // provider, including retrying one that failed before. Route-level
        // rate limits still bound switching.
        const excluded = record.excluded.filter((group) => group !== target.upstreamGroup)
        const result = await resolver.resolve(record.input, signal, excluded, providerId, true)
        if (!result || signal.aborted) throw unavailable()
        return save(owner, record.input, result, record)
      } finally { recoveryLocks.delete(id) }
    },
    async recover(owner, id, failure, refresh, signal) {
      if (recoveryLocks.has(id)) throw new ApiError('CONFLICT', 'Playback is already recovering.', { retryable: true })
      recoveryLocks.add(id)
      try {
        const record = await read(owner, id)
        if (record.session.source.id !== failure.sourceId) return record.session
        if (!refresh) {
          if (record.session.fallbackCount >= 3) throw unavailable()
          record.excluded.push(record.group)
          record.session.fallbackCount++
          record.session.capabilities.fallback = record.session.fallbackCount < 3
          resolver.recordFailure(record.session.source.providerId, record.input.ref.kind)
          await store.set(`session:${id}`, JSON.stringify(record), (Date.parse(record.session.expiresAt) - Date.now()) / 1000)
        }
        const result = await resolver.resolve(record.input, signal, record.excluded, refresh ? record.session.source.providerId : undefined, true)
        if (!result || signal.aborted) throw unavailable()
        return save(owner, record.input, result, record)
      } finally { recoveryLocks.delete(id) }
    },
    async events(owner, id, batch) {
      const record = await read(owner, id)
      for (const event of batch.events) {
        const attributes = { provider: record.session.source.providerId, event: event.type }
        events.add(1, attributes)
        if (event.elapsedMs !== undefined) timing.record(event.elapsedMs, attributes)
      }
    },
  }
}
