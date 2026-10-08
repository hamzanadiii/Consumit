import { subtitleDiscoveryEventSchema, subtitleDiscoveryPageSchema, subtitlePreferenceResponseSchema, subtitleTrackSchema, subtitlesResponseSchema } from '@consumit/contracts'
export type { SubtitleCandidate, SubtitleProviderStatus, SubtitleDiscoveryEvent } from '@consumit/contracts'
import type { SubtitleDiscoveryEvent } from '@consumit/contracts'

export type AggregatedSubtitle = { id: string; label: string; language: string; url: string }

export async function discoverSubtitles(
  ref: { kind: 'movie' | 'series' | 'anime'; id: number; season?: number; episode?: number },
  signal: AbortSignal,
  onEvent: (event: SubtitleDiscoveryEvent) => void,
) {
  const params = new URLSearchParams({ kind: ref.kind, id: String(ref.id) })
  if (ref.season) params.set('season', String(ref.season))
  if (ref.episode) params.set('episode', String(ref.episode))
  const response = await fetch(`/v1/subtitles/discover?${params}`, { credentials: 'same-origin', signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) })
  if (!response.ok || !response.body) throw new Error('Subtitle discovery is unavailable.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let searchId: string | undefined
  let completed = false
  const emit = (line: string) => {
    if (!line.trim()) return
    let body: unknown
    try { body = JSON.parse(line) } catch { throw new Error('Subtitle discovery returned an invalid response. Try again.') }
    const event = subtitleDiscoveryEventSchema.safeParse(body)
    if (!event.success) throw new Error('Subtitle discovery returned an invalid response. Try again.')
    if (completed || (searchId && event.data.searchId !== searchId)) throw new Error('Subtitle discovery returned an invalid response. Try again.')
    searchId = event.data.searchId
    completed = event.data.type === 'complete'
    onEvent(event.data)
  }
  let bytes = 0
  try { for (;;) {
    const { done, value } = await reader.read()
    bytes += value?.byteLength ?? 0
    if (bytes > 262_144) throw new Error('Subtitle discovery returned too much data. Try again.')
    pending += decoder.decode(value, { stream: !done })
    let lineEnd: number
    while ((lineEnd = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, lineEnd)
      pending = pending.slice(lineEnd + 1)
      emit(line)
    }
    if (done) {
      emit(pending)
      if (!completed) throw new Error('Subtitle discovery stopped before finishing. Try again.')
      break
    }
  } } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}

export async function pageSubtitles(searchId: string, language: string, cursor: number, langs: readonly string[], signal: AbortSignal) {
  const params = new URLSearchParams({ searchId, language, cursor: String(cursor), langs: langs.join(',') })
  const response = await fetch(`/v1/subtitles/discover/page?${params}`, { credentials: 'same-origin', signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]) })
  if (!response.ok) throw new Error('Subtitle tracks could not be loaded.')
  const parsed = subtitleDiscoveryPageSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new Error('Subtitle tracks could not be loaded. Try again.')
  return parsed.data
}

export async function searchSubtitles(searchId: string, query: string, cursor: number, signal: AbortSignal) {
  const params = new URLSearchParams({ searchId, q: query, cursor: String(cursor) })
  const response = await fetch(`/v1/subtitles/discover/search?${params}`, { credentials: 'same-origin', signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]) })
  if (!response.ok) throw new Error('Subtitle search could not be loaded.')
  const parsed = subtitleDiscoveryPageSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new Error('Subtitle search could not be loaded. Try again.')
  return parsed.data
}

export async function prepareSubtitle(searchId: string, candidateId: string, signal: AbortSignal): Promise<AggregatedSubtitle> {
  const response = await fetch('/v1/subtitles/discover/prepare', {
    method: 'POST', credentials: 'same-origin', signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ searchId, candidateId }),
  })
  if (!response.ok) throw new Error('This subtitle could not be prepared. Choose another track.')
  const parsed = subtitleTrackSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new Error('This subtitle could not be prepared. Choose another track.')
  return parsed.data
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
