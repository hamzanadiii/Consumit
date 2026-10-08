import { playbackProgressSchema, playbackRefSchema, progressWriteRequestSchema, type CatalogRef, type PlaybackProgress, type PlaybackRef, type ProgressWriteRequest } from '@consumit/contracts'

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
        const raw = JSON.parse(localStorage.getItem(key) ?? 'null')
        const parsed = progressWriteRequestSchema.safeParse(raw)
        if (!parsed.success || !playbackRefSchema.safeParse(parsed.data).success || parsed.data.kind !== ref.kind || parsed.data.id !== ref.id || key !== progressKey(parsed.data, memberId)) continue
        const record = playbackProgressSchema.safeParse({ ...parsed.data, completed: parsed.data.completed ?? false, durationSeconds: parsed.data.durationSeconds ?? null, updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '1970-01-01T00:00:00.000Z' })
        if (record.success && (record.data.completed || record.data.positionSeconds > 0) && (!latest || Date.parse(record.data.updatedAt) >= Date.parse(latest.updatedAt))) latest = record.data
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

export async function readPlaybackProgress(ref: PlaybackRef, signal: AbortSignal, memberId?: string) {
  if (memberId) {
    try {
      const params = new URLSearchParams()
      if (ref.season !== undefined) params.set('season', String(ref.season))
      if (ref.episode !== undefined) params.set('episode', String(ref.episode))
      const response = await fetch(`/v1/progress/${ref.kind}/${ref.id}?${params}`, { credentials: 'same-origin', signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]) })
      if (response.status === 204) return readLocalProgress(ref, memberId)
      const parsed = playbackProgressSchema.safeParse(await response.json().catch(() => null))
      if (response.ok && parsed.success) return parsed.data.completed ? 0 : parsed.data.positionSeconds
    } catch { /* Fall back to this member's local unsynchronized progress. */ }
  }
  return readLocalProgress(ref, memberId)
}

function readLocalProgress(ref: PlaybackRef, memberId?: string) {
  try {
    const parsed = progressWriteRequestSchema.safeParse(JSON.parse(localStorage.getItem(progressKey(ref, memberId)) ?? 'null'))
    return parsed.success && !parsed.data.completed ? parsed.data.positionSeconds : 0
  } catch { return 0 }
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
  try { localStorage.setItem(progressKey(ref, memberId), JSON.stringify({ ...payload, updatedAt: new Date().toISOString() })) } catch { /* Storage denial must not interrupt playback. */ }
  window.dispatchEvent(new Event('consumit-progress'))
  if (!memberId) return
  const response = await fetch('/v1/progress', { method: 'PUT', body: JSON.stringify(payload), credentials: 'same-origin', headers: { 'content-type': 'application/json' }, keepalive, signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error('Progress is saved on this device. Account sync will retry.')
}
