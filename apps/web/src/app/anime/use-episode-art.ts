'use client'

import { useEffect, useState } from 'react'

import { browserAnimeEpisode } from '@/lib/anime-browser'

export type EpisodeArt = {
  title: string | null
  synopsis: string | null
  thumbnail: string | null
}

/** Canonical episode art with the honest fallback chain: caller-supplied
 *  streaming art wins (zero extra requests); otherwise the episode endpoint
 *  (TMDB primary, Kitsu fallback server-side) fills titles and stills;
 *  misses stay null and the card keeps its placeholder. Skipped for
 *  unaired episodes, which can have no art yet. */
export function useEpisodeArt(anilistId: number, episode: number, options: { covered?: boolean | undefined; upcoming?: boolean | undefined } = {}): EpisodeArt | null {
  const { covered = false, upcoming = false } = options
  const [result, setResult] = useState<{ key: string; art: EpisodeArt } | null>(null)
  const key = `${anilistId}:${episode}`
  useEffect(() => {
    if (covered || upcoming) return
    let active = true
    let retry: ReturnType<typeof setTimeout> | undefined
    const load = (attempt: number) => {
      void browserAnimeEpisode(anilistId, episode, AbortSignal.timeout(8_000)).then(
        (detail) => {
          if (!active) return
          if (detail) {
            setResult({ key, art: { title: detail.title, thumbnail: detail.thumbnail, synopsis: detail.description } })
          } else if (attempt === 0) {
            // One delayed retry: API restarts and cold rate-limit bursts
            // fail the first wave and placeholders would otherwise stick
            // until the next navigation.
            retry = setTimeout(() => { if (active) load(1) }, 3_000)
          }
        },
        () => {
          if (active && attempt === 0) retry = setTimeout(() => { if (active) load(1) }, 3_000)
        },
      )
    }
    load(0)
    return () => {
      active = false
      clearTimeout(retry)
    }
  }, [anilistId, episode, covered, upcoming, key])
  return !covered && !upcoming && result?.key === key ? result.art : null
}
