import { continueWatchingPageSchema, playbackProgressSchema, progressWriteRequestSchema, watchHref, type CatalogRef, type PlaybackProgress } from '@consumit/contracts'
import { progressKey } from './playback-progress'
import { browserAnimeEpisode } from './anime-browser'
import { browserCatalogSeason, browserCatalogTitle } from './catalog-browser'

const titleKey = (ref: CatalogRef) => `${ref.kind}:${ref.id}`
const hiddenKey = (memberId?: string) => `consumit.continue-hidden:${memberId ?? 'guest'}`
export function readOwnedProgress(memberId?: string): PlaybackProgress[] {
  const rows: PlaybackProgress[] = []
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith(`consumit.progress:${memberId ?? 'guest'}:`)) continue
      try {
        const raw = JSON.parse(localStorage.getItem(key) ?? 'null'), parsed = progressWriteRequestSchema.safeParse(raw)
        if (!parsed.success || key !== progressKey(parsed.data, memberId)) continue
        const record = playbackProgressSchema.safeParse({ ...parsed.data, completed: parsed.data.completed ?? false, durationSeconds: parsed.data.durationSeconds ?? null, updatedAt: raw.updatedAt ?? '1970-01-01T00:00:00.000Z' })
        if (record.success) rows.push(record.data)
      } catch { /* One corrupt record never hides other titles. */ }
    }
  } catch { /* Account progress remains available without storage. */ }
  return rows
}
export type ResumeEntry = CatalogRef & { durationSeconds: number | null; episode?: number | undefined; season?: number | undefined; positionSeconds: number; percent: number; storageKey: string; updatedAt: number; href: string }
export async function loadResumeEntries(memberId?: string, signal?: AbortSignal): Promise<ResumeEntry[]> {
  const latest = new Map<string, PlaybackProgress>(), hidden = new Map<string, number>()
  try { for (const [key, at] of Object.entries(JSON.parse(localStorage.getItem(hiddenKey(memberId)) ?? '{}'))) if (typeof at === 'number') hidden.set(key, at) } catch { /* Storage is optional. */ }
  const add = (row: PlaybackProgress) => { const key = titleKey(row); if (!latest.has(key) || Date.parse(latest.get(key)!.updatedAt) < Date.parse(row.updatedAt)) latest.set(key, row) }
  readOwnedProgress(memberId).forEach(add)
  if (memberId) {
    let cursor: string | null = null
    for (let page = 0; page < 5; page++) {
      try {
        const params = new URLSearchParams({ limit: '50', ...(cursor ? { cursor } : {}) })
        const response = await fetch(`/v1/me/continue-watching?${params}`, { credentials: 'same-origin', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4000)]) : AbortSignal.timeout(4000) })
        if (!response.ok) break
        const result = continueWatchingPageSchema.parse(await response.json())
        for (const row of result.items) { add(row); if (row.hiddenAt) hidden.set(titleKey(row), Math.max(hidden.get(titleKey(row)) ?? 0, Date.parse(row.hiddenAt))) }
        cursor = result.nextCursor
        if (!cursor) break
      } catch { break }
    }
  }
  const rows = [...latest.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).filter(row => (hidden.get(titleKey(row)) ?? -1) < Date.parse(row.updatedAt)).slice(0, 40)
  const output: ResumeEntry[] = []
  let index = 0
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
    while (index < rows.length && !signal?.aborted) {
      const row = rows[index++]!
      const finished = row.completed || Boolean(row.durationSeconds && row.positionSeconds / row.durationSeconds >= .95)
      let episode = row.episode, season = row.season, positionSeconds = row.positionSeconds, durationSeconds = row.durationSeconds
      if (finished) {
        try {
          if (row.kind === 'movie') continue
          if (row.kind === 'anime') {
            const next = await browserAnimeEpisode(row.id, (episode ?? 1) + 1, signal)
            if (!next?.airDate || next.airDate > new Date().toISOString().slice(0, 10)) continue
            episode = next.number
          } else {
            const detail = await browserCatalogTitle(row, signal)
            if (detail.kind !== 'series') continue
            const current = detail.seasons.find(item => item.number === (season ?? 1))
            const nextSeason = detail.seasons.filter(item => item.number > (season ?? 1) && item.episodeCount > 0).sort((a, b) => a.number - b.number)[0]
            if (current && (episode ?? 1) < current.episodeCount) episode = (episode ?? 1) + 1
            else if (nextSeason) { season = nextSeason.number; episode = 1 } else continue
            const next = (await browserCatalogSeason(row.id, season ?? 1, signal)).item.episodes.find(item => item.episodeNumber === episode)
            if (!next?.airDate || next.airDate > new Date().toISOString().slice(0, 10)) continue
          }
          positionSeconds = 0; durationSeconds = null
        } catch { continue }
      } else if (positionSeconds < 60) continue
      output.push({ kind: row.kind, id: row.id, episode, season, positionSeconds, durationSeconds, percent: durationSeconds ? Math.min(99, Math.round(positionSeconds / durationSeconds * 100)) : 0, storageKey: progressKey(row, memberId), updatedAt: Date.parse(row.updatedAt), href: watchHref(row, { episode: episode ?? 1, season: season ?? 1 }) })
    }
  }))
  return output.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20)
}
export async function hideResumeEntry(ref: CatalogRef, memberId?: string) {
  const at = Date.now(), key = hiddenKey(memberId)
  try { const hidden = JSON.parse(localStorage.getItem(key) ?? '{}'); hidden[titleKey(ref)] = at; localStorage.setItem(key, JSON.stringify(hidden)) } catch { if (!memberId) throw new Error('This device could not keep the hidden title.') }
  if (memberId) {
    const response = await fetch('/v1/me/continue-watching/hide', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: ref.kind, id: ref.id }), signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error('Hidden on this device. Account sync could not finish.')
  }
  window.dispatchEvent(new Event('consumit-progress'))
}
