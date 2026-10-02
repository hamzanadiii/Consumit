import { playbackProgressSchema, progressWriteRequestSchema, type PlaybackRef, type ProgressWriteRequest } from '@consumit/contracts'

export const progressKey = (ref: PlaybackRef, memberId?: string) => `consumit.progress:${memberId ?? 'guest'}:${ref.kind}:${ref.id}:${ref.season ?? 0}:${ref.episode ?? 0}`

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
  if (!memberId) return
  const response = await fetch('/v1/progress', { method: 'PUT', body: JSON.stringify(payload), credentials: 'same-origin', headers: { 'content-type': 'application/json' }, keepalive, signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error('Progress is saved on this device. Account sync will retry.')
}
