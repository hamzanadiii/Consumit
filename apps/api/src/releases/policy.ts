import { createHash } from 'node:crypto'
import type { ReleaseProbeEvidence } from '@consumit/contracts'
import type { ProviderRegistration } from '@consumit/provider-sdk'

export const WEEK_MS = 7 * 24 * 60 * 60_000
export const CHECK_FRESH_MS = 6 * 60 * 60_000
export const episodeKey = (kind: string, id: number, season: number, episode: number) => `${kind}:${id}:${season}:${episode}`
export function recentlyReleased(releasedAt: Date, now: Date) {
  return Number.isFinite(releasedAt.getTime()) && releasedAt <= now && releasedAt.getTime() >= now.getTime() - WEEK_MS
}
export function playbackPassed(evidence: ReleaseProbeEvidence) {
  return !evidence.failure && evidence.decodedFrames > 0 && evidence.advancedSeconds >= 5 && evidence.seeked && evidence.resumedSeconds >= 2
}
export function providerRevision(provider: ProviderRegistration) {
  return createHash('sha256').update(JSON.stringify({ ...provider, adapter: { id: provider.adapter.id, audioLanguages: provider.adapter.audioLanguages },
    mediaHostPatterns: provider.mediaHostPatterns?.map(pattern => pattern.toString()) })).digest('hex')
}
