import { subtitlesResponseSchema } from '@consumit/contracts'

export type AggregatedSubtitle = { id: string; label: string; language: string; url: string }

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
