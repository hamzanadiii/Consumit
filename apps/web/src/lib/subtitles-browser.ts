import { subtitlePreferenceResponseSchema, subtitlesResponseSchema } from '@consumit/contracts'

export type AggregatedSubtitle = { id: string; label: string; language: string; url: string }

export type SubtitlePreference = { trackId: string | null; offsetMs: number }

/** Stored per-member sync correction for one title/episode. Null for
 *  guests, expired sessions, or members who never set one — the player
 *  keeps device-local behavior in all three cases. */
export async function fetchSubtitlePreference(
  ref: { kind: 'movie' | 'series' | 'anime'; id: number; season?: number | undefined; episode?: number | undefined },
  signal: AbortSignal,
): Promise<SubtitlePreference | null> {
  const params = new URLSearchParams({ kind: ref.kind, id: String(ref.id) })
  if (ref.season) params.set('season', String(ref.season))
  if (ref.episode) params.set('episode', String(ref.episode))
  const response = await fetch(`/v1/subtitles/preferences?${params}`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    signal,
  })
  if (!response.ok) return null
  const parsed = subtitlePreferenceResponseSchema.safeParse(await response.json().catch(() => null))
  return parsed.success ? parsed.data.preference : null
}

/** Persist a sync correction (debounced by the caller). Failures resolve
 *  silently — the player already applied the offset locally. */
export async function saveSubtitlePreference(
  ref: { kind: 'movie' | 'series' | 'anime'; id: number; season?: number | undefined; episode?: number | undefined },
  preference: { trackId?: string | null | undefined; offsetMs?: number | undefined },
  signal: AbortSignal,
): Promise<void> {
  const body = {
    ref: { kind: ref.kind, id: ref.id, ...(ref.season ? { season: ref.season } : {}), ...(ref.episode ? { episode: ref.episode } : {}) },
    ...(preference.trackId !== undefined ? { trackId: preference.trackId } : {}),
    ...(preference.offsetMs !== undefined ? { offsetMs: preference.offsetMs } : {}),
  }
  const response = await fetch('/v1/subtitles/preferences', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) throw new Error('Subtitle preference could not be saved.')
}

/** Aggregated engine captions (YIFY, TVSubtitles, CastleSubs, NxshaSubs,
 *  SubSource) for one title/episode. Independent of the selected streaming
 *  provider — failures resolve to an empty list so the menu simply shows
 *  the streaming providers' own tracks. */
export async function fetchAggregatedSubtitles(
  ref: { kind: 'movie' | 'series' | 'anime'; id: number; season?: number | undefined; episode?: number | undefined },
  signal: AbortSignal,
  langs?: readonly string[] | undefined,
): Promise<AggregatedSubtitle[]> {
  const params = new URLSearchParams({ kind: ref.kind, id: String(ref.id) })
  if (ref.season) params.set('season', String(ref.season))
  if (ref.episode) params.set('episode', String(ref.episode))
  if (langs?.length) params.set('langs', langs.join(','))
  const response = await fetch(`/v1/subtitles?${params}`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error('Subtitles are unavailable right now.')
  const parsed = subtitlesResponseSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new Error('Subtitles are unavailable right now.')
  return parsed.data.subtitles
}
