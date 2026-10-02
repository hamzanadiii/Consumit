import { subtitlePreferenceResponseSchema, subtitlesResponseSchema } from '@consumit/contracts'

export type AggregatedSubtitle = { id: string; label: string; language: string; url: string }
export type SubtitleCandidate = { id: string; label: string; language: string; provider: string; release?: string; hi?: boolean; forced?: boolean; sdh?: boolean; machineTranslated?: boolean; preparedUrl?: string }
export type SubtitleProviderStatus = { id: string; name: string; state: 'ready' | 'skipped' | 'no_match' | 'failed' | 'timeout'; durationMs: number; found: number; reason?: 'credentials_required' | 'unsupported' }
export type SubtitleDiscoveryEvent = { type: 'snapshot' | 'provider' | 'complete'; searchId: string; languages: { code: string; count: number }[]; provider?: SubtitleProviderStatus }

export async function discoverSubtitles(
  ref: { kind: 'movie' | 'series' | 'anime'; id: number; season?: number; episode?: number },
  signal: AbortSignal,
  onEvent: (event: SubtitleDiscoveryEvent) => void,
) {
  const params = new URLSearchParams({ kind: ref.kind, id: String(ref.id) })
  if (ref.season) params.set('season', String(ref.season))
  if (ref.episode) params.set('episode', String(ref.episode))
  const response = await fetch(`/v1/subtitles/discover?${params}`, { credentials: 'same-origin', signal })
  if (!response.ok || !response.body) throw new Error('Subtitle discovery is unavailable.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  for (;;) {
    const { done, value } = await reader.read()
    pending += decoder.decode(value, { stream: !done })
    let lineEnd: number
    while ((lineEnd = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, lineEnd)
      pending = pending.slice(lineEnd + 1)
      if (!line) continue
      const event = JSON.parse(line) as SubtitleDiscoveryEvent
      if (event && ['snapshot', 'provider', 'complete'].includes(event.type) && Array.isArray(event.languages)) onEvent(event)
    }
    if (done) break
  }
}

export async function pageSubtitles(searchId: string, language: string, cursor: number, langs: readonly string[], signal: AbortSignal) {
  const params = new URLSearchParams({ searchId, language, cursor: String(cursor), langs: langs.join(',') })
  const response = await fetch(`/v1/subtitles/discover/page?${params}`, { credentials: 'same-origin', signal })
  if (!response.ok) throw new Error('Subtitle tracks could not be loaded.')
  return await response.json() as { tracks: SubtitleCandidate[]; total: number; nextCursor: number | null }
}

export async function searchSubtitles(searchId: string, query: string, cursor: number, signal: AbortSignal) {
  const params = new URLSearchParams({ searchId, q: query, cursor: String(cursor) })
  const response = await fetch(`/v1/subtitles/discover/search?${params}`, { credentials: 'same-origin', signal })
  if (!response.ok) throw new Error('Subtitle search could not be loaded.')
  return await response.json() as { tracks: SubtitleCandidate[]; total: number; nextCursor: number | null }
}

export async function prepareSubtitle(searchId: string, candidateId: string, signal: AbortSignal): Promise<AggregatedSubtitle> {
  const response = await fetch('/v1/subtitles/discover/prepare', {
    method: 'POST', credentials: 'same-origin', signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ searchId, candidateId }),
  })
  if (!response.ok) throw new Error('This subtitle could not be prepared. Choose another track.')
  return await response.json() as AggregatedSubtitle
}

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
