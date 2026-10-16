import { z } from 'zod'
import { notificationPageSchema, notificationPreferencesSchema, releaseShelfSchema, watchHref, titleHref, type ReleaseEpisode } from '@consumit/contracts'

async function request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'include', cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) } })
  if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to see your episode updates.' : 'Episode updates are temporarily unavailable. Try again.')
  const parsed = schema.safeParse(response.status === 204 ? null : await response.json())
  if (!parsed.success) throw new Error('Episode updates could not be read. Try again.')
  return parsed.data
}
export const readReleases = (signal: AbortSignal) => request('/v1/me/releases', releaseShelfSchema, signal)
export const readNotificationPreferences = (signal: AbortSignal) => request('/v1/me/notification-preferences', notificationPreferencesSchema, signal)
export const readNotifications = (signal: AbortSignal, filter: 'all' | 'unread' = 'all', cursor?: string, limit = 20) =>
  request(`/v1/me/notifications?${new URLSearchParams({ filter, limit: String(limit), ...(cursor ? { cursor } : {}) })}`, notificationPageSchema, signal)
export async function markNotificationRead(id?: string, signal?: AbortSignal) {
  await request(id ? `/v1/me/notifications/${id}` : '/v1/me/notifications/read-all', z.null(), signal,
    { method: id ? 'PATCH' : 'POST', ...(id ? { body: JSON.stringify({ read: true }) } : {}) })
  window.dispatchEvent(new Event('consumit-notifications-changed'))
}
export async function setNotificationPreference(newEpisodes: boolean, signal?: AbortSignal) {
  const result = await request('/v1/me/notification-preferences', notificationPreferencesSchema, signal,
    { method: 'PATCH', body: JSON.stringify({ newEpisodes }) })
  window.dispatchEvent(new Event('consumit-notifications-changed'))
  return result
}
export function episodeDestination(episode: ReleaseEpisode, checkedOnly = false) {
  return checkedOnly && !episode.checkedAt ? `${titleHref(episode.ref)}#episodes`
    : watchHref(episode.ref, { season: episode.ref.season, episode: episode.ref.episode })
}
export function releaseDate(episode: ReleaseEpisode) {
  return new Date(episode.releasedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(episode.datePrecision === 'date' ? { timeZone: 'UTC' } : {}),
  })
}
export function episodeLabel(episode: ReleaseEpisode) {
  return episode.ref.kind === 'series' ? `Season ${episode.ref.season} · Episode ${episode.ref.episode}` : `Episode ${episode.ref.episode}`
}
