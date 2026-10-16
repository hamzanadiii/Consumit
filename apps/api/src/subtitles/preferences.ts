import type { PlaybackRef } from '@consumit/contracts'

export type SubtitlePreferenceRecord = {
  trackId: string | null
  offsetMs: number
}

export interface SubtitlePreferences {
  /** Stored correction for one member/title-episode, or null when the
   *  member never set one. Never throws — outages read as unset. */
  get(memberId: string, ref: PlaybackRef): Promise<SubtitlePreferenceRecord | null>
  /** Upsert one member/title-episode correction. */
  set(memberId: string, ref: PlaybackRef, preference: { trackId?: string | null | undefined; offsetMs?: number | undefined }): Promise<SubtitlePreferenceRecord>
}

/** In-memory preferences for tests. No persistence, same contract. */
export function createFakeSubtitlePreferences(): SubtitlePreferences & { records: Map<string, SubtitlePreferenceRecord> } {
  const records = new Map<string, SubtitlePreferenceRecord>()
  const key = (memberId: string, ref: PlaybackRef) =>
    `${memberId}|${ref.kind}|${ref.id}|${ref.season ?? 0}|${ref.episode ?? 0}`
  return {
    records,
    async get(memberId, ref) {
      return records.get(key(memberId, ref)) ?? null
    },
    async set(memberId, ref, preference) {
      const record = {
        trackId: preference.trackId ?? null,
        offsetMs: preference.offsetMs ?? 0,
      }
      records.set(key(memberId, ref), record)
      return record
    },
  }
}
