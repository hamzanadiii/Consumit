import { playbackSkipTimesResponseSchema, type PlaybackRef } from '@consumit/contracts'

export async function browserSkipTimes(ref: PlaybackRef, duration: number, signal: AbortSignal) {
  const query = new URLSearchParams({ kind: ref.kind, id: String(ref.id), duration: String(duration) })
  if (ref.season != null) query.set('season', String(ref.season))
  if (ref.episode != null) query.set('episode', String(ref.episode))
  const response = await fetch(`/v1/playback/skip-times?${query}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]), headers: { accept: 'application/json' } })
  if (!response.ok) return []
  const parsed = playbackSkipTimesResponseSchema.safeParse(await response.json())
  return parsed.success ? parsed.data.segments.filter((segment) => segment.end > segment.start && segment.end <= duration) : []
}
