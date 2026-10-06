import { apiErrorResponseSchema, playbackProviderListSchema, playbackSessionSchema, separateAudioListSchema, separateAudioSourceSchema, type PlaybackFailureRequest, type PlaybackProvider, type PlaybackSession, type PlaybackSwitchRequest, type ResolvePlaybackRequest } from '@consumit/contracts'

async function audioRequest(session: PlaybackSession, action: 'audio' | 'audio/prepare', signal: AbortSignal, trackId?: string) {
  const response = await fetch(`/v1/playback/${session.id}/${action}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceId: session.source.id, ...(trackId ? { trackId } : {}) }), signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) })
  if (!response.ok) throw new Error('Added audio is unavailable right now.')
  return response.json()
}
export async function listSeparateAudio(session: PlaybackSession, signal: AbortSignal) { return separateAudioListSchema.parse(await audioRequest(session, 'audio', signal)).tracks }
export async function prepareSeparateAudio(session: PlaybackSession, id: string, signal: AbortSignal) { return separateAudioSourceSchema.parse(await audioRequest(session, 'audio/prepare', signal, id)) }

export async function playbackRequest(path: string, body: ResolvePlaybackRequest | PlaybackFailureRequest, signal: AbortSignal): Promise<PlaybackSession> {
  // A dev or edge proxy can reset an idle upstream connection before the API
  // receives the request. Resolve is safe to replay once; recovery actions
  // are stateful and must not be replayed by this layer.
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(65000)])
  let response: Response
  for (let attempt = 0;; attempt++) {
    try {
      response = await fetch(`/v1/playback/${path}`, {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: deadline,
      })
    } catch (error) {
      if (path !== 'resolve' || attempt > 0 || deadline.aborted) throw error
      continue
    }
    if (path === 'resolve' && attempt === 0 && response.status >= 500 &&
        !response.headers.get('content-type')?.includes('application/json') && !deadline.aborted) continue
    break
  }
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
    body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(65000)]),
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
