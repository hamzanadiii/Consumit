import { apiErrorResponseSchema, playbackProviderListSchema, playbackSessionSchema, type PlaybackFailureRequest, type PlaybackProvider, type PlaybackSession, type PlaybackSwitchRequest, type ResolvePlaybackRequest } from '@consumit/contracts'

export async function playbackRequest(path: string, body: ResolvePlaybackRequest | PlaybackFailureRequest, signal: AbortSignal): Promise<PlaybackSession> {
  const response = await fetch(`/v1/playback/${path}`, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    // The resolver runs an 8s deadline plus a 500ms subtitle-settle window, so
    // a 9s browser abort raced successful late answers and surfaced as flaky
    // "No compatible source" after a while on slow upstreams. Give resolve and
    // recovery headroom without changing the server-side bound.
    body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(path === 'resolve' ? 15000 : 12000)]),
  })
  if (!response.ok) {
    const result = apiErrorResponseSchema.safeParse(await response.json().catch(() => null))
    throw new Error(result.success ? result.data.error.message : 'Playback is temporarily unavailable. Try again.')
  }
  const parsed = playbackSessionSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error('Playback returned an invalid source. Try again.')
  return parsed.data
}

export async function listPlaybackProviders(body: ResolvePlaybackRequest, signal: AbortSignal): Promise<PlaybackProvider[]> {
  const response = await fetch('/v1/playback/providers', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
  })
  if (!response.ok) throw new Error('Server list is unavailable right now.')
  const parsed = playbackProviderListSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error('Server list is unavailable right now.')
  return parsed.data.providers
}

export async function switchPlaybackProvider(sessionId: string, body: PlaybackSwitchRequest, signal: AbortSignal): Promise<PlaybackSession> {
  const response = await fetch(`/v1/playback/${sessionId}/switch`, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
  })
  if (!response.ok) {
    const result = apiErrorResponseSchema.safeParse(await response.json().catch(() => null))
    throw new Error(result.success ? result.data.error.message : 'Playback is temporarily unavailable. Try again.')
  }
  const parsed = playbackSessionSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error('Playback returned an invalid source. Try again.')
  return parsed.data
}

export function playbackCapabilities() {
  const video = document.createElement('video')
  const nativeHls = Boolean(video.canPlayType('application/vnd.apple.mpegurl'))
  const mse = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"')
  const viewportHeight = Math.max(window.screen?.height ?? 0, window.screen?.width ?? 0, window.innerHeight, window.innerWidth)
  const maxHeight = Math.min(4320, Math.max(240, Math.ceil(viewportHeight * Math.min(window.devicePixelRatio || 1, 2))))
  return { nativeHls, hls: nativeHls || mse, dash: mse, native: Boolean(video.canPlayType('video/mp4; codecs="avc1.42E01E"')), maxHeight }
}
