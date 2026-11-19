import { playbackProgressSchema, playbackRefSchema, type CatalogRef, type PlaybackProgress, type PlaybackRef, type ProgressWriteRequest, type EpisodeTrackingWrite } from '@consumit/contracts'

export const progressKey = (ref: PlaybackRef, memberId?: string) => `consumit.progress:${memberId ?? 'guest'}:${ref.kind}:${ref.id}:${ref.season ?? 0}:${ref.episode ?? 0}`

/** The title action needs the latest episode, while Watch reads an exact ref. */
export async function readTitleProgress(ref: CatalogRef, signal: AbortSignal, memberId?: string): Promise<PlaybackProgress | null> {
  let latest: PlaybackProgress | null = null
  try {
    const prefix = `consumit.progress:${memberId ?? 'guest'}:${ref.kind}:${ref.id}:`
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith(prefix)) continue
      try {
        const record = parseStoredProgress(localStorage.getItem(key))
        if (!record || !playbackRefSchema.safeParse(record).success || record.kind !== ref.kind || record.id !== ref.id || key !== progressKey(record, memberId)) continue
        if ((record.episodeTracking || record.completed || record.positionSeconds > 0) && (!latest || Date.parse(record.updatedAt) >= Date.parse(latest.updatedAt))) latest = record
      } catch { /* A malformed record must not hide other saved episodes. */ }
    }
  } catch { /* Storage denial keeps account progress available. */ }
  if (memberId) {
    try {
      const response = await fetch(`/v1/progress/${ref.kind}/${ref.id}`, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]) })
      if (response.ok && response.status !== 204) {
        const record = playbackProgressSchema.safeParse(await response.json())
        if (record.success && playbackRefSchema.safeParse(record.data).success && record.data.kind === ref.kind && record.data.id === ref.id && (!latest || Date.parse(record.data.updatedAt) > Date.parse(latest.updatedAt))) latest = record.data
      }
    } catch { /* An unavailable account read retains device progress. */ }
  }
  return latest
}

/**
 * Coalesced sync policy from STREAMING.md: members sync every 20-30 seconds
 * only after meaningful progress changes, plus pause, seek, completion, next
 * episode, and best-effort exit. Guests use the same cadence for local saves.
 */
export const PROGRESS_SYNC_INTERVAL_MS = 25_000
export const PROGRESS_MIN_DELTA_SECONDS = 2

export type ProgressCheckpoint = { position: number; completed: boolean }

export function hasMeaningfulProgressChange(previous: ProgressCheckpoint | undefined, next: ProgressCheckpoint) {
  if (!previous) return true
  return next.completed !== previous.completed || Math.abs(next.position - previous.position) >= PROGRESS_MIN_DELTA_SECONDS
}

const storedProgressSchema = playbackProgressSchema.extend({
  completed: playbackProgressSchema.shape.completed.default(false),
  durationSeconds: playbackProgressSchema.shape.durationSeconds.default(null),
  updatedAt: playbackProgressSchema.shape.updatedAt.default('1970-01-01T00:00:00.000Z'),
})

export function parseStoredProgress(raw: string | null): PlaybackProgress | null {
  const parsed = storedProgressSchema.safeParse(JSON.parse(raw ?? 'null'))
  return parsed.success ? parsed.data : null
}

function readStoredProgress(ref: PlaybackRef, memberId?: string) {
  try {
    const key = progressKey(ref, memberId)
    const row = parseStoredProgress(localStorage.getItem(key))
    return row && progressKey(row, memberId) === key ? row : null
  }
  catch { return null }
}

async function readAccountProgress(ref: PlaybackRef, signal: AbortSignal) {
  const params = new URLSearchParams()
  if (ref.season !== undefined) params.set('season', String(ref.season))
  if (ref.episode !== undefined) params.set('episode', String(ref.episode))
  try {
    const response = await fetch('/v1/progress/' + ref.kind + '/' + ref.id + '?' + params, {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
    })
    if (!response.ok || response.status === 204) return null
    const parsed = playbackProgressSchema.safeParse(await response.json())
    return parsed.success && progressKey(parsed.data) === progressKey(ref) ? parsed.data : null
  } catch { return null }
}

export async function readPlaybackProgress(ref: PlaybackRef, signal: AbortSignal, memberId?: string) {
  const record = (memberId ? await readAccountProgress(ref, signal) : null) ?? readStoredProgress(ref, memberId)
  return record && !record.completed ? record.positionSeconds : 0
}

export async function readEpisodeTracking(ref: PlaybackRef, signal: AbortSignal, memberId?: string) {
  const account = memberId ? await readAccountProgress(ref, signal) : null
  const local = readStoredProgress(ref, memberId)
  return local && (!account || local.updatedAt > account.updatedAt) ? local.episodeTracking : account?.episodeTracking
}

export const EPISODE_TRACKING_EVENT = 'consumit-episode-tracking'

function notifyEpisodeTracking() {
  window.dispatchEvent(new Event('consumit-progress'))
  window.dispatchEvent(new Event(EPISODE_TRACKING_EVENT))
}

export async function writeEpisodeTracking(input: EpisodeTrackingWrite, memberId?: string): Promise<'account' | 'device'> {
  const key = progressKey(input, memberId)
  const current = readStoredProgress(input, memberId)
  const saved = JSON.stringify({
    ...input, completed: current?.completed ?? false, positionSeconds: current?.positionSeconds ?? 0,
    durationSeconds: current?.durationSeconds ?? null, updatedAt: new Date().toISOString(),
  })
  let savedOnDevice = false
  try { localStorage.setItem(key, saved); savedOnDevice = true } catch { /* Account storage is still available. */ }
  if (savedOnDevice) notifyEpisodeTracking()
  if (memberId) {
    try {
      const response = await fetch('/v1/progress/episode', {
        method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input), signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        const row = playbackProgressSchema.parse(await response.json())
        if (progressKey(row, memberId) !== key || row.episodeTracking !== input.episodeTracking) throw new Error('Unexpected episode record.')
        try {
          // Keep any checkpoint written after this action started.
          if (!savedOnDevice || localStorage.getItem(key) === saved) localStorage.setItem(key, JSON.stringify(row))
        } catch { /* The account save already succeeded. */ }
        notifyEpisodeTracking()
        return 'account'
      }
    } catch { /* The device can retain this choice until the member retries. */ }
  }
  if (savedOnDevice) return 'device'
  throw new Error('This episode could not be saved.')
}

export async function writePlaybackProgress(ref: PlaybackRef, position: number, duration: number, completed: boolean, memberId?: string, keepalive = false, completionId?: string) {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || (!completed && duration < 1)) return
  const payload: ProgressWriteRequest = {
    ...ref,
    positionSeconds: Math.floor(Math.min(duration > 0 ? duration : 86400, 86400, Math.max(0, position))),
    ...(duration >= 1 ? { durationSeconds: Math.floor(Math.min(86400, duration)) } : {}),
    completed,
    ...(completed && completionId ? { completionId } : {}),
  }
  const episodeTracking = completed ? undefined : readStoredProgress(ref, memberId)?.episodeTracking
  try { localStorage.setItem(progressKey(ref, memberId), JSON.stringify({ ...payload, episodeTracking, updatedAt: new Date().toISOString() })) } catch { /* Storage denial must not interrupt playback. */ }
  window.dispatchEvent(new Event('consumit-progress'))
  if (!memberId) return
  const response = await fetch('/v1/progress', { method: 'PUT', body: JSON.stringify(payload), credentials: 'same-origin', headers: { 'content-type': 'application/json' }, keepalive, signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error('Progress is saved on this device. Account sync will retry.')
}
