import { z } from 'zod'
import type { FrameDiagnosticEvent, FrameDiagnostics, PlaybackRef } from '@consumit/contracts'

type Report = Omit<FrameDiagnosticEvent, 'browser'>
const identity = {
  tmdbId: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d{0,9}$/)]),
  mediaType: z.enum(['movie', 'tv']),
  season: z.number().int().min(0).max(100).nullable().optional(),
  episode: z.number().int().min(1).max(10000).nullable().optional(),
  anilist: z.number().int().positive().nullable().optional(),
}
const position = z.number().finite().min(0).max(86400)
const messages = z.discriminatedUnion('type', [
  z.strictObject({ ...identity, type: z.literal('vidrift:unpaused'), currentTime: position }),
  z.strictObject({ ...identity, type: z.literal('vidrift:paused'), currentTime: position }),
  z.strictObject({ ...identity, type: z.literal('vidrift:progress'), currentTime: position, duration: position.positive() }),
  z.strictObject({ ...identity, type: z.literal('vidrift:progress-ended') }),
  z.strictObject({ ...identity, type: z.literal('vidrift:wont-play'), reason: z.string().max(120) }),
  z.strictObject({ ...identity, type: z.literal('vidrift:unreleased'), airDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
])
const status = { 'vidrift:unpaused': 'playing', 'vidrift:paused': 'paused', 'vidrift:progress': 'progress', 'vidrift:progress-ended': 'ended', 'vidrift:wont-play': 'error', 'vidrift:unreleased': 'unavailable' } as const

/** Read-only VidRift public wrapper protocol reviewed with REA. Vixsrc's
 * nested forwarding and AniList binding remain unverified and unsupported.
 * Reports never control playback, resume, completion, progress or auto-next. */
export function createProviderFrameEvents({ src, providerId, ref, frameWindow, report, now = () => performance.now() }: {
  src: string; providerId: string; ref: PlaybackRef; frameWindow: () => Window | null;
  report: (event: Report) => void; now?: () => number;
}) {
  let active = true, lastAt = -Infinity, windowAt = now(), count = 0, progress = -1
  let url: URL
  try { url = new URL(src) } catch { return { receive() {}, close() {} } }
  const path = ref.kind === 'movie' ? `/embed/movie/${ref.id}` : ref.kind === 'series' ? `/embed/tv/${ref.id}/${ref.season}/${ref.episode}` : undefined
  const supported = providerId === 'vidriftframe' && url.origin === 'https://embed.vidrift.net' && !url.username && !url.password && path !== undefined && url.pathname === path
  return {
    receive(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>) {
      if (!active || !supported || !event.source || event.source !== frameWindow() || event.origin !== url.origin) return
      if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data) || Object.keys(event.data).length > 10) return
      const parsed = messages.safeParse(event.data)
      if (!parsed.success) return
      const message = parsed.data
      if (Number(message.tmdbId) !== ref.id || message.anilist != null) return
      if (ref.kind === 'movie' ? message.mediaType !== 'movie' || message.season != null || message.episode != null
        : message.mediaType !== 'tv' || message.season !== ref.season || message.episode !== ref.episode) return
      if (message.type === 'vidrift:progress' && (message.currentTime > message.duration || message.currentTime < progress)) return
      const at = now()
      if (!Number.isFinite(at) || at < lastAt || at - lastAt < 500) return
      if (at - windowAt >= 60_000) { windowAt = at; count = 0 }
      if (count >= 20) return
      count++; lastAt = at
      if (message.type === 'vidrift:progress') progress = message.currentTime
      report({ type: status[message.type] })
    },
    close() { active = false },
  }
}

function browser(): FrameDiagnosticEvent['browser'] {
  const ua = navigator.userAgent
  return /edg\//i.test(ua) ? 'edge' : /firefox\//i.test(ua) ? 'firefox' : /chrome\/|crios\//i.test(ua) ? 'chrome' : /safari\//i.test(ua) ? 'safari' : 'other'
}

/** Bounded disposable queue: discard on switching sources, never replay failures. */
export function createFrameDiagnostics(id: string, sourceId: string, send?: (batch: FrameDiagnostics) => void) {
  let pending: FrameDiagnosticEvent[] = [], active = true
  const family = browser()
  const flush = () => {
    if (!active || !pending.length) return
    const batch = { sourceId, events: pending.splice(0, 20) }
    if (send) send(batch)
    else void fetch(`/v1/playback/${id}/frame-diagnostics`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch), signal: AbortSignal.timeout(3000) }).catch(() => undefined)
  }
  const timer = setInterval(flush, 5000)
  return {
    push(event: Report) { if (active && pending.length < 20) pending.push({ ...event, browser: family }) },
    close() { active = false; clearInterval(timer); pending = [] },
  }
}
