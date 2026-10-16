import type { ReleaseProbeEvidence, ReleaseProbeSource } from '@consumit/contracts'
import type { ProviderRegistration } from '@consumit/provider-sdk'
import { suppliesVideo } from '@consumit/provider-sdk'
import type { ReleaseRepository } from './repository.ts'
import { playbackPassed, providerRevision } from './policy.ts'
import { inspectProviderSources } from '../playback/inspection.ts'
import { matchesRequestedAudio, supportsRequestedAudio } from '../playback/audio-policy.ts'
import type { PlaybackStore } from '../playback/state.ts'
import type { PlaybackRelay } from '../playback/relay.ts'
import { isProviderRemoved } from '../admin/provider-config.ts'


export async function resolveReleaseProbeSource(provider: ProviderRegistration, ref: import('@consumit/contracts').PlaybackRef, audioLanguage: string, deps: { region: string; origin: string; store: PlaybackStore; relay?: PlaybackRelay | undefined; relayOrigin?: string | undefined }): Promise<ReleaseProbeSource | null> {
      const input = { ref, audioLanguage, capabilities: { native: true, hls: true, dash: true, nativeHls: false } }
      if (!supportsRequestedAudio(provider, input)) return null
      const revision = providerRevision(provider)
      const { sources } = await inspectProviderSources(provider, { ref, region: deps.region, audioLanguage }, AbortSignal.timeout(15_000), deps.store)
      const source = sources.find(source => source.type !== 'iframe' && matchesRequestedAudio(source, input)
        && (provider.deliveryMode !== 'relay' || deps.relay?.permits({ source, registration: provider })))
      if (!source || source.type === 'iframe' || !provider.enabled || revision !== providerRevision(provider)) return null
      const expiresAt = new Date(Math.min(Date.parse(source.expiresAt), Date.now() + 90_000)).toISOString()
      const src = provider.deliveryMode === 'relay'
        ? await deps.relay?.issue({ source, registration: provider, subtitles: [], delivery: 'direct' }, Date.parse(expiresAt), deps.origin)
        : source.url
      if (!src) return null
      const preview = { src, type: source.type, expiresAt, providerId: provider.adapter.id, revision, region: deps.region, audioLanguage,
        mediaHosts: [...provider.mediaHosts, ...(provider.deliveryMode === 'relay' && deps.relayOrigin ? [new URL(deps.relayOrigin).hostname] : [])], mediaHostPatterns: (provider.mediaHostPatterns ?? []).map(pattern => pattern.source) }

  return preview
}

export function createReleaseService(repository: ReleaseRepository, deps: {
  resolvePreview?: ((providerId: string, ref: import('@consumit/contracts').PlaybackRef, audioLanguage: string) => Promise<ReleaseProbeSource | null>) | undefined;
  providers: readonly ProviderRegistration[]; orders: Record<'movie' | 'series' | 'anime', string[]>;
  region: string; origin: string; store: PlaybackStore; relay?: PlaybackRelay | undefined; relayOrigin?: string | undefined;
}) {
  const current = (run: { providerId: string | null; revision: string | null; region: string | null }) => {
    const provider = deps.providers.find(row => row.adapter.id === run.providerId)
    return Boolean(provider && provider.enabled && !isProviderRemoved(provider) && suppliesVideo(provider)
      && provider.approvedRegions.includes(deps.region) && run.region === deps.region && run.revision === providerRevision(provider)
      && (provider.deliveryMode !== 'relay' || deps.relay?.includes(provider.adapter.id)))
  }
  return {
    ...repository,
    async source(id: string, token: string, kind: 'series' | 'anime'): Promise<ReleaseProbeSource | null> {
      const audioLanguage = kind === 'anime' ? 'ja' : 'en'
      const eligible = deps.providers.filter(provider => provider.enabled && !isProviderRemoved(provider) && suppliesVideo(provider)
        && provider.deliveryMode !== 'embed' && provider.mediaKinds.includes(kind) && provider.approvedRegions.includes(deps.region)
        && (kind !== 'anime' || !provider.adapter.audioLanguages || provider.adapter.audioLanguages.some(value => ['ja', 'jpn', 'original'].includes(value)))
        && (provider.deliveryMode !== 'relay' || deps.relay?.includes(provider.adapter.id)))
      const order = deps.orders[kind]
      eligible.sort((a, b) => Number(a.deliveryMode === 'relay') - Number(b.deliveryMode === 'relay')
        || (order.indexOf(a.adapter.id) < 0 ? 10000 : order.indexOf(a.adapter.id)) - (order.indexOf(b.adapter.id) < 0 ? 10000 : order.indexOf(b.adapter.id)))
      const next = await repository.nextAttempt(id, token, eligible.map(row => row.adapter.id))
      if (!next) return null
      if (next.ref.kind !== kind) return null
      const provider = eligible.find(row => row.adapter.id === next.providerId)!
      const ref = next.ref.kind === 'anime' ? { kind: 'anime' as const, id: next.ref.id, episode: next.ref.episode } : next.ref
      const preview = deps.resolvePreview ? await deps.resolvePreview(provider.adapter.id, ref, audioLanguage) : await resolveReleaseProbeSource(provider, ref, audioLanguage, deps)
      if (!preview || !provider.enabled || preview.providerId !== provider.adapter.id || preview.revision !== providerRevision(provider)) return null
      await repository.setSource(id, token, preview)
      return preview
    },
    finishCheck(id: string, token: string, evidence: ReleaseProbeEvidence) {
      return repository.finish(id, token, playbackPassed(evidence), current, evidence.failure, evidence)
    },
  }
}
export type ReleaseService = ReturnType<typeof createReleaseService>
